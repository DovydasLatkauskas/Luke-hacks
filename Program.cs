using luke_hacks.Models;
using luke_hacks.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddHttpClient<PoiService>();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins("http://localhost:5173").AllowAnyHeader().AllowAnyMethod());
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseCors();

app.MapPost("/api/pois/search", async (SearchPoisRequest request, PoiService poiService) =>
{
    var results = await poiService.SearchAsync(request);
    return Results.Ok(results);
})
.WithName("SearchPois")
.WithOpenApi();

app.Run();