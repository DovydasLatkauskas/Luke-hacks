using System.ComponentModel.DataAnnotations;

namespace luke_hacks.Models;

public static class CollaborativePlanningStatus
{
    public const string WaitingForConstraints = "waiting_for_constraints";
    public const string Negotiating = "negotiating";
    public const string Completed = "completed";
    public const string Failed = "failed";
}

public sealed class CollaborativePlanningChat
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [MaxLength(128)]
    public required string InviteToken { get; set; }

    [MaxLength(256)]
    public string? Title { get; set; }

    [MaxLength(32)]
    public string Status { get; set; } = CollaborativePlanningStatus.WaitingForConstraints;

    [MaxLength(450)]
    public required string CreatedByUserId { get; set; }

    public int ExpectedParticipantCount { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime JoinDeadlineUtc { get; set; }

    public DateTime? StartedAtUtc { get; set; }

    public DateTime? CompletedAtUtc { get; set; }

    [MaxLength(64)]
    public string? RoundtableSessionId { get; set; }

    public string? FinalItineraryJson { get; set; }

    [MaxLength(1024)]
    public string? FailureReason { get; set; }

    public List<CollaborativePlanningParticipant> Participants { get; set; } = [];
}

public sealed class CollaborativePlanningParticipant
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid ChatId { get; set; }

    public CollaborativePlanningChat Chat { get; set; } = null!;

    [MaxLength(450)]
    public required string UserId { get; set; }

    [MaxLength(200)]
    public string? DisplayName { get; set; }

    public DateTime JoinedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? ConstraintsSubmittedAtUtc { get; set; }

    public string? ConstraintsJson { get; set; }
}

public sealed class CollaborativePlanningEvent
{
    [Key]
    public long Id { get; set; }

    public Guid ChatId { get; set; }

    [MaxLength(40)]
    public required string EventType { get; set; }

    public required string PayloadJson { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed record CollaborativePlanningConstraints(
    string Name,
    string Budget,
    string Dietary,
    string Location,
    string Mood,
    string Time);

public sealed record CreateCollaborativePlanningChatRequest(
    int ExpectedParticipantCount,
    int JoinTimeoutSeconds = 300,
    string? Title = null);

public sealed record JoinCollaborativePlanningChatRequest(
    string InviteToken);

public sealed record SubmitCollaborativePlanningConstraintsRequest(
    string Name,
    string Budget,
    string Dietary,
    string Location,
    string Mood,
    string Time);

public sealed record SubmitCollaborativePlanningVetoRequest(
    string Reason);

public sealed record CollaborativePlanningParticipantResponse(
    string UserId,
    string? Email,
    string? DisplayName,
    bool HasSubmittedConstraints,
    DateTime JoinedAtUtc,
    DateTime? ConstraintsSubmittedAtUtc);

public sealed record CollaborativePlanningChatResponse(
    Guid ChatId,
    string InviteToken,
    string InvitePath,
    string Status,
    string? Title,
    int ExpectedParticipantCount,
    int ParticipantCount,
    int SubmittedConstraintsCount,
    int WaitingForConstraintsCount,
    DateTime CreatedAtUtc,
    DateTime JoinDeadlineUtc,
    DateTime? StartedAtUtc,
    DateTime? CompletedAtUtc,
    string? RoundtableSessionId,
    string? FinalItineraryJson,
    string? FailureReason,
    IReadOnlyList<CollaborativePlanningParticipantResponse> Participants);
