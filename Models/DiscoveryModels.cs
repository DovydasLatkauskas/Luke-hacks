namespace luke_hacks.Models;

public sealed record Coordinate(double Lat, double Lng);

public sealed record AgentPlanRequest(
    string Prompt,
    Coordinate CurrentLocation);

public sealed record AgentPlanResponse(
    string Prompt,
    string IntentSummary,
    string SearchQuery,
    int RadiusMeters,
    string PlanSummary,
    IReadOnlyList<PlaceSuggestion> Places,
    IReadOnlyList<string> RouteStopIds,
    RouteResponse? Route);

public sealed record DiscoveryIntent(
    string IntentSummary,
    string GoogleMapsQuery,
    int RadiusMeters,
    int MaxResultCount,
    int RouteStopCount,
    bool OpenNow,
    string UserFacingPlan);

public sealed record PlaceSuggestion(
    string Id,
    string Name,
    double Lat,
    double Lng,
    double DistanceMeters,
    string? Address,
    string? PrimaryType,
    string? PrimaryTypeLabel,
    string? GoogleMapsUri);

public sealed record GoogleRouteRequest(
    Coordinate Origin,
    IReadOnlyList<GoogleRouteWaypoint> Waypoints);

public sealed record GoogleRouteWaypoint(
    string Id,
    string Name,
    double Lat,
    double Lng);

public sealed record RouteResponse(
    GeoJsonLineString Geometry,
    int DistanceMeters,
    string DurationText);

public sealed record GeoJsonLineString(
    string Type,
    IReadOnlyList<double[]> Coordinates);
