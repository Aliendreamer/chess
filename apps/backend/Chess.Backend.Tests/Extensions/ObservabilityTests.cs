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
    public void Tracing_is_registered_only_when_the_console_exporter_is_switched_on(string? setting, bool expected)
    {
        ServiceCollection services = new();
        services.AddObservability(Configuration(setting));

        Assert.Equal(expected, services.Any(d => d.ServiceType == typeof(TracerProvider)));
    }
}
