using Chess.Backend.Akka.Outbox;
using Chess.Backend.Extensions;
using Chess.Backend.Messaging;
using Chess.Backend.Projections;
using Chess.Backend.Tests.Support;
using Confluent.Kafka;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;

namespace Chess.Backend.Tests.Messaging;

public sealed class KafkaRegistrationTests
{
    private static ServiceCollection Base()
    {
        ServiceCollection services = new();
        services.AddLogging();
        return services;
    }

    private static IConfiguration Configuration(string bootstrapServers) => new ConfigurationBuilder()
        .AddInMemoryCollection([new KeyValuePair<string, string?>("Kafka:BootstrapServers", bootstrapServers)])
        .Build();

    [Fact]
    public void Empty_bootstrap_servers_registers_no_consumer_host_and_no_producer()
    {
        ServiceCollection services = Base();
        services.AddMessaging(Configuration(string.Empty));

        Assert.DoesNotContain(services, d => d.ServiceType == typeof(IHostedService) && d.ImplementationType == typeof(KafkaConsumerHost));
        Assert.DoesNotContain(services, d => d.ServiceType == typeof(IProducer<string, string>));
    }

    [Fact]
    public void Nonempty_bootstrap_servers_registers_the_consumer_host_but_no_actor_side_producer()
    {
        ServiceCollection services = Base();
        services.AddMessaging(Configuration("redpanda:9092"));

        Assert.Contains(services, d => d.ServiceType == typeof(IHostedService) && d.ImplementationType == typeof(KafkaConsumerHost));
        // The journal publisher builds its own producer inside the singleton; nothing else may produce.
        Assert.DoesNotContain(services, d => d.ServiceType == typeof(IProducer<string, string>));
    }

    [Fact]
    public void Journal_publisher_services_register_only_when_enabled()
    {
        ServiceCollection off = Base();
        off.AddMessaging(Configuration(string.Empty));
        Assert.DoesNotContain(off, d => d.ServiceType == typeof(IPublisherLeaseProvider));
        Assert.DoesNotContain(off, d => d.ServiceType == typeof(JournalEventMappers));

        ServiceCollection on = Base();
        on.AddMessaging(Configuration("redpanda:9092"));
        using ServiceProvider provider = on.BuildServiceProvider();
        JournalEventMappers mappers = provider.GetRequiredService<JournalEventMappers>();
        Assert.All(TopicTagger.BoundTypes, t => Assert.True(mappers.CanMap(t)));
        Assert.NotNull(provider.GetRequiredService<JournalPublisherOptions>());
        // No Postgres connection string in this configuration: the lease provider must say so, not NRE.
        Assert.Throws<InvalidOperationException>(provider.GetRequiredService<IPublisherLeaseProvider>);
    }

    /// <summary>
    /// Walks the exact path <see cref="KafkaConsumerHost"/> takes: discover projections through the
    /// interface, then resolve each one again by its concrete type in a new scope. An interface-only
    /// registration passes discovery and fails the second step, which took the whole host down with
    /// "No service for type 'PingProjection' has been registered".
    /// </summary>
    [Fact]
    public void Every_discovered_projection_can_be_resolved_by_its_concrete_type()
    {
        ServiceCollection services = Base();
        services.AddSingleton(TestDb.Create());
        services.AddMessaging(Configuration("redpanda:9092"));

        using ServiceProvider provider = services.BuildServiceProvider();
        using IServiceScope scope = provider.CreateScope();
        Type[] discovered = [.. scope.ServiceProvider.GetServices<IProjection>().Select(p => p.GetType())];

        Assert.NotEmpty(discovered);
        foreach (Type projection in discovered)
        {
            using IServiceScope probe = provider.CreateScope();
            Assert.NotNull(probe.ServiceProvider.GetRequiredService(projection));
        }
    }

    [Fact]
    public void Kafka_health_check_registers_only_when_enabled()
    {
        foreach ((string bootstrapServers, bool expected) in new[] { (string.Empty, false), ("redpanda:9092", true) })
        {
            ServiceCollection services = Base();
            KafkaOptions kafka = new() { BootstrapServers = bootstrapServers };
            IHealthChecksBuilder health = services.AddHealthChecks();

            // Drives the real production registration (FastEndpointSetup.AddKafkaHealthCheck), not a copy of
            // it, so this test fails if that branch is ever removed or inverted.
            health.AddKafkaHealthCheck(services, kafka);

            bool registered = services.Any(d => d.ServiceType == typeof(KafkaHealthCheck) && d.Lifetime == ServiceLifetime.Singleton);
            Assert.Equal(expected, registered);

            using ServiceProvider provider = services.AddSingleton(TimeProvider.System)
                .AddSingleton<IConfiguration>(new ConfigurationBuilder().Build())
                .BuildServiceProvider();
            HealthCheckRegistration? lag = provider.GetRequiredService<IOptions<HealthCheckServiceOptions>>().Value.Registrations
                .SingleOrDefault(r => r.Name == "journal-publisher");
            Assert.Equal(expected, lag is not null);
            if (lag is not null)
            {
                // A stalled publisher must never take the API out of rotation.
                Assert.Equal(HealthStatus.Degraded, lag.FailureStatus);
                Assert.IsType<PublisherLagHealthCheck>(lag.Factory(provider));
            }
        }
    }
}
