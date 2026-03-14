using luke_hacks.Configuration;
using luke_hacks.Models;
using luke_hacks.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddProblemDetails();
builder.Services.AddSwaggerGen();
builder.Services.AddHttpClient<OpenAiPlanningService>();
builder.Services.AddHttpClient<GoogleMapsService>();
builder.Services.Configure<OpenAiOptions>(builder.Configuration.GetSection("OpenAI"));
builder.Services.Configure<GoogleMapsOptions>(builder.Configuration.GetSection("GoogleMaps"));
builder.Services.PostConfigure<OpenAiOptions>(options =>
{
    options.ApiKey = Environment.GetEnvironmentVariable("OPENAI_API_KEY") ?? options.ApiKey;
    options.Model = Environment.GetEnvironmentVariable("OPENAI_MODEL") ?? options.Model;
});
builder.Services.PostConfigure<GoogleMapsOptions>(options =>
{
    options.ApiKey = Environment.GetEnvironmentVariable("GOOGLE_MAPS_API_KEY") ?? options.ApiKey;
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
        var places = await googleMaps.SearchPlacesAsync(intent, request.CurrentLocation, cancellationToken);
        var routeStops = places.Take(Math.Min(intent.RouteStopCount, places.Count)).ToList();
        var route = await googleMaps.ComputeRouteAsync(request.CurrentLocation, routeStops, cancellationToken);

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

        var route = await googleMaps.ComputeRouteAsync(request.Origin, stops, cancellationToken);
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

app.Run();
