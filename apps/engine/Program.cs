using Chess.Engine;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using Serilog;
using Serilog.Formatting.Compact;

// The engine worker (engine-play D1): Stockfish behind Kafka, outside the Akka cluster. Settings are bound and
// validated before the host starts, so a bad value stops it with the setting's name.
HostApplicationBuilder builder = Host.CreateApplicationBuilder(args);
ObservabilityOptions observability = builder.Configuration.GetSection(ObservabilityOptions.SectionName).Get<ObservabilityOptions>() ?? new ObservabilityOptions();
observability.Validate();
// Who is speaking (observability D2): the app, this container, and the environment.
Dictionary<string, object> resource = new(StringComparer.Ordinal)
{
    ["service.name"] = "chess-engine",
    ["service.instance.id"] = Environment.MachineName,
    ["deployment.environment"] = observability.Environment,
};
builder.Services.AddSerilog(logger =>
{
    logger
        .ReadFrom.Configuration(builder.Configuration)
        .Enrich.FromLogContext()
        .WriteTo.Console(new CompactJsonFormatter());
    if (observability.Enabled)
    {
        logger.WriteTo.OpenTelemetry(o =>
        {
            o.Endpoint = observability.OtlpEndpoint;
            o.Protocol = Serilog.Sinks.OpenTelemetry.OtlpProtocol.Grpc;
            o.ResourceAttributes = resource;
        });
    }
});

if (observability.Enabled)
{
    Uri endpoint = new(observability.OtlpEndpoint);
    builder.Services.AddOpenTelemetry()
        .ConfigureResource(r => r.AddAttributes(resource))
        .WithTracing(t => t
            .SetSampler(new ParentBasedSampler(new TraceIdRatioBasedSampler(observability.SampleRatio)))
            .AddSource(EngineTelemetry.SourceName)
            .AddOtlpExporter(o => o.Endpoint = endpoint))
        .WithMetrics(m => m
            .AddMeter(EngineTelemetry.MeterName, "System.Runtime")
            .AddOtlpExporter((exporter, reader) =>
            {
                exporter.Endpoint = endpoint;
                reader.PeriodicExportingMetricReaderOptions.ExportIntervalMilliseconds = observability.MetricExportSeconds * 1000;
            }));
}

EngineOptions engine = builder.Configuration.GetSection(EngineOptions.SectionName).Get<EngineOptions>() ?? new EngineOptions();
engine.Validate();
KafkaOptions kafka = builder.Configuration.GetSection(KafkaOptions.SectionName).Get<KafkaOptions>() ?? new KafkaOptions();
kafka.Validate();

builder.Services.AddSingleton(engine);
builder.Services.AddSingleton(kafka);
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddHostedService<EngineWorker>();
// A search in flight gets its move time plus slack to finish before the host gives up on it.
builder.Services.Configure<HostOptions>(o => o.ShutdownTimeout = TimeSpan.FromSeconds(engine.SlackSeconds + 10));

await builder.Build().RunAsync().ConfigureAwait(false);
