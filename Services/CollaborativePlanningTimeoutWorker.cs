using Microsoft.Extensions.Hosting;

namespace luke_hacks.Services;

public sealed class CollaborativePlanningTimeoutWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<CollaborativePlanningTimeoutWorker> _logger;

    public CollaborativePlanningTimeoutWorker(
        IServiceProvider serviceProvider,
        ILogger<CollaborativePlanningTimeoutWorker> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var service = scope.ServiceProvider.GetRequiredService<CollaborativePlanningService>();
                await service.StartEligibleChatsAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Collaborative planning timeout worker iteration failed.");
            }

            await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
        }
    }
}
