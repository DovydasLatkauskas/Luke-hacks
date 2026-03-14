namespace luke_hacks.Models;

public sealed record CreateActivityRequest(
    string? Title,
    double DistanceMeters,
    int DurationSeconds,
    string? RouteSummaryJson = null,
    string? Source = null);

public sealed record ActivityResponse(
    Guid Id,
    string? Title,
    double DistanceMeters,
    int DurationSeconds,
    int EstimatedCalories,
    string Source,
    DateTime StartedAtUtc,
    DateTime CompletedAtUtc,
    string? RouteSummaryJson);

public sealed record ProfileSummaryResponse(
    double TotalDistanceMeters,
    int TotalDurationSeconds,
    int TotalEstimatedCalories,
    int ActivityCount,
    double LongestDistanceMeters,
    IReadOnlyList<ActivityResponse> RecentActivities);

public static class ActivityMetrics
{
    /// <summary>
    /// Simple walking/running calorie estimate: ~60 kcal per km.
    /// </summary>
    public static int EstimateCalories(double distanceMeters)
    {
        var km = distanceMeters / 1000.0;
        return Math.Max(0, (int)Math.Round(60.0 * km));
    }
}
