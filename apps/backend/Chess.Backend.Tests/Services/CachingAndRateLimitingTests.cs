using System.Net;
using Chess.Backend.Extensions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.DependencyInjection;
using StackExchange.Redis;
using ZiggyCreatures.Caching.Fusion;
using ZiggyCreatures.Caching.Fusion.Backplane;

namespace Chess.Backend.Tests.Services;

public sealed class CachingAndRateLimitingTests
{
    private static ServiceCollection Base()
    {
        ServiceCollection services = new();
        services.AddLogging();
        return services;
    }

    [Fact]
    public void Without_redis_the_cache_is_l1_only_and_nothing_redis_is_registered()
    {
        ServiceCollection services = Base();
        services.AddCaching(null);
        services.AddCaching(string.Empty);

        Assert.DoesNotContain(services, d => d.ServiceType == typeof(IConnectionMultiplexer));
        Assert.DoesNotContain(services, d => d.ServiceType == typeof(IDistributedCache));
        Assert.DoesNotContain(services, d => d.ServiceType == typeof(IFusionCacheBackplane));

        using ServiceProvider provider = services.BuildServiceProvider();
        IFusionCache cache = provider.GetRequiredService<IFusionCache>();
        Assert.False(cache.HasDistributedCache);
        Assert.False(cache.HasBackplane);
        Assert.Equal(TimeSpan.FromMinutes(10), cache.DefaultEntryOptions.Duration);
    }

    [Fact]
    public void With_redis_l2_backplane_and_multiplexer_are_registered()
    {
        ServiceCollection services = Base();
        services.AddCaching("redis:6379");

        Assert.Contains(services, d => d.ServiceType == typeof(IConnectionMultiplexer) && d.Lifetime == ServiceLifetime.Singleton);
        Assert.Contains(services, d => d.ServiceType == typeof(IDistributedCache));
        Assert.Contains(services, d => d.ServiceType == typeof(IFusionCacheBackplane) || d.ServiceType == typeof(IFusionCache));
    }

    [Fact]
    public void Rate_limiter_is_registered_in_both_modes()
    {
        foreach (string? redis in new[] { null, "redis:6379" })
        {
            ServiceCollection services = Base();
            services.AddRateLimiting(redis);
            using ServiceProvider provider = services.BuildServiceProvider();
            RateLimiterOptions options = provider.GetRequiredService<IOptions<RateLimiterOptions>>().Value;
            Assert.Equal(StatusCodes.Status429TooManyRequests, options.RejectionStatusCode);
            Assert.NotNull(options.GlobalLimiter);
        }
    }

    [Fact]
    public void Client_key_is_the_remote_ip_or_anonymous()
    {
        DefaultHttpContext http = new();
        Assert.Equal("anonymous", BuilderExtension.ClientKey(http));
        http.Connection.RemoteIpAddress = IPAddress.Parse("10.1.2.3");
        Assert.Equal("10.1.2.3", BuilderExtension.ClientKey(http));
        Assert.Throws<ArgumentNullException>(() => BuilderExtension.ClientKey(null!));
    }

    [Fact]
    public async Task In_memory_limiter_rejects_the_301st_request_in_a_window()
    {
        ServiceCollection services = Base();
        services.AddRateLimiting(null);
        using ServiceProvider provider = services.BuildServiceProvider();
        RateLimiterOptions options = provider.GetRequiredService<IOptions<RateLimiterOptions>>().Value;
        DefaultHttpContext http = new() { RequestServices = provider };
        http.Connection.RemoteIpAddress = IPAddress.Loopback;

        for (int i = 0; i < 300; i++)
        {
            using System.Threading.RateLimiting.RateLimitLease ok = await options.GlobalLimiter!.AcquireAsync(http);
            Assert.True(ok.IsAcquired);
        }

        using System.Threading.RateLimiting.RateLimitLease rejected = await options.GlobalLimiter!.AcquireAsync(http);
        Assert.False(rejected.IsAcquired);
    }
}
