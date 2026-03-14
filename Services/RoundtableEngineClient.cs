using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using luke_hacks.Configuration;
using luke_hacks.Models;
using Microsoft.Extensions.Options;

namespace luke_hacks.Services;

public sealed class RoundtableEngineClient
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true,
    };

    private readonly HttpClient _httpClient;
    private readonly RoundtableOptions _options;

    public RoundtableEngineClient(HttpClient httpClient, IOptions<RoundtableOptions> options)
    {
        _httpClient = httpClient;
        _options = options.Value;
    }

    public async Task<string> CreateSessionAsync(int expectedCount, CancellationToken cancellationToken)
    {
        var url = BuildAbsoluteUrl("/roundtable/session");
        var response = await _httpClient.PostAsJsonAsync(
            url,
            new { expected_count = expectedCount },
            cancellationToken);

        response.EnsureSuccessStatusCode();
        var payload = await response.Content.ReadFromJsonAsync<CreateSessionResponse>(JsonOptions, cancellationToken);
        if (payload?.SessionId is null)
        {
            throw new InvalidOperationException("Roundtable engine returned an empty session id.");
        }

        return payload.SessionId;
    }

    public async Task JoinSessionAsync(
        string sessionId,
        string userId,
        CollaborativePlanningConstraints constraints,
        CancellationToken cancellationToken)
    {
        var url = BuildAbsoluteUrl($"/roundtable/session/{sessionId}/join");
        var request = new
        {
            user_id = userId,
            constraints = new
            {
                name = constraints.Name,
                budget = constraints.Budget,
                dietary = constraints.Dietary,
                location = constraints.Location,
                mood = constraints.Mood,
                time = constraints.Time,
            },
        };

        var response = await _httpClient.PostAsJsonAsync(url, request, cancellationToken);
        response.EnsureSuccessStatusCode();
    }

    public async Task SubmitVetoAsync(
        string sessionId,
        string userId,
        string reason,
        CancellationToken cancellationToken)
    {
        var url = BuildAbsoluteUrl($"/roundtable/session/{sessionId}/veto");
        var response = await _httpClient.PostAsJsonAsync(
            url,
            new
            {
                user_id = userId,
                reason,
            },
            cancellationToken);

        if (response.IsSuccessStatusCode)
        {
            return;
        }

        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        var message = ExtractErrorMessage(body);
        throw new RoundtableEngineException(
            (int)response.StatusCode,
            string.IsNullOrWhiteSpace(message)
                ? $"Roundtable veto request failed with status code {(int)response.StatusCode}."
                : message);
    }

    public async Task SubmitFeedbackAsync(
        string sessionId,
        string userId,
        string text,
        CancellationToken cancellationToken)
    {
        var url = BuildAbsoluteUrl($"/roundtable/session/{sessionId}/feedback");
        var response = await _httpClient.PostAsJsonAsync(
            url,
            new
            {
                user_id = userId,
                text,
            },
            cancellationToken);

        if (response.IsSuccessStatusCode)
        {
            return;
        }

        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        var message = ExtractErrorMessage(body);
        throw new RoundtableEngineException(
            (int)response.StatusCode,
            string.IsNullOrWhiteSpace(message)
                ? $"Roundtable feedback request failed with status code {(int)response.StatusCode}."
                : message);
    }

    public async IAsyncEnumerable<RoundtableSseEvent> StreamSessionAsync(
        string sessionId,
        string userId,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var url = BuildAbsoluteUrl($"/roundtable/session/{sessionId}/stream?user_id={Uri.EscapeDataString(userId)}");
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        using var response = await _httpClient.SendAsync(
            request,
            HttpCompletionOption.ResponseHeadersRead,
            cancellationToken);

        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var reader = new StreamReader(stream, Encoding.UTF8);

        string? eventType = null;
        var dataBuilder = new StringBuilder();

        while (!reader.EndOfStream && !cancellationToken.IsCancellationRequested)
        {
            var line = await reader.ReadLineAsync(cancellationToken);
            if (line is null)
            {
                break;
            }

            if (line.Length == 0)
            {
                if (!string.IsNullOrWhiteSpace(eventType))
                {
                    var payload = dataBuilder.ToString();
                    yield return new RoundtableSseEvent(eventType, payload);
                }

                eventType = null;
                dataBuilder.Clear();
                continue;
            }

            if (line.StartsWith("event:", StringComparison.Ordinal))
            {
                eventType = line["event:".Length..].Trim();
                continue;
            }

            if (line.StartsWith("data:", StringComparison.Ordinal))
            {
                if (dataBuilder.Length > 0)
                {
                    dataBuilder.Append('\n');
                }

                dataBuilder.Append(line["data:".Length..].TrimStart());
            }
        }
    }

    private string BuildAbsoluteUrl(string path)
    {
        var baseUrl = _options.BaseUrl.TrimEnd('/');
        var cleanPath = path.StartsWith('/') ? path : $"/{path}";
        return $"{baseUrl}{cleanPath}";
    }

    private static string? ExtractErrorMessage(string body)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return null;
        }

        try
        {
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            if (root.ValueKind == JsonValueKind.Object)
            {
                if (root.TryGetProperty("detail", out var detail) && detail.ValueKind == JsonValueKind.String)
                {
                    return detail.GetString();
                }

                if (root.TryGetProperty("error", out var error) && error.ValueKind == JsonValueKind.String)
                {
                    return error.GetString();
                }
            }
        }
        catch
        {
            // fall through and return raw body
        }

        return body.Trim();
    }

    private sealed record CreateSessionResponse(
        [property: JsonPropertyName("session_id")] string SessionId);
}

public sealed class RoundtableEngineException : Exception
{
    public int StatusCode { get; }

    public RoundtableEngineException(int statusCode, string message)
        : base(message)
    {
        StatusCode = statusCode;
    }
}

public sealed record RoundtableSseEvent(
    string EventType,
    string DataJson);
