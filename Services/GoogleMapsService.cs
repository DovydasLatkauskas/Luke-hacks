using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using luke_hacks.Configuration;
using luke_hacks.Models;
using Microsoft.Extensions.Options;

namespace luke_hacks.Services;

public sealed class GoogleMapsService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true,
    };

    private const string PlacesFieldMask =
        "places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.primaryType,places.primaryTypeDisplayName";

    private const string RoutesFieldMask =
        "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline";

    private readonly HttpClient _httpClient;
    private readonly GoogleMapsOptions _options;

    public GoogleMapsService(HttpClient httpClient, IOptions<GoogleMapsOptions> options)
    {
        _httpClient = httpClient;
        _options = options.Value;
    }

    public async Task<IReadOnlyList<PlaceSuggestion>> SearchPlacesAsync(
        DiscoveryIntent intent,
        Coordinate currentLocation,
        CancellationToken cancellationToken)
    {
        EnsureApiKey();
        var exactDestinationSearch =
            !string.IsNullOrWhiteSpace(intent.FinalDestinationQuery) &&
            string.Equals(
                intent.GoogleMapsQuery.Trim(),
                intent.FinalDestinationQuery.Trim(),
                StringComparison.OrdinalIgnoreCase);

        var requestBody = new
        {
            textQuery = intent.GoogleMapsQuery,
            pageSize = Math.Min(20, Math.Max(8, intent.MaxResultCount * 3)),
            openNow = intent.OpenNow,
            rankPreference = "DISTANCE",
            locationBias = new
            {
                circle = new
                {
                    center = new
                    {
                        latitude = currentLocation.Lat,
                        longitude = currentLocation.Lng,
                    },
                    radius = (double)intent.RadiusMeters,
                },
            },
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, "https://places.googleapis.com/v1/places:searchText");
        request.Headers.Add("X-Goog-Api-Key", _options.ApiKey);
        request.Headers.Add("X-Goog-FieldMask", PlacesFieldMask);
        request.Content = JsonContent.Create(requestBody);

        using var response = await _httpClient.SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException($"Google Places request failed with status {(int)response.StatusCode}: {body}");
        }

        var payload = JsonSerializer.Deserialize<TextSearchResponse>(body, JsonOptions) ?? new TextSearchResponse();
        var places = (payload.Places ?? [])
            .Where(place => place.Id is not null && place.Location is not null)
            .Select(place =>
            {
                var lat = place.Location!.Latitude;
                var lng = place.Location.Longitude;
                var distanceMeters = HaversineMeters(currentLocation, new Coordinate(lat, lng));

                return new PlaceSuggestion(
                    place.Id!,
                    place.DisplayName?.Text?.Trim() is { Length: > 0 } name ? name : intent.GoogleMapsQuery,
                    lat,
                    lng,
                    Math.Round(distanceMeters),
                    place.FormattedAddress,
                    place.PrimaryType,
                    place.PrimaryTypeDisplayName?.Text,
                    place.GoogleMapsUri);
            })
            .Where(place => exactDestinationSearch || place.DistanceMeters <= intent.RadiusMeters)
            .OrderByDescending(place => exactDestinationSearch
                ? ComputeDestinationMatchScore(place, intent.FinalDestinationQuery!)
                : 0)
            .ThenBy(place => place.DistanceMeters)
            .Take(intent.MaxResultCount)
            .ToList();

        return places;
    }

    public async Task<RouteResponse?> ComputeRouteAsync(
        Coordinate origin,
        IReadOnlyList<PlaceSuggestion> stops,
        bool returnToOrigin,
        CancellationToken cancellationToken)
    {
        EnsureApiKey();

        if (stops.Count == 0)
        {
            return null;
        }

        var destination = returnToOrigin
            ? new PlaceSuggestion(
                "origin",
                "Current location",
                origin.Lat,
                origin.Lng,
                0,
                null,
                null,
                null,
                null)
            : stops[^1];
        var intermediates = returnToOrigin
            ? stops.ToArray()
            : stops.Take(Math.Max(0, stops.Count - 1)).ToArray();

        var requestBody = new
        {
            origin = ToWaypoint(origin),
            destination = ToWaypoint(new Coordinate(destination.Lat, destination.Lng)),
            intermediates = intermediates.Select(stop => ToWaypoint(new Coordinate(stop.Lat, stop.Lng))).ToArray(),
            travelMode = "WALK",
            units = "METRIC",
            computeAlternativeRoutes = false,
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, "https://routes.googleapis.com/directions/v2:computeRoutes");
        request.Headers.Add("X-Goog-Api-Key", _options.ApiKey);
        request.Headers.Add("X-Goog-FieldMask", RoutesFieldMask);
        request.Content = JsonContent.Create(requestBody);

        using var response = await _httpClient.SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException($"Google Routes request failed with status {(int)response.StatusCode}: {body}");
        }

        var payload = JsonSerializer.Deserialize<RoutesResponse>(body, JsonOptions);
        var route = payload?.Routes?.FirstOrDefault();

        if (route?.Polyline?.EncodedPolyline is null)
        {
            return null;
        }

        return new RouteResponse(
            new GeoJsonLineString("LineString", DecodePolyline(route.Polyline.EncodedPolyline)),
            route.DistanceMeters,
            FormatDuration(route.Duration));
    }

    private void EnsureApiKey()
    {
        if (string.IsNullOrWhiteSpace(_options.ApiKey))
        {
            throw new InvalidOperationException("Google Maps API key is missing. Set GOOGLE_MAPS_API_KEY before using Google Maps search and routing.");
        }
    }

    private static int ComputeDestinationMatchScore(PlaceSuggestion place, string query)
    {
        var normalizedQuery = query.Trim();
        if (string.Equals(place.Name.Trim(), normalizedQuery, StringComparison.OrdinalIgnoreCase))
        {
            return 4;
        }

        if (place.Name.Contains(normalizedQuery, StringComparison.OrdinalIgnoreCase))
        {
            return 3;
        }

        var tokens = normalizedQuery
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        if (tokens.Length > 0 &&
            tokens.All(token => place.Name.Contains(token, StringComparison.OrdinalIgnoreCase)))
        {
            return 2;
        }

        if (!string.IsNullOrWhiteSpace(place.Address) &&
            tokens.Length > 0 &&
            tokens.All(token => place.Address.Contains(token, StringComparison.OrdinalIgnoreCase)))
        {
            return 1;
        }

        return 0;
    }

    private static object ToWaypoint(Coordinate coordinate) => new
    {
        location = new
        {
            latLng = new
            {
                latitude = coordinate.Lat,
                longitude = coordinate.Lng,
            },
        },
    };

    private static double HaversineMeters(Coordinate a, Coordinate b)
    {
        const double earthRadiusMeters = 6_371_000;
        var toRadians = (double degrees) => degrees * Math.PI / 180d;
        var dLat = toRadians(b.Lat - a.Lat);
        var dLng = toRadians(b.Lng - a.Lng);
        var sinLat = Math.Sin(dLat / 2d);
        var sinLng = Math.Sin(dLng / 2d);
        var h =
            sinLat * sinLat +
            Math.Cos(toRadians(a.Lat)) * Math.Cos(toRadians(b.Lat)) * sinLng * sinLng;

        return earthRadiusMeters * 2d * Math.Atan2(Math.Sqrt(h), Math.Sqrt(1d - h));
    }

    private static string FormatDuration(string duration)
    {
        if (!duration.EndsWith('s') ||
            !double.TryParse(
                duration[..^1],
                NumberStyles.Float,
                CultureInfo.InvariantCulture,
                out var seconds))
        {
            return duration;
        }

        var totalMinutes = (int)Math.Round(seconds / 60d, MidpointRounding.AwayFromZero);
        if (totalMinutes < 60)
        {
            return $"{Math.Max(totalMinutes, 1)} min";
        }

        var hours = totalMinutes / 60;
        var minutes = totalMinutes % 60;
        return minutes == 0 ? $"{hours} hr" : $"{hours} hr {minutes} min";
    }

    private static List<double[]> DecodePolyline(string encoded)
    {
        var coordinates = new List<double[]>();
        var index = 0;
        var latitude = 0;
        var longitude = 0;

        while (index < encoded.Length)
        {
            latitude += DecodePolylineValue(encoded, ref index);
            longitude += DecodePolylineValue(encoded, ref index);
            coordinates.Add(new[] { longitude / 1e5, latitude / 1e5 });
        }

        return coordinates;
    }

    private static int DecodePolylineValue(string encoded, ref int index)
    {
        var result = 0;
        var shift = 0;
        int chunk;

        do
        {
            chunk = encoded[index++] - 63;
            result |= (chunk & 0x1f) << shift;
            shift += 5;
        } while (chunk >= 0x20 && index < encoded.Length);

        return (result & 1) != 0 ? ~(result >> 1) : result >> 1;
    }

    private sealed record TextSearchResponse(
        [property: JsonPropertyName("places")] IReadOnlyList<GooglePlace>? Places = null);

    private sealed record GooglePlace(
        [property: JsonPropertyName("id")] string? Id,
        [property: JsonPropertyName("displayName")] LocalizedText? DisplayName,
        [property: JsonPropertyName("formattedAddress")] string? FormattedAddress,
        [property: JsonPropertyName("location")] GoogleLatLng? Location,
        [property: JsonPropertyName("googleMapsUri")] string? GoogleMapsUri,
        [property: JsonPropertyName("primaryType")] string? PrimaryType,
        [property: JsonPropertyName("primaryTypeDisplayName")] LocalizedText? PrimaryTypeDisplayName);

    private sealed record LocalizedText(
        [property: JsonPropertyName("text")] string? Text);

    private sealed record GoogleLatLng(
        [property: JsonPropertyName("latitude")] double Latitude,
        [property: JsonPropertyName("longitude")] double Longitude);

    private sealed record RoutesResponse(
        [property: JsonPropertyName("routes")] IReadOnlyList<GoogleRoute>? Routes);

    private sealed record GoogleRoute(
        [property: JsonPropertyName("distanceMeters")] int DistanceMeters,
        [property: JsonPropertyName("duration")] string Duration,
        [property: JsonPropertyName("polyline")] GooglePolyline? Polyline);

    private sealed record GooglePolyline(
        [property: JsonPropertyName("encodedPolyline")] string? EncodedPolyline);
}
