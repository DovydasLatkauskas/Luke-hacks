using System.Net.Http.Json;
using System.Text.Json;
using luke_hacks.Configuration;
using luke_hacks.Models;
using Microsoft.Extensions.Options;

namespace luke_hacks.Services;

public sealed class OpenAiPlanningService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true,
    };

    private readonly HttpClient _httpClient;
    private readonly OpenAiOptions _options;

    public OpenAiPlanningService(HttpClient httpClient, IOptions<OpenAiOptions> options)
    {
        _httpClient = httpClient;
        _options = options.Value;
    }

    public async Task<DiscoveryIntent> CreateIntentAsync(
        string prompt,
        Coordinate currentLocation,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_options.ApiKey))
        {
            throw new InvalidOperationException("OpenAI API key is missing. Set OPENAI_API_KEY before using the ChatGPT planner.");
        }

        var requestBody = new
        {
            model = _options.Model,
            store = false,
            instructions =
                "You turn local outing requests into structured local search plans. " +
                "Plan around the user's current location, keep the outing realistic, " +
                "prefer simple category queries that work well in Google Maps, and assume the app will build a walking route. " +
                "If the user asks for a distance, respect it. If they do not, default to a short local outing. " +
                "IMPORTANT: If the user mentions a specific named destination or landmark (e.g. 'St Giles Cathedral', 'Arthur's Seat', a restaurant name), " +
                "put a short Google Maps search string for it in finalDestinationQuery and use googleMapsQuery ONLY for the category of intermediate stops (e.g. 'cafes', 'pubs'). " +
                "The app will show intermediate category stops first, then show the final destination as the last stop. " +
                "Set routeStopCount to the TOTAL number of stops including the final destination. " +
                "If the user mentions a target distance (e.g. '5k', '3 miles'), convert it to meters and set targetDistanceMeters. " +
                "When targetDistanceMeters is set, choose radiusMeters and routeStopCount to make that distance achievable: " +
                "radiusMeters should be roughly targetDistanceMeters divided by (routeStopCount + 1) divided by 1.4 (walking factor). " +
                "For example, a 5000m route with 2 stops: radiusMeters ~ 5000/3/1.4 ~ 1200. " +
                "routeStopCount should be 2-3 for short routes (under 5km) and 3-5 for longer routes. " +
                "If there is no specific named destination, set finalDestinationQuery to an empty string.",
            input =
                $"Current location: latitude {currentLocation.Lat:F6}, longitude {currentLocation.Lng:F6}. " +
                $"User request: {prompt}",
            text = new
            {
                format = new
                {
                    type = "json_schema",
                    name = "local_discovery_plan",
                    strict = true,
                    schema = new
                    {
                        type = "object",
                        properties = new
                        {
                            intentSummary = new
                            {
                                type = "string",
                                minLength = 1,
                            },
                            googleMapsQuery = new
                            {
                                type = "string",
                                minLength = 1,
                            },
                            finalDestinationQuery = new
                            {
                                type = "string",
                            },
                            radiusMeters = new
                            {
                                type = "integer",
                                minimum = 500,
                                maximum = 20000,
                            },
                            maxResultCount = new
                            {
                                type = "integer",
                                minimum = 3,
                                maximum = 8,
                            },
                            routeStopCount = new
                            {
                                type = "integer",
                                minimum = 1,
                                maximum = 5,
                            },
                            targetDistanceMeters = new
                            {
                                type = "integer",
                                minimum = 0,
                                maximum = 30000,
                            },
                            openNow = new
                            {
                                type = "boolean",
                            },
                            userFacingPlan = new
                            {
                                type = "string",
                                minLength = 1,
                            },
                        },
                        required = new[]
                        {
                            "intentSummary",
                            "googleMapsQuery",
                            "finalDestinationQuery",
                            "radiusMeters",
                            "maxResultCount",
                            "routeStopCount",
                            "targetDistanceMeters",
                            "openNow",
                            "userFacingPlan",
                        },
                        additionalProperties = false,
                    },
                },
            },
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/responses");
        request.Headers.Add("Authorization", $"Bearer {_options.ApiKey}");
        request.Content = JsonContent.Create(requestBody);

        using var response = await _httpClient.SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException($"OpenAI request failed with status {(int)response.StatusCode}: {body}");
        }

        var outputText = ExtractOutputText(body);
        if (string.IsNullOrWhiteSpace(outputText))
        {
            throw new InvalidOperationException("OpenAI did not return a structured local plan.");
        }

        var intent = JsonSerializer.Deserialize<DiscoveryIntent>(outputText, JsonOptions);
        if (intent is null)
        {
            throw new InvalidOperationException("OpenAI returned an unreadable local plan.");
        }

        return NormalizeIntent(intent);
    }

    private static string? ExtractOutputText(string body)
    {
        using var document = JsonDocument.Parse(body);
        if (!document.RootElement.TryGetProperty("output", out var outputElement))
        {
            return null;
        }

        foreach (var item in outputElement.EnumerateArray())
        {
            if (!item.TryGetProperty("type", out var itemType) ||
                itemType.GetString() != "message" ||
                !item.TryGetProperty("content", out var contentElement))
            {
                continue;
            }

            foreach (var contentItem in contentElement.EnumerateArray())
            {
                if (!contentItem.TryGetProperty("type", out var contentType) ||
                    contentType.GetString() != "output_text" ||
                    !contentItem.TryGetProperty("text", out var textElement))
                {
                    continue;
                }

                return textElement.GetString();
            }
        }

        return null;
    }

    private static DiscoveryIntent NormalizeIntent(DiscoveryIntent intent)
    {
        var summary = string.IsNullOrWhiteSpace(intent.IntentSummary)
            ? "Nearby local discovery"
            : intent.IntentSummary.Trim();
        var query = string.IsNullOrWhiteSpace(intent.GoogleMapsQuery)
            ? "cafes"
            : intent.GoogleMapsQuery.Trim();
        var plan = string.IsNullOrWhiteSpace(intent.UserFacingPlan)
            ? $"Find nearby {query.ToLowerInvariant()} and stitch the closest stops into a short route."
            : intent.UserFacingPlan.Trim();

        var finalDest = string.IsNullOrWhiteSpace(intent.FinalDestinationQuery)
            ? null
            : intent.FinalDestinationQuery.Trim();

        int? targetDist = intent.TargetDistanceMeters is > 0
            ? Math.Clamp(intent.TargetDistanceMeters.Value, 500, 30000)
            : null;

        return intent with
        {
            IntentSummary = summary,
            GoogleMapsQuery = query,
            RadiusMeters = Math.Clamp(intent.RadiusMeters, 500, 20000),
            MaxResultCount = Math.Clamp(intent.MaxResultCount, 3, 8),
            RouteStopCount = Math.Clamp(intent.RouteStopCount, 1, 5),
            UserFacingPlan = plan,
            FinalDestinationQuery = finalDest,
            TargetDistanceMeters = targetDist,
        };
    }
}
