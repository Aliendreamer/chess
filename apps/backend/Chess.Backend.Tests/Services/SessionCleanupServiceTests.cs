using Microsoft.Extensions.DependencyInjection;

namespace Chess.Backend.Tests.Services;

public sealed class SessionCleanupServiceTests
{
    [Fact]
    public async Task RunOnce_purges_through_a_scoped_store()
    {
        Mock<ISessionStore> store = new();
        store.Setup(s => s.PurgeAsync(TimeSpan.FromDays(2), It.IsAny<CancellationToken>())).ReturnsAsync(3);
        ServiceProvider provider = new ServiceCollection().AddScoped(_ => store.Object).BuildServiceProvider();
        SessionCleanupService service = new(
            provider.GetRequiredService<IServiceScopeFactory>(),
            Options.Create(new SessionStoreOptions { PurgeGrace = TimeSpan.FromDays(2) }),
            NullLogger<SessionCleanupService>.Instance);

        await service.RunOnceAsync(TimeSpan.FromDays(2), CancellationToken.None);

        store.Verify(s => s.PurgeAsync(TimeSpan.FromDays(2), It.IsAny<CancellationToken>()), Times.Once);
        await provider.DisposeAsync();
    }

    [Fact]
    public async Task ExecuteAsync_runs_immediately_and_stops_on_cancellation()
    {
        Mock<ISessionStore> store = new();
        TaskCompletionSource purged = new(TaskCreationOptions.RunContinuationsAsynchronously);
        store.Setup(s => s.PurgeAsync(It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>())).Callback(() => purged.TrySetResult()).ReturnsAsync(0);
        ServiceProvider provider = new ServiceCollection().AddScoped(_ => store.Object).BuildServiceProvider();
        SessionCleanupService service = new(
            provider.GetRequiredService<IServiceScopeFactory>(),
            Options.Create(new SessionStoreOptions { CleanupInterval = TimeSpan.FromHours(1) }),
            NullLogger<SessionCleanupService>.Instance);
        using CancellationTokenSource cts = new();

        await service.StartAsync(cts.Token);
        await purged.Task.WaitAsync(TimeSpan.FromSeconds(10)); // the call itself, not a fixed sleep that loses under load
        await cts.CancelAsync();
        await service.StopAsync(CancellationToken.None);

        store.Verify(s => s.PurgeAsync(It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()), Times.Once);
        await provider.DisposeAsync();
    }

    [Fact]
    public async Task ExecuteAsync_survives_a_failing_purge()
    {
        Mock<ISessionStore> store = new();
        TaskCompletionSource purged = new(TaskCreationOptions.RunContinuationsAsynchronously);
        store.Setup(s => s.PurgeAsync(It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>())).Callback(() => purged.TrySetResult()).ThrowsAsync(new DbUpdateException("boom"));
        ServiceProvider provider = new ServiceCollection().AddScoped(_ => store.Object).BuildServiceProvider();
        SessionCleanupService service = new(
            provider.GetRequiredService<IServiceScopeFactory>(),
            Options.Create(new SessionStoreOptions { CleanupInterval = TimeSpan.FromHours(1) }),
            NullLogger<SessionCleanupService>.Instance);
        using CancellationTokenSource cts = new();

        await service.StartAsync(cts.Token);
        await purged.Task.WaitAsync(TimeSpan.FromSeconds(10)); // the call itself, not a fixed sleep that loses under load
        await cts.CancelAsync();
        await service.StopAsync(CancellationToken.None);

        store.Verify(s => s.PurgeAsync(It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()), Times.Once);
        await provider.DisposeAsync();
    }
}
