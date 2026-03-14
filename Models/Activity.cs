using System.ComponentModel.DataAnnotations;

namespace luke_hacks.Models;

public sealed class Activity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [MaxLength(450)]
    public required string UserId { get; set; }

    [MaxLength(256)]
    public string? Title { get; set; }

    [MaxLength(32)]
    public string Source { get; set; } = "manual";

    public double DistanceMeters { get; set; }

    public int DurationSeconds { get; set; }

    public int EstimatedCalories { get; set; }

    public DateTime StartedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime CompletedAtUtc { get; set; } = DateTime.UtcNow;

    public string? RouteSummaryJson { get; set; }

    public ApplicationUser User { get; set; } = null!;
}
