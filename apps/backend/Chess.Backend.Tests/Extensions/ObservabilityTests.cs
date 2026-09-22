using System.Diagnostics;
using Chess.Backend.Akka;
using Chess.Backend.Extensions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using OpenTelemetry.Trace;

namespace Chess.Backend.Tests.Extensions;

public sealed class ObservabilityTests
{
    private static IConfiguration Configuration(string? consoleExporter) => new ConfigurationBuilder()
        .AddInMemoryCollection([new KeyValuePair<string, string?>("Observability:Console", consoleExporter)])
        .Build();

    [Fact]
    public void The_actor_activity_source_is_the_one_the_tracer_subscribes_to()
    {
        Assert.Equal("chess.actors", ActorTracing.SourceName);
        Assert.Equal(ActorTracing.SourceName, ActorTracing.Source.Name);
    }

    [Fact]
    public void An_actor_span_carries_the_ping_id_and_sequence()
    {
        // Without a listener ActivitySource returns null, which is exactly what production does when
        // tracing is off — so the tags are asserted under a listener that samples everything.
        using ActivityListener listener = new()
        {
            ShouldListenTo = source => source.Name == ActorTracing.SourceName,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllDataAndRecorded,
        };
        ActivitySource.AddActivityListener(listener);

        using Activity? activity = ActorTracing.StartPingHandle("p1", 3);

        Assert.NotNull(activity);
        Assert.Equal("ping.handle", activity.OperationName);
        Assert.Equal("p1", activity.GetTagItem("ping.id"));
        Assert.Equal(3L, activity.GetTagItem("ping.seq"));
    }

    [Fact]
    public void Tracing_is_registered_only_when_the_console_exporter_is_switched_on()
    {
        foreach ((string? setting, bool expected) in new[] { ((string?)null, false), ("false", false), ("true", true) })
        {
            ServiceCollection services = new();
            services.AddObservability(Configuration(setting));

            bool registered = services.Any(d => d.ServiceType == typeof(TracerProvider));
            Assert.Equal(expected, registered);
        }
    }
}
