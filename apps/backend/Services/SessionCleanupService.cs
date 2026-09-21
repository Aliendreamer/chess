namespace Chess.Backend.Services;

/// <summary>Periodically purges revoked/expired sessions so the table does not grow forever.</summary>
internal sealed class SessionCleanupService(
    IServiceScopeFactory scopeFactory,
    IOptions<SessionStoreOptions> options,
    ILogger<SessionCleanupService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        SessionStoreOptions settings = options.Value;
        using PeriodicTimer timer = new(settings.CleanupInterval);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunOnceAsync(settings.PurgeGrace, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex) when (ex is DbUpdateException or InvalidOperationException or TimeoutException)
            {
                Log.CleanupFailed(logger, ex);
            }

            if (!await timer.WaitForNextTickAsync(stoppingToken))
            {
                return;
            }
        }
    }

    internal async Task RunOnceAsync(TimeSpan grace, CancellationToken ct)
    {
        using IServiceScope scope = scopeFactory.CreateScope();
        ISessionStore store = scope.ServiceProvider.GetRequiredService<ISessionStore>();
        await store.PurgeAsync(grace, ct);
    }
}
