using Chess.Engine;
using Serilog;
using Serilog.Formatting.Compact;

// The engine worker (engine-play D1): Stockfish behind Kafka, outside the Akka cluster. Settings are bound and
// validated before the host starts, so a bad value stops it with the setting's name.
HostApplicationBuilder builder = Host.CreateApplicationBuilder(args);
builder.Services.AddSerilog(logger => logger
    .ReadFrom.Configuration(builder.Configuration)
    .Enrich.FromLogContext()
    .WriteTo.Console(new CompactJsonFormatter()));

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
