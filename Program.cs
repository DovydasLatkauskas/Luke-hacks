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
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "Data Source=luke-hacks.db";
var dataProtectionPath = Path.Combine(builder.Environment.ContentRootPath, ".keys");

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
            intent.UserFacingPlan);
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

            route = await googleMaps.ComputeRouteAsync(request.CurrentLocation, routeStops, cancellationToken);
        }
        else
        {
            var searchOrigin = selectedStops.Count == 0
                ? request.CurrentLocation
                : new Coordinate(selectedStops[^1].Lat, selectedStops[^1].Lng);

            var searchIntent = new DiscoveryIntent(
                session.IntentSummary,
                session.SearchQuery,
                session.RadiusMeters,
                8,
                session.RouteStopCount,
                session.OpenNow,
                session.PlanSummary);

            var selectedIds = selectedStops
                .Select(stop => stop.Id)
                .ToHashSet(StringComparer.Ordinal);

            nextOptions = (await googleMaps.SearchPlacesAsync(searchIntent, searchOrigin, cancellationToken))
                .Where(place => !selectedIds.Contains(place.Id))
                .OrderBy(place => place.DistanceMeters)
                .Take(5)
                .ToList();
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

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    dbContext.Database.EnsureCreated();
}

app.Run();
