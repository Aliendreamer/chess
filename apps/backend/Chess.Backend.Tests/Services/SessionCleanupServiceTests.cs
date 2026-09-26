using Microsoft.Extensions.DependencyInjection;

namespace Chess.Backend.Tests.Services;

public sealed class SessionCleanupServiceTests
{
    private static (SessionCleanupService Service, ServiceProvider Provider) Build(Mock<ISessionStore> store, SessionStoreOptions options)
    {
        ServiceProvider provider = new ServiceCollection().AddScoped(_ => store.Object).BuildServiceProvider();
        SessionCleanupService service = new(
            provider.GetRequiredService<IServiceScopeFactory>(),
            Options.Create(options),
            NullLogger<SessionCleanupService>.Instance);
        return (service, provider);
    }

    [Fact]
    public async Task RunOnce_purges_through_a_scoped_store()
    {
        Mock<ISessionStore> store = new();
        store.Setup(s => s.PurgeAsync(TimeSpan.FromDays(2), It.IsAny<CancellationToken>())).ReturnsAsync(3);
        (SessionCleanupService service, ServiceProvider provider) = Build(store, new SessionStoreOptions { PurgeGrace = TimeSpan.FromDays(2) });

        await service.RunOnceAsync(TimeSpan.FromDays(2), CancellationToken.None);

        store.Verify(s => s.PurgeAsync(TimeSpan.FromDays(2), It.IsAny<CancellationToken>()), Times.Once);
        await provider.DisposeAsync();
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)] // a failing purge is logged, not fatal: the loop still stops cleanly
    public async Task ExecuteAsync_runs_immediately_and_stops_on_cancellation(bool purgeFails)
    {
        Mock<ISessionStore> store = new();
        TaskCompletionSource purged = new(TaskCreationOptions.RunContinuationsAsynchronously);
        if (purgeFails)
        {
            store.Setup(s => s.PurgeAsync(It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>())).Callback(() => purged.TrySetResult()).ThrowsAsync(new DbUpdateException("boom"));
        }
        else
        {
            store.Setup(s => s.PurgeAsync(It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>())).Callback(() => purged.TrySetResult()).ReturnsAsync(0);
        }

        (SessionCleanupService service, ServiceProvider provider) = Build(store, new SessionStoreOptions { CleanupInterval = TimeSpan.FromHours(1) });
        using CancellationTokenSource cts = new();

        await service.StartAsync(cts.Token);
        await purged.Task.WaitAsync(TimeSpan.FromSeconds(10)); // the call itself, not a fixed sleep that loses under load
        await cts.CancelAsync();
        await service.StopAsync(CancellationToken.None);

        store.Verify(s => s.PurgeAsync(It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()), Times.Once);
        await provider.DisposeAsync();
    }
}
