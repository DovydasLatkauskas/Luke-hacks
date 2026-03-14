using System.Security.Cryptography;
using System.Text.Json;
using luke_hacks.Data;
using luke_hacks.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace luke_hacks.Services;

public sealed class CollaborativePlanningService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true,
    };
    private static readonly SemaphoreSlim StartLock = new(1, 1);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly RoundtableEngineClient _roundtableEngineClient;
    private readonly ILogger<CollaborativePlanningService> _logger;

    public CollaborativePlanningService(
        IServiceScopeFactory scopeFactory,
        RoundtableEngineClient roundtableEngineClient,
        ILogger<CollaborativePlanningService> logger)
    {
        _scopeFactory = scopeFactory;
        _roundtableEngineClient = roundtableEngineClient;
        _logger = logger;
    }

    public async Task<CollaborativePlanningChatResponse> CreateChatAsync(
        string userId,
        string? userEmail,
        CreateCollaborativePlanningChatRequest request,
        CancellationToken cancellationToken)
    {
        var expectedCount = Math.Clamp(request.ExpectedParticipantCount, 2, 12);
        var timeoutSeconds = Math.Clamp(request.JoinTimeoutSeconds, 30, 1800);

        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var chat = new CollaborativePlanningChat
        {
            InviteToken = GenerateInviteToken(),
            Title = request.Title?.Trim(),
            CreatedByUserId = userId,
            ExpectedParticipantCount = expectedCount,
            JoinDeadlineUtc = DateTime.UtcNow.AddSeconds(timeoutSeconds),
        };

        chat.Participants.Add(new CollaborativePlanningParticipant
        {
            UserId = userId,
            DisplayName = userEmail,
        });

        dbContext.CollaborativePlanningChats.Add(chat);
        await dbContext.SaveChangesAsync(cancellationToken);

        return await ToResponseAsync(dbContext, chat.Id, userId, cancellationToken)
            ?? throw new InvalidOperationException("Chat was created but could not be loaded.");
    }

    public async Task<CollaborativePlanningChatResponse> JoinByInviteAsync(
        string inviteToken,
        string userId,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var chat = await dbContext.CollaborativePlanningChats
            .Include(current => current.Participants)
            .FirstOrDefaultAsync(current => current.InviteToken == inviteToken, cancellationToken);

        if (chat is null)
        {
            throw new KeyNotFoundException("Invite link is invalid or expired.");
        }

        if (chat.Status != CollaborativePlanningStatus.WaitingForConstraints)
        {
            throw new InvalidOperationException("This room has already started negotiation.");
        }

        var existing = chat.Participants.FirstOrDefault(participant => participant.UserId == userId);
        if (existing is null)
        {
            chat.Participants.Add(new CollaborativePlanningParticipant
            {
                UserId = userId,
                DisplayName = userEmail,
            });
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return await ToResponseAsync(dbContext, chat.Id, userId, cancellationToken)
            ?? throw new InvalidOperationException("Room could not be loaded after join.");
    }

    public async Task<CollaborativePlanningChatResponse> SubmitConstraintsAsync(
        Guid chatId,
        string userId,
        SubmitCollaborativePlanningConstraintsRequest request,
        CancellationToken cancellationToken)
    {
        using (var scope = _scopeFactory.CreateScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            var chat = await dbContext.CollaborativePlanningChats
                .Include(current => current.Participants)
                .FirstOrDefaultAsync(current => current.Id == chatId, cancellationToken);

            if (chat is null)
            {
                throw new KeyNotFoundException("Collaborative room was not found.");
            }

            var participant = chat.Participants.FirstOrDefault(current => current.UserId == userId);
            if (participant is null)
            {
                throw new UnauthorizedAccessException("You are not a member of this room.");
            }

            if (chat.Status != CollaborativePlanningStatus.WaitingForConstraints)
            {
                throw new InvalidOperationException("Constraints can no longer be edited for this room.");
            }

            var normalized = NormalizeConstraints(request);
            var now = DateTime.UtcNow;
            var constraintsJson = JsonSerializer.Serialize(normalized, JsonOptions);
            var updatedRows = await dbContext.CollaborativePlanningParticipants
                .Where(current => current.ChatId == chatId && current.UserId == userId)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(current => current.DisplayName, normalized.Name)
                    .SetProperty(current => current.ConstraintsJson, constraintsJson)
                    .SetProperty(current => current.ConstraintsSubmittedAtUtc, now), cancellationToken);

            if (updatedRows == 0)
            {
                throw new InvalidOperationException("Could not persist submitted constraints. Please retry.");
            }
        }

        await TryStartChatAsync(chatId, cancellationToken);

        using var reloadScope = _scopeFactory.CreateScope();
        var reloadDb = reloadScope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await ToResponseAsync(reloadDb, chatId, userId, cancellationToken)
            ?? throw new InvalidOperationException("Room could not be loaded after constraints submission.");
    }

    public async Task<CollaborativePlanningChatResponse> GetChatAsync(
        Guid chatId,
        string userId,
        CancellationToken cancellationToken)
    {
        await TryStartChatAsync(chatId, cancellationToken);

        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var response = await ToResponseAsync(dbContext, chatId, userId, cancellationToken);
        if (response is null)
        {
            throw new KeyNotFoundException("Collaborative room was not found.");
        }

        return response;
    }

    public async Task SubmitVetoAsync(
        Guid chatId,
        string userId,
        string reason,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(reason))
        {
            throw new InvalidOperationException("Veto reason is required.");
        }

        string roundtableSessionId;
        long skipCount;

        using (var scope = _scopeFactory.CreateScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var chat = await dbContext.CollaborativePlanningChats
                .Include(current => current.Participants)
                .FirstOrDefaultAsync(current => current.Id == chatId, cancellationToken);

            if (chat is null)
            {
                throw new KeyNotFoundException("Collaborative room was not found.");
            }

            if (!chat.Participants.Any(participant => participant.UserId == userId))
            {
                throw new UnauthorizedAccessException("You are not a member of this room.");
            }

            if (string.IsNullOrWhiteSpace(chat.RoundtableSessionId))
            {
                throw new InvalidOperationException("Negotiation session is not active.");
            }

            roundtableSessionId = chat.RoundtableSessionId;
            skipCount = await dbContext.CollaborativePlanningEvents
                .LongCountAsync(evt => evt.ChatId == chat.Id, cancellationToken);
        }

        await _roundtableEngineClient.SubmitVetoAsync(roundtableSessionId, userId, reason.Trim(), cancellationToken);

        using (var scope = _scopeFactory.CreateScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var chat = await dbContext.CollaborativePlanningChats
                .FirstOrDefaultAsync(current => current.Id == chatId, cancellationToken);
            if (chat is not null)
            {
                chat.Status = CollaborativePlanningStatus.Negotiating;
                chat.CompletedAtUtc = null;
                await dbContext.SaveChangesAsync(cancellationToken);
            }
        }

        StartEventIngestion(chatId, roundtableSessionId, skipCount);
    }

    public async Task StartEligibleChatsAsync(CancellationToken cancellationToken)
    {
        List<Guid> candidateIds;
        using (var scope = _scopeFactory.CreateScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            candidateIds = await dbContext.CollaborativePlanningChats
                .Where(chat => chat.Status == CollaborativePlanningStatus.WaitingForConstraints)
                .Select(chat => chat.Id)
                .ToListAsync(cancellationToken);
        }

        foreach (var chatId in candidateIds)
        {
            await TryStartChatAsync(chatId, cancellationToken);
        }
    }

    private async Task TryStartChatAsync(Guid chatId, CancellationToken cancellationToken)
    {
        await StartLock.WaitAsync(cancellationToken);
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var chat = await dbContext.CollaborativePlanningChats
                .Include(current => current.Participants)
                .FirstOrDefaultAsync(current => current.Id == chatId, cancellationToken);

            if (chat is null || chat.Status != CollaborativePlanningStatus.WaitingForConstraints)
            {
                return;
            }

            var now = DateTime.UtcNow;
            var submittedParticipants = chat.Participants
                .Where(participant => participant.ConstraintsSubmittedAtUtc is not null)
                .ToList();

            var allSubmitted = submittedParticipants.Count >= chat.ExpectedParticipantCount;
            var timeoutReached = now >= chat.JoinDeadlineUtc;

            if (!allSubmitted && !timeoutReached)
            {
                return;
            }

            if (submittedParticipants.Count < 2)
            {
                chat.Status = CollaborativePlanningStatus.Failed;
                chat.CompletedAtUtc = now;
                chat.FailureReason = "Room timeout reached before at least two people submitted constraints.";
                dbContext.CollaborativePlanningEvents.Add(new CollaborativePlanningEvent
                {
                    ChatId = chat.Id,
                    EventType = "error",
                    PayloadJson = JsonSerializer.Serialize(new
                    {
                        message = chat.FailureReason,
                    }, JsonOptions),
                });
                await dbContext.SaveChangesAsync(cancellationToken);
                return;
            }

            var constraintsByParticipant = submittedParticipants
                .Select(participant =>
                {
                    var parsed = DeserializeConstraints(participant.ConstraintsJson);
                    return new
                    {
                        participant.UserId,
                        Constraints = parsed,
                    };
                })
                .Where(current => current.Constraints is not null)
                .ToList();

            if (constraintsByParticipant.Count < 2)
            {
                chat.Status = CollaborativePlanningStatus.Failed;
                chat.CompletedAtUtc = now;
                chat.FailureReason = "Room does not have enough valid constraints to start.";
                await dbContext.SaveChangesAsync(cancellationToken);
                return;
            }

            try
            {
                chat.Status = CollaborativePlanningStatus.Negotiating;
                chat.StartedAtUtc = now;
                await dbContext.SaveChangesAsync(cancellationToken);

                var roundtableSessionId = await _roundtableEngineClient
                    .CreateSessionAsync(constraintsByParticipant.Count, cancellationToken);

                foreach (var participant in constraintsByParticipant)
                {
                    await _roundtableEngineClient.JoinSessionAsync(
                        roundtableSessionId,
                        participant.UserId,
                        participant.Constraints!,
                        cancellationToken);
                }

                chat.RoundtableSessionId = roundtableSessionId;
                await dbContext.SaveChangesAsync(cancellationToken);

                StartEventIngestion(chat.Id, roundtableSessionId, skipCount: 0);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed starting collaborative planning chat {ChatId}", chat.Id);
                chat.Status = CollaborativePlanningStatus.Failed;
                chat.CompletedAtUtc = DateTime.UtcNow;
                chat.FailureReason = "Failed to start the AI negotiation service.";
                dbContext.CollaborativePlanningEvents.Add(new CollaborativePlanningEvent
                {
                    ChatId = chat.Id,
                    EventType = "error",
                    PayloadJson = JsonSerializer.Serialize(new
                    {
                        message = chat.FailureReason,
                    }, JsonOptions),
                });
                await dbContext.SaveChangesAsync(cancellationToken);
            }
        }
        finally
        {
            StartLock.Release();
        }
    }

    private void StartEventIngestion(Guid chatId, string roundtableSessionId, long skipCount)
    {
        _ = Task.Run(
            () => IngestEventsAsync(chatId, roundtableSessionId, skipCount),
            CancellationToken.None);
    }

    private async Task IngestEventsAsync(Guid chatId, string roundtableSessionId, long skipCount)
    {
        long skipped = 0;
        var sawResult = false;

        try
        {
            await foreach (var evt in _roundtableEngineClient.StreamSessionAsync(
                               roundtableSessionId,
                               $"observer-{chatId:N}",
                               CancellationToken.None))
            {
                if (skipped < skipCount)
                {
                    skipped++;
                    continue;
                }

                using var scope = _scopeFactory.CreateScope();
                var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var chat = await dbContext.CollaborativePlanningChats
                    .FirstOrDefaultAsync(current => current.Id == chatId);

                if (chat is null)
                {
                    return;
                }

                dbContext.CollaborativePlanningEvents.Add(new CollaborativePlanningEvent
                {
                    ChatId = chat.Id,
                    EventType = evt.EventType,
                    PayloadJson = evt.DataJson,
                });

                if (evt.EventType == "result")
                {
                    sawResult = true;
                    chat.Status = CollaborativePlanningStatus.Completed;
                    chat.CompletedAtUtc = DateTime.UtcNow;
                    chat.FinalItineraryJson = ExtractItineraryJson(evt.DataJson);
                }

                await dbContext.SaveChangesAsync();
            }

            if (!sawResult)
            {
                using var scope = _scopeFactory.CreateScope();
                var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var chat = await dbContext.CollaborativePlanningChats
                    .FirstOrDefaultAsync(current => current.Id == chatId);
                if (chat is not null && chat.Status == CollaborativePlanningStatus.Negotiating)
                {
                    chat.Status = CollaborativePlanningStatus.Failed;
                    chat.CompletedAtUtc = DateTime.UtcNow;
                    chat.FailureReason ??= "Negotiation stream ended without a final result.";
                    await dbContext.SaveChangesAsync();
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed ingesting collaborative planning events for chat {ChatId}", chatId);

            using var scope = _scopeFactory.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var chat = await dbContext.CollaborativePlanningChats
                .FirstOrDefaultAsync(current => current.Id == chatId);
            if (chat is not null)
            {
                chat.Status = CollaborativePlanningStatus.Failed;
                chat.CompletedAtUtc = DateTime.UtcNow;
                chat.FailureReason = "Negotiation stream disconnected unexpectedly.";
                dbContext.CollaborativePlanningEvents.Add(new CollaborativePlanningEvent
                {
                    ChatId = chat.Id,
                    EventType = "error",
                    PayloadJson = JsonSerializer.Serialize(new
                    {
                        message = chat.FailureReason,
                    }, JsonOptions),
                });
                await dbContext.SaveChangesAsync();
            }
        }
    }

    private static CollaborativePlanningConstraints NormalizeConstraints(SubmitCollaborativePlanningConstraintsRequest request)
    {
        var budget = request.Budget.Trim().ToLowerInvariant();
        if (budget is not ("budget" or "mid" or "splurge"))
        {
            budget = "mid";
        }

        return new CollaborativePlanningConstraints(
            string.IsNullOrWhiteSpace(request.Name) ? "Guest" : request.Name.Trim(),
            budget,
            request.Dietary.Trim(),
            string.IsNullOrWhiteSpace(request.Location) ? "New Town" : request.Location.Trim(),
            string.IsNullOrWhiteSpace(request.Mood) ? "lively" : request.Mood.Trim(),
            string.IsNullOrWhiteSpace(request.Time) ? "mid evening (8–10pm)" : request.Time.Trim());
    }

    private static CollaborativePlanningConstraints? DeserializeConstraints(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        return JsonSerializer.Deserialize<CollaborativePlanningConstraints>(json, JsonOptions);
    }

    private static string ExtractItineraryJson(string resultPayloadJson)
    {
        try
        {
            using var doc = JsonDocument.Parse(resultPayloadJson);
            if (doc.RootElement.TryGetProperty("itinerary", out var itinerary))
            {
                return itinerary.GetRawText();
            }
        }
        catch
        {
            // Fall back to raw payload.
        }

        return resultPayloadJson;
    }

    private static string GenerateInviteToken()
    {
        Span<byte> buffer = stackalloc byte[18];
        RandomNumberGenerator.Fill(buffer);
        return Convert.ToBase64String(buffer)
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('=');
    }

    private static string BuildInvitePath(string inviteToken) => $"/roundtable?invite={inviteToken}";

    private static async Task<CollaborativePlanningChatResponse?> ToResponseAsync(
        AppDbContext dbContext,
        Guid chatId,
        string requestingUserId,
        CancellationToken cancellationToken)
    {
        var chat = await dbContext.CollaborativePlanningChats
            .Include(current => current.Participants)
            .FirstOrDefaultAsync(current => current.Id == chatId, cancellationToken);

        if (chat is null)
        {
            return null;
        }

        if (!chat.Participants.Any(participant => participant.UserId == requestingUserId))
        {
            throw new UnauthorizedAccessException("You are not a member of this room.");
        }

        var userIds = chat.Participants.Select(participant => participant.UserId).Distinct().ToList();
        var emailsByUserId = await dbContext.Users
            .Where(user => userIds.Contains(user.Id))
            .Select(user => new { user.Id, user.Email })
            .ToDictionaryAsync(current => current.Id, current => current.Email, cancellationToken);

        var submittedCount = chat.Participants.Count(participant => participant.ConstraintsSubmittedAtUtc is not null);
        var waitingFor = Math.Max(0, chat.ExpectedParticipantCount - submittedCount);

        var participants = chat.Participants
            .OrderBy(participant => participant.JoinedAtUtc)
            .Select(participant => new CollaborativePlanningParticipantResponse(
                participant.UserId,
                emailsByUserId.GetValueOrDefault(participant.UserId),
                participant.DisplayName,
                participant.ConstraintsSubmittedAtUtc is not null,
                participant.JoinedAtUtc,
                participant.ConstraintsSubmittedAtUtc))
            .ToList();

        return new CollaborativePlanningChatResponse(
            chat.Id,
            chat.InviteToken,
            BuildInvitePath(chat.InviteToken),
            chat.Status,
            chat.Title,
            chat.ExpectedParticipantCount,
            chat.Participants.Count,
            submittedCount,
            waitingFor,
            chat.CreatedAtUtc,
            chat.JoinDeadlineUtc,
            chat.StartedAtUtc,
            chat.CompletedAtUtc,
            chat.RoundtableSessionId,
            chat.FinalItineraryJson,
            chat.FailureReason,
            participants);
    }
}
