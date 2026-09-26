using Chess.Backend.Projections;
using Microsoft.Extensions.DependencyInjection;

namespace Chess.Backend.Tests.Support;

/// <summary>
/// A DI container shaped like the consumer host's: scoped <see cref="ProjectDbContext"/> instances over one shared
/// in-memory database, the real <see cref="DeadLetterStore"/> and a fixed clock. Each helper runs in its own scope.
/// </summary>
internal sealed class ProjectionHost
{
    public static readonly DateTimeOffset T0 = Time.Utc("2026-09-24T10:00:00Z");

    public ProjectionHost(Action<IServiceCollection> configure)
    {
        string db = Guid.NewGuid().ToString("N");
        ServiceCollection services = new();
        services.AddLogging();
        services.AddSingleton<TimeProvider>(new FakeClock(T0));
        services.AddScoped(_ => TestDb.Create(name: db));
        services.AddScoped<IDeadLetterStore, DeadLetterStore>();
        configure(services);
        Provider = services.BuildServiceProvider();
    }

    public ServiceProvider Provider { get; }

    public async Task<T> ScopedAsync<T>(Func<IServiceProvider, Task<T>> body)
    {
        using IServiceScope scope = Provider.CreateScope();
        return await body(scope.ServiceProvider);
    }

    public async Task ScopedAsync(Func<IServiceProvider, Task> body)
    {
        using IServiceScope scope = Provider.CreateScope();
        await body(scope.ServiceProvider);
    }

    public Task<T> WithDbAsync<T>(Func<ProjectDbContext, Task<T>> read) =>
        ScopedAsync(sp => read(sp.GetRequiredService<ProjectDbContext>()));

    /// <summary>Parks a record as if it had failed 5 times, quarantining the aggregate in <paramref name="group"/>.</summary>
    public Task ParkAsync(string group, string aggregateId, long seq, string value = "{}") =>
        ScopedAsync(sp => sp.GetRequiredService<IDeadLetterStore>()
            .ParkAsync(new ParkRequest(group, aggregateId, seq, aggregateId, value, 5, "parked", T0), CancellationToken.None));
}
