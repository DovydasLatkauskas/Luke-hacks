using System.IO;
using System.Security.Claims;
using luke_hacks.Configuration;
using luke_hacks.Data;
using luke_hacks.Models;
using luke_hacks.Services;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: true);
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "Data Source=luke-hacks.db";
var dataProtectionPath = Path.Combine(builder.Environment.ContentRootPath, ".keys");

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddProblemDetails();
builder.Services.AddSwaggerGen();
builder.Services.AddHttpClient<OpenAiPlanningService>();
builder.Services.AddHttpClient<GoogleMapsService>();
builder.Services.AddHttpClient<RoundtableEngineClient>();
builder.Services.Configure<OpenAiOptions>(builder.Configuration.GetSection("OpenAI"));
builder.Services.Configure<GoogleMapsOptions>(builder.Configuration.GetSection("GoogleMaps"));
builder.Services.Configure<RoundtableOptions>(builder.Configuration.GetSection("Roundtable"));
builder.Services.PostConfigure<OpenAiOptions>(options =>
{
    options.ApiKey = Environment.GetEnvironmentVariable("OPENAI_API_KEY") ?? options.ApiKey;
    options.Model = Environment.GetEnvironmentVariable("OPENAI_MODEL") ?? options.Model;
});
builder.Services.PostConfigure<GoogleMapsOptions>(options =>
{
    options.ApiKey = Environment.GetEnvironmentVariable("GOOGLE_MAPS_API_KEY") ?? options.ApiKey;
});
builder.Services.PostConfigure<RoundtableOptions>(options =>
{
    options.BaseUrl = Environment.GetEnvironmentVariable("ROUNDTABLE_BASE_URL") ?? options.BaseUrl;
});
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy
            .WithOrigins(
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "https://localhost:5173",
                "https://127.0.0.1:5173")
            .AllowAnyHeader()
            .AllowAnyMethod());
});
builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(dataProtectionPath));
builder.Services.AddDbContext<AppDbContext>(options => options.UseSqlite(connectionString));
builder.Services.AddAuthorization();
builder.Services.AddIdentityApiEndpoints<ApplicationUser>(options =>
{
    options.User.RequireUniqueEmail = true;
    options.SignIn.RequireConfirmedAccount = false;
    options.Password.RequiredLength = 8;
    options.Password.RequireDigit = false;
    options.Password.RequireLowercase = false;
    options.Password.RequireUppercase = false;
    options.Password.RequireNonAlphanumeric = false;
})
.AddEntityFrameworkStores<AppDbContext>();
builder.Services.AddScoped<CollaborativePlanningService>();
builder.Services.AddHostedService<CollaborativePlanningTimeoutWorker>();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
else
{
    app.UseHttpsRedirection();
}

app.UseExceptionHandler();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

var authGroup = app.MapGroup("/api/auth");
authGroup.MapIdentityApi<ApplicationUser>();
authGroup.MapGet("/me", async (ClaimsPrincipal user, UserManager<ApplicationUser> userManager) =>
{
    var currentUser = await userManager.GetUserAsync(user);
    return currentUser is null
        ? Results.NotFound()
        : Results.Ok(new CurrentUserResponse(currentUser.Id, currentUser.Email, currentUser.UserName));
})
.RequireAuthorization()
.WithName("GetCurrentUser")
.WithOpenApi();

var collaborativePlanningGroup = app.MapGroup("/api/collaborative-planning")
    .RequireAuthorization();

collaborativePlanningGroup.MapPost("/chats", async (
    CreateCollaborativePlanningChatRequest request,
    ClaimsPrincipal user,
    UserManager<ApplicationUser> userManager,
    CollaborativePlanningService collaborativePlanning,
    CancellationToken cancellationToken) =>
{
    var currentUser = await userManager.GetUserAsync(user);
    if (currentUser is null)
    {
        return Results.Unauthorized();
    }

    try
    {
        var chat = await collaborativePlanning.CreateChatAsync(
            currentUser.Id,
            currentUser.Email,
            request,
            cancellationToken);
        return Results.Ok(chat);
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message, statusCode: StatusCodes.Status400BadRequest);
    }
})
.WithName("CreateCollaborativePlanningChat")
.WithOpenApi();

collaborativePlanningGroup.MapPost("/chats/join/{inviteToken}", async (
    string inviteToken,
    ClaimsPrincipal user,
    UserManager<ApplicationUser> userManager,
    CollaborativePlanningService collaborativePlanning,
    CancellationToken cancellationToken) =>
{
    var currentUser = await userManager.GetUserAsync(user);
    if (currentUser is null)
    {
        return Results.Unauthorized();
    }

    try
    {
        var chat = await collaborativePlanning.JoinByInviteAsync(
            inviteToken,
            currentUser.Id,
            currentUser.Email,
            cancellationToken);
        return Results.Ok(chat);
    }
    catch (KeyNotFoundException ex)
    {
        return Results.NotFound(new { error = ex.Message });
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message, statusCode: StatusCodes.Status400BadRequest);
    }
})
.WithName("JoinCollaborativePlanningChatByInvite")
.WithOpenApi();

collaborativePlanningGroup.MapPost("/chats/{chatId:guid}/constraints", async (
    Guid chatId,
    SubmitCollaborativePlanningConstraintsRequest request,
    ClaimsPrincipal user,
    UserManager<ApplicationUser> userManager,
    CollaborativePlanningService collaborativePlanning,
    CancellationToken cancellationToken) =>
{
    var currentUser = await userManager.GetUserAsync(user);
    if (currentUser is null)
    {
        return Results.Unauthorized();
    }

    try
    {
        var chat = await collaborativePlanning.SubmitConstraintsAsync(chatId, currentUser.Id, request, cancellationToken);
        return Results.Ok(chat);
    }
    catch (KeyNotFoundException ex)
    {
        return Results.NotFound(new { error = ex.Message });
    }
    catch (UnauthorizedAccessException ex)
    {
        return Results.Problem(ex.Message, statusCode: StatusCodes.Status403Forbidden);
    }
    catch (InvalidOperationException ex)
    {
        return Results.Conflict(new { error = ex.Message });
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message, statusCode: StatusCodes.Status400BadRequest);
    }
})
.WithName("SubmitCollaborativePlanningConstraints")
.WithOpenApi();

collaborativePlanningGroup.MapGet("/chats/{chatId:guid}", async (
    Guid chatId,
    ClaimsPrincipal user,
    UserManager<ApplicationUser> userManager,
    CollaborativePlanningService collaborativePlanning,
    CancellationToken cancellationToken) =>
{
    var currentUser = await userManager.GetUserAsync(user);
    if (currentUser is null)
    {
        return Results.Unauthorized();
    }

    try
    {
        var chat = await collaborativePlanning.GetChatAsync(chatId, currentUser.Id, cancellationToken);
        return Results.Ok(chat);
    }
    catch (KeyNotFoundException ex)
    {
        return Results.NotFound(new { error = ex.Message });
    }
    catch (UnauthorizedAccessException ex)
    {
        return Results.Problem(ex.Message, statusCode: StatusCodes.Status403Forbidden);
    }
    catch (InvalidOperationException ex)
    {
        return Results.Conflict(new { error = ex.Message });
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message, statusCode: StatusCodes.Status400BadRequest);
    }
})
.WithName("GetCollaborativePlanningChat")
.WithOpenApi();

collaborativePlanningGroup.MapPost("/chats/{chatId:guid}/veto", async (
    Guid chatId,
    SubmitCollaborativePlanningVetoRequest request,
    ClaimsPrincipal user,
    UserManager<ApplicationUser> userManager,
    CollaborativePlanningService collaborativePlanning,
    CancellationToken cancellationToken) =>
{
    var currentUser = await userManager.GetUserAsync(user);
    if (currentUser is null)
    {
        return Results.Unauthorized();
    }

    try
    {
        await collaborativePlanning.SubmitVetoAsync(chatId, currentUser.Id, request.Reason, cancellationToken);
        return Results.Ok(new { ok = true });
    }
    catch (KeyNotFoundException ex)
    {
        return Results.NotFound(new { error = ex.Message });
    }
    catch (UnauthorizedAccessException ex)
    {
        return Results.Problem(ex.Message, statusCode: StatusCodes.Status403Forbidden);
    }
    catch (InvalidOperationException ex)
    {
        return Results.Conflict(new { error = ex.Message });
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message, statusCode: StatusCodes.Status400BadRequest);
    }
})
.WithName("SubmitCollaborativePlanningVeto")
.WithOpenApi();

collaborativePlanningGroup.MapPost("/chats/{chatId:guid}/feedback", async (
    Guid chatId,
    SubmitCollaborativePlanningFeedbackRequest request,
    ClaimsPrincipal user,
    UserManager<ApplicationUser> userManager,
    CollaborativePlanningService collaborativePlanning,
    CancellationToken cancellationToken) =>
{
    var currentUser = await userManager.GetUserAsync(user);
    if (currentUser is null)
    {
        return Results.Unauthorized();
    }

    try
    {
        await collaborativePlanning.SubmitFeedbackAsync(chatId, currentUser.Id, request.Text, cancellationToken);
        return Results.Ok(new { ok = true });
    }
    catch (KeyNotFoundException ex)
    {
        return Results.NotFound(new { error = ex.Message });
    }
    catch (UnauthorizedAccessException ex)
    {
        return Results.Problem(ex.Message, statusCode: StatusCodes.Status403Forbidden);
    }
    catch (InvalidOperationException ex)
    {
        return Results.Conflict(new { error = ex.Message });
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message, statusCode: StatusCodes.Status400BadRequest);
    }
})
.WithName("SubmitCollaborativePlanningFeedback")
.WithOpenApi();

collaborativePlanningGroup.MapGet("/chats/{chatId:guid}/stream", async (
    Guid chatId,
    long? afterEventId,
    ClaimsPrincipal user,
    UserManager<ApplicationUser> userManager,
    AppDbContext dbContext,
    HttpContext httpContext,
    CancellationToken cancellationToken) =>
{
    var currentUser = await userManager.GetUserAsync(user);
    if (currentUser is null)
    {
        httpContext.Response.StatusCode = StatusCodes.Status401Unauthorized;
        return;
    }

    var isMember = await dbContext.CollaborativePlanningParticipants
        .AnyAsync(participant => participant.ChatId == chatId && participant.UserId == currentUser.Id, cancellationToken);
    if (!isMember)
    {
        httpContext.Response.StatusCode = StatusCodes.Status403Forbidden;
        return;
    }

    httpContext.Response.Headers.CacheControl = "no-cache";
    httpContext.Response.Headers.Connection = "keep-alive";
    httpContext.Response.ContentType = "text/event-stream";

    var lastEventId = Math.Max(0, afterEventId ?? 0);
    var heartbeatCountdown = 0;

    while (!cancellationToken.IsCancellationRequested)
    {
        var events = await dbContext.CollaborativePlanningEvents
            .AsNoTracking()
            .Where(evt => evt.ChatId == chatId && evt.Id > lastEventId)
            .OrderBy(evt => evt.Id)
            .Take(250)
            .ToListAsync(cancellationToken);

        foreach (var evt in events)
        {
            await httpContext.Response.WriteAsync($"id: {evt.Id}\n", cancellationToken);
            await httpContext.Response.WriteAsync($"event: {evt.EventType}\n", cancellationToken);

            foreach (var line in evt.PayloadJson.Split('\n'))
            {
                await httpContext.Response.WriteAsync($"data: {line}\n", cancellationToken);
            }

            await httpContext.Response.WriteAsync("\n", cancellationToken);
            lastEventId = evt.Id;
        }

        if (events.Count > 0)
        {
            await httpContext.Response.Body.FlushAsync(cancellationToken);
            heartbeatCountdown = 0;
        }
        else
        {
            heartbeatCountdown++;
            if (heartbeatCountdown >= 15)
            {
                await httpContext.Response.WriteAsync(": keepalive\n\n", cancellationToken);
                await httpContext.Response.Body.FlushAsync(cancellationToken);
                heartbeatCountdown = 0;
            }
        }

        var status = await dbContext.CollaborativePlanningChats
            .AsNoTracking()
            .Where(chat => chat.Id == chatId)
            .Select(chat => chat.Status)
            .FirstOrDefaultAsync(cancellationToken);

        if (status is null)
        {
            return;
        }

        if ((status == CollaborativePlanningStatus.Completed || status == CollaborativePlanningStatus.Failed) &&
            events.Count == 0)
        {
            return;
        }

        await Task.Delay(TimeSpan.FromSeconds(1), cancellationToken);
    }
})
.WithName("StreamCollaborativePlanningEvents")
.WithOpenApi();

app.MapPost("/api/agent/plan", async (
    AgentPlanRequest request,
    OpenAiPlanningService planner,
    GoogleMapsService googleMaps,
    CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.Prompt))
    {
        return Results.BadRequest(new { error = "Prompt is required." });
    }

    try
    {
        var intent = await planner.CreateIntentAsync(request.Prompt, request.CurrentLocation, cancellationToken);
        var places = (await googleMaps.SearchPlacesAsync(intent, request.CurrentLocation, cancellationToken)).ToList();
        var nonDestinationStopCount = string.IsNullOrWhiteSpace(intent.FinalDestinationQuery)
            ? intent.RouteStopCount
            : Math.Max(0, intent.RouteStopCount - 1);
        var routeStops = places.Take(Math.Min(nonDestinationStopCount, places.Count)).ToList();

        if (!string.IsNullOrWhiteSpace(intent.FinalDestinationQuery))
        {
            var destinationIntent = new DiscoveryIntent(
                intent.IntentSummary,
                intent.FinalDestinationQuery,
                Math.Max(intent.RadiusMeters, 5000),
                5,
                1,
                intent.OpenNow,
                intent.UserFacingPlan,
                intent.FinalDestinationQuery,
                intent.TargetDistanceMeters);

            var destination = (await googleMaps.SearchPlacesAsync(destinationIntent, request.CurrentLocation, cancellationToken))
                .FirstOrDefault(place => routeStops.All(stop => stop.Id != place.Id));

            if (destination is not null)
            {
                routeStops.Add(destination);
                if (places.All(place => place.Id != destination.Id))
                {
                    places.Add(destination);
                }
            }
        }

        var route = await googleMaps.ComputeRouteAsync(
            request.CurrentLocation,
            routeStops,
            string.IsNullOrWhiteSpace(intent.FinalDestinationQuery),
            cancellationToken);

        return Results.Ok(new AgentPlanResponse(
            request.Prompt,
            intent.IntentSummary,
            intent.GoogleMapsQuery,
            intent.RadiusMeters,
            intent.UserFacingPlan,
            places,
            routeStops.Select(stop => stop.Id).ToArray(),
            route));
    }
    catch (InvalidOperationException ex)
    {
        return Results.Problem(ex.Message, statusCode: StatusCodes.Status503ServiceUnavailable);
    }
    catch (HttpRequestException ex)
    {
        return Results.Problem(ex.Message, statusCode: StatusCodes.Status502BadGateway);
    }
})
.WithName("PlanLocalDiscovery")
.WithOpenApi();

app.MapPost("/api/agent/plan/iterative", async (
    IterativeRoutePlanRequest request,
    OpenAiPlanningService planner,
    GoogleMapsService googleMaps,
    CancellationToken cancellationToken) =>
{
    var selectedStops = request.SelectedStops ?? [];
    IterativeRoutePlanSession session;

    if (request.Session is null)
    {
        if (string.IsNullOrWhiteSpace(request.Prompt))
        {
            return Results.BadRequest(new { error = "Prompt is required when starting iterative planning." });
        }

        var intent = await planner.CreateIntentAsync(request.Prompt, request.CurrentLocation, cancellationToken);
        session = new IterativeRoutePlanSession(
            intent.IntentSummary,
            intent.GoogleMapsQuery,
            intent.RadiusMeters,
            intent.RouteStopCount,
            intent.OpenNow,
            intent.UserFacingPlan,
            intent.FinalDestinationQuery,
            intent.TargetDistanceMeters);
    }
    else
    {
        var query = string.IsNullOrWhiteSpace(request.Session.SearchQuery)
            ? "cafes"
            : request.Session.SearchQuery.Trim();
        var summary = string.IsNullOrWhiteSpace(request.Session.IntentSummary)
            ? "Nearby local discovery"
            : request.Session.IntentSummary.Trim();
        var planSummary = string.IsNullOrWhiteSpace(request.Session.PlanSummary)
            ? $"Build a local route around {query.ToLowerInvariant()}."
            : request.Session.PlanSummary.Trim();

        session = request.Session with
        {
            SearchQuery = query,
            IntentSummary = summary,
            PlanSummary = planSummary,
            RadiusMeters = Math.Clamp(request.Session.RadiusMeters, 500, 20000),
            RouteStopCount = Math.Clamp(request.Session.RouteStopCount, 1, 5),
        };
    }

    if (selectedStops.Count > session.RouteStopCount)
    {
        return Results.BadRequest(new
        {
            error = $"Selected stops ({selectedStops.Count}) exceed the target stop count ({session.RouteStopCount}).",
        });
    }

    try
    {
        var isComplete = selectedStops.Count >= session.RouteStopCount;
        RouteResponse? route = null;
        IReadOnlyList<PlaceSuggestion> nextOptions = [];

        if (isComplete)
        {
            var routeStops = selectedStops
                .Select(stop => new PlaceSuggestion(
                    stop.Id,
                    stop.Name,
                    stop.Lat,
                    stop.Lng,
                    0,
                    null,
                    null,
                    null,
                    null))
                .ToList();

            route = await googleMaps.ComputeRouteAsync(
                request.CurrentLocation,
                routeStops,
                string.IsNullOrWhiteSpace(session.FinalDestinationQuery),
                cancellationToken);
        }
        else
        {
            var searchOrigin = selectedStops.Count == 0
                ? request.CurrentLocation
                : new Coordinate(selectedStops[^1].Lat, selectedStops[^1].Lng);

            var hasFinalDest = !string.IsNullOrWhiteSpace(session.FinalDestinationQuery);
            var intermediateStopsNeeded = hasFinalDest
                ? session.RouteStopCount - 1
                : session.RouteStopCount;
            var isLastRound = hasFinalDest && selectedStops.Count >= intermediateStopsNeeded;

            var activeQuery = isLastRound
                ? session.FinalDestinationQuery!
                : session.SearchQuery;

            var searchRadius = session.RadiusMeters;
            if (session.TargetDistanceMeters is > 0)
            {
                const double walkingFactor = 1.4;
                var totalLegs = session.RouteStopCount + 1;
                var straightLineDistUsed = ComputeStraightLineDistance(request.CurrentLocation, selectedStops);
                var estimatedWalkUsed = straightLineDistUsed * walkingFactor;
                var remainingWalkBudget = Math.Max(500, session.TargetDistanceMeters.Value - estimatedWalkUsed);
                var remainingLegs = Math.Max(1, totalLegs - selectedStops.Count);
                var perLegBudget = remainingWalkBudget / remainingLegs;
                searchRadius = (int)Math.Clamp(perLegBudget / walkingFactor, 300, 20000);
            }

            var searchIntent = new DiscoveryIntent(
                session.IntentSummary,
                activeQuery,
                searchRadius,
                8,
                session.RouteStopCount,
                session.OpenNow,
                session.PlanSummary,
                isLastRound ? session.FinalDestinationQuery : null,
                session.TargetDistanceMeters);

            var selectedIds = selectedStops
                .Select(stop => stop.Id)
                .ToHashSet(StringComparer.Ordinal);

            var candidates = (await googleMaps.SearchPlacesAsync(searchIntent, searchOrigin, cancellationToken))
                .Where(place => !selectedIds.Contains(place.Id))
                .ToList();

            if (session.TargetDistanceMeters is > 0 && !isLastRound)
            {
                const double walkingFactor = 1.4;
                var straightLineDistUsed = ComputeStraightLineDistance(request.CurrentLocation, selectedStops);
                var estimatedWalkUsed = straightLineDistUsed * walkingFactor;
                var remainingWalkBudget = session.TargetDistanceMeters.Value - estimatedWalkUsed;
                var remainingLegs = Math.Max(1, session.RouteStopCount + 1 - selectedStops.Count);
                var idealLegDist = remainingWalkBudget / remainingLegs / walkingFactor;

                candidates = candidates
                    .OrderBy(p => Math.Abs(p.DistanceMeters - idealLegDist))
                    .ToList();
            }
            else
            {
                candidates = candidates
                    .OrderBy(p => p.DistanceMeters)
                    .ToList();
            }

            nextOptions = candidates.Take(5).ToList();
        }

        var remainingStops = Math.Max(0, session.RouteStopCount - selectedStops.Count);
        return Results.Ok(new IterativeRoutePlanResponse(
            session,
            nextOptions,
            selectedStops,
            isComplete,
            remainingStops,
            route));
    }
    catch (InvalidOperationException ex)
    {
        return Results.Problem(ex.Message, statusCode: StatusCodes.Status503ServiceUnavailable);
    }
    catch (HttpRequestException ex)
    {
        return Results.Problem(ex.Message, statusCode: StatusCodes.Status502BadGateway);
    }
})
.WithName("PlanLocalDiscoveryIterative")
.WithOpenApi();

app.MapPost("/api/google/route", async (
    GoogleRouteRequest request,
    GoogleMapsService googleMaps,
    CancellationToken cancellationToken) =>
{
    if (request.Waypoints.Count == 0)
    {
        return Results.Ok<RouteResponse?>(null);
    }

    try
    {
        var stops = request.Waypoints
            .Select(waypoint => new PlaceSuggestion(
                waypoint.Id,
                waypoint.Name,
                waypoint.Lat,
                waypoint.Lng,
                0,
                null,
                null,
                null,
                null))
            .ToList();

        var route = await googleMaps.ComputeRouteAsync(
            request.Origin,
            stops,
            request.ReturnToOrigin,
            cancellationToken);
        return Results.Ok(route);
    }
    catch (InvalidOperationException ex)
    {
        return Results.Problem(ex.Message, statusCode: StatusCodes.Status503ServiceUnavailable);
    }
    catch (HttpRequestException ex)
    {
        return Results.Problem(ex.Message, statusCode: StatusCodes.Status502BadGateway);
    }
})
.WithName("ComputeGoogleRoute")
.WithOpenApi();

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await dbContext.Database.EnsureCreatedAsync();
    await EnsureSqliteCollaborativePlanningSchemaAsync(dbContext);
}

await app.RunAsync();

static double ComputeStraightLineDistance(Coordinate origin, IReadOnlyList<GoogleRouteWaypoint> stops)
{
    if (stops.Count == 0) return 0;

    var total = HaversineMeters(origin.Lat, origin.Lng, stops[0].Lat, stops[0].Lng);
    for (var i = 1; i < stops.Count; i++)
    {
        total += HaversineMeters(stops[i - 1].Lat, stops[i - 1].Lng, stops[i].Lat, stops[i].Lng);
    }
    return total;
}

static double HaversineMeters(double lat1, double lng1, double lat2, double lng2)
{
    const double r = 6_371_000;
    var toRad = (double d) => d * Math.PI / 180d;
    var dLat = toRad(lat2 - lat1);
    var dLng = toRad(lng2 - lng1);
    var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
            Math.Cos(toRad(lat1)) * Math.Cos(toRad(lat2)) *
            Math.Sin(dLng / 2) * Math.Sin(dLng / 2);
    return r * 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
}

static async Task EnsureSqliteCollaborativePlanningSchemaAsync(
    AppDbContext dbContext,
    CancellationToken cancellationToken = default)
{
    if (!dbContext.Database.IsSqlite())
    {
        return;
    }

    await dbContext.Database.ExecuteSqlRawAsync(
        """
        CREATE TABLE IF NOT EXISTS "CollaborativePlanningChats" (
            "Id" TEXT NOT NULL CONSTRAINT "PK_CollaborativePlanningChats" PRIMARY KEY,
            "InviteToken" TEXT NOT NULL,
            "Title" TEXT NULL,
            "Status" TEXT NOT NULL,
            "CreatedByUserId" TEXT NOT NULL,
            "ExpectedParticipantCount" INTEGER NOT NULL,
            "CreatedAtUtc" TEXT NOT NULL,
            "JoinDeadlineUtc" TEXT NOT NULL,
            "StartedAtUtc" TEXT NULL,
            "CompletedAtUtc" TEXT NULL,
            "RoundtableSessionId" TEXT NULL,
            "FinalItineraryJson" TEXT NULL,
            "FailureReason" TEXT NULL
        );
        """,
        cancellationToken);

    await dbContext.Database.ExecuteSqlRawAsync(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS "IX_CollaborativePlanningChats_InviteToken"
        ON "CollaborativePlanningChats" ("InviteToken");
        """,
        cancellationToken);

    await dbContext.Database.ExecuteSqlRawAsync(
        """
        CREATE TABLE IF NOT EXISTS "CollaborativePlanningParticipants" (
            "Id" TEXT NOT NULL CONSTRAINT "PK_CollaborativePlanningParticipants" PRIMARY KEY,
            "ChatId" TEXT NOT NULL,
            "UserId" TEXT NOT NULL,
            "DisplayName" TEXT NULL,
            "JoinedAtUtc" TEXT NOT NULL,
            "ConstraintsSubmittedAtUtc" TEXT NULL,
            "ConstraintsJson" TEXT NULL,
            CONSTRAINT "FK_CollaborativePlanningParticipants_CollaborativePlanningChats_ChatId"
                FOREIGN KEY ("ChatId") REFERENCES "CollaborativePlanningChats" ("Id")
                ON DELETE CASCADE
        );
        """,
        cancellationToken);

    await dbContext.Database.ExecuteSqlRawAsync(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS "IX_CollaborativePlanningParticipants_ChatId_UserId"
        ON "CollaborativePlanningParticipants" ("ChatId", "UserId");
        """,
        cancellationToken);

    await dbContext.Database.ExecuteSqlRawAsync(
        """
        CREATE TABLE IF NOT EXISTS "CollaborativePlanningEvents" (
            "Id" INTEGER NOT NULL CONSTRAINT "PK_CollaborativePlanningEvents" PRIMARY KEY AUTOINCREMENT,
            "ChatId" TEXT NOT NULL,
            "EventType" TEXT NOT NULL,
            "PayloadJson" TEXT NOT NULL,
            "CreatedAtUtc" TEXT NOT NULL
        );
        """,
        cancellationToken);

    await dbContext.Database.ExecuteSqlRawAsync(
        """
        CREATE INDEX IF NOT EXISTS "IX_CollaborativePlanningEvents_ChatId_Id"
        ON "CollaborativePlanningEvents" ("ChatId", "Id");
        """,
        cancellationToken);
}
