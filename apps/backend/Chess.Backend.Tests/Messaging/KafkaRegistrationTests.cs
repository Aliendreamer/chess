using Chess.Backend.Extensions;
using Chess.Backend.Messaging;
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
    public void Empty_bootstrap_servers_registers_the_null_publisher_and_no_consumer_host()
    {
        ServiceCollection services = Base();
        services.AddMessaging(Configuration(string.Empty));

        Assert.Contains(services, d => d.ServiceType == typeof(IEventPublisher) && d.ImplementationType == typeof(NullEventPublisher));
        Assert.DoesNotContain(services, d => d.ServiceType == typeof(IHostedService) && d.ImplementationType == typeof(KafkaConsumerHost));
        Assert.DoesNotContain(services, d => d.ServiceType == typeof(IProducer<string, string>));
    }

    [Fact]
    public void Nonempty_bootstrap_servers_registers_the_kafka_publisher_and_the_consumer_host()
    {
        ServiceCollection services = Base();
        services.AddMessaging(Configuration("redpanda:9092"));

        Assert.Contains(services, d => d.ServiceType == typeof(IEventPublisher) && d.ImplementationFactory is not null);
        Assert.Contains(services, d => d.ServiceType == typeof(IHostedService) && d.ImplementationType == typeof(KafkaConsumerHost));
        Assert.Contains(services, d => d.ServiceType == typeof(IProducer<string, string>));
        Assert.DoesNotContain(services, d => d.ServiceType == typeof(IEventPublisher) && d.ImplementationType == typeof(NullEventPublisher));
    }

    [Fact]
    public void Kafka_health_check_registers_only_when_enabled()
    {
        foreach ((string bootstrapServers, bool expected) in new[] { (string.Empty, false), ("redpanda:9092", true) })
        {
            ServiceCollection services = Base();
            KafkaOptions kafka = new() { BootstrapServers = bootstrapServers };
            services.AddSingleton(kafka);
            IHealthChecksBuilder health = services.AddHealthChecks();
            if (kafka.Enabled)
            {
                services.AddSingleton<KafkaHealthCheck>();
                health.AddCheck<KafkaHealthCheck>("kafka");
            }

            bool registered = services.Any(d => d.ServiceType == typeof(KafkaHealthCheck) && d.Lifetime == ServiceLifetime.Singleton);
            Assert.Equal(expected, registered);
        }
    }
}
