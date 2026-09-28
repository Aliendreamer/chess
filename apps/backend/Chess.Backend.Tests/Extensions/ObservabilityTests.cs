using System.Diagnostics;
using Chess.Backend.Akka;
using Chess.Backend.Extensions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;

namespace Chess.Backend.Tests.Extensions;

public sealed class ObservabilityTests
{
    private static IConfiguration Configuration(params (string Key, string? Value)[] values) => new ConfigurationBuilder()
        .AddInMemoryCollection(values.Select(v => new KeyValuePair<string, string?>(v.Key, v.Value)))
        .Build();

    [Fact]
    public void An_actor_span_comes_from_the_traced_source_and_carries_the_ping_id_and_sequence()
    {
        Assert.Equal("chess.actors", ActorTracing.SourceName); // the name the tracer subscribes to

        // Without a listener ActivitySource returns null, which is exactly what production does when
        // tracing is off — so the tags are asserted under a listener that samples everything.
        using ActivityListener listener = new()
        {
            ShouldListenTo = source => source.Name == ActorTracing.SourceName,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllDataAndRecorded,
        };
        ActivitySource.AddActivityListener(listener);

        using Activity? activity = ActorTracing.StartPingHandle("p1", 3);

        Assert.NotNull(activity); // non-null only because the source's name matched SourceName
        Assert.Equal("ping.handle", activity.OperationName);
        Assert.Equal("p1", activity.GetTagItem("ping.id"));
        Assert.Equal(3L, activity.GetTagItem("ping.seq"));
    }

    [Theory]
    [InlineData(null, false)]
    [InlineData("false", false)]
    [InlineData("true", true)]
    public void Traces_and_metrics_are_exported_only_when_the_switch_is_on(string? enabled, bool expected)
    {
        ServiceCollection services = new();
        services.AddObservability(Configuration(("Observability:Enabled", enabled)), "backend-2");

        Assert.Equal(expected, services.Any(d => d.ServiceType == typeof(TracerProvider)));
        Assert.Equal(expected, services.Any(d => d.ServiceType == typeof(MeterProvider)));
    }

    [Fact]
    public void The_old_console_switch_no_longer_turns_tracing_on()
    {
        ServiceCollection services = new();
        services.AddObservability(Configuration(("Observability:Console", "true")), "backend");

        Assert.DoesNotContain(services, d => d.ServiceType == typeof(TracerProvider));
    }

    [Fact]
    public void The_resource_names_the_app_the_node_and_the_environment()
    {
        IReadOnlyDictionary<string, object> attributes = ObservabilityExtensions.ResourceAttributes(
            new ObservabilityOptions { Environment = "local" }, "backend-2");

        Assert.Equal("chess-backend", attributes["service.name"]);
        Assert.Equal("backend-2", attributes["service.instance.id"]);
        Assert.Equal("local", attributes["deployment.environment"]);
    }
}
