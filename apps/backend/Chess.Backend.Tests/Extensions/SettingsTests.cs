using Chess.Backend.Akka;
using Chess.Backend.Akka.Outbox;
using Chess.Backend.Correspondence;
using Chess.Backend.Engine;
using Chess.Backend.Extensions;
using Chess.Backend.Messaging;
using Chess.Backend.Projections;
using Microsoft.Extensions.Configuration;

namespace Chess.Backend.Tests.Extensions;

/// <summary>
/// Every operational value comes from validated configuration (startup-logging-and-config): each options class
/// refuses a nonsense value, and the shipped <c>appsettings.json</c> says exactly what the code defaults say.
/// </summary>
public sealed class SettingsTests
{
    private static readonly IConfiguration Shipped = new ConfigurationBuilder()
        .AddJsonFile(Path.Combine(AppContext.BaseDirectory, "Config", "appsettings.json"), optional: false)
        .Build();

    private static T Bound<T>(string section)
        where T : new() => Shipped.GetSection(section).Get<T>() ?? new T();

    [Fact]
    public void The_shipped_file_matches_the_code_defaults()
    {
        Assert.Equivalent(new ApiOptions(), Bound<ApiOptions>(ApiOptions.SectionName), strict: true);
        Assert.Equivalent(new RateLimitOptions(), Bound<RateLimitOptions>(RateLimitOptions.SectionName), strict: true);
        Assert.Equivalent(new CacheOptions(), Bound<CacheOptions>(CacheOptions.SectionName), strict: true);
        Assert.Equivalent(new DatabaseOptions(), Bound<DatabaseOptions>(DatabaseOptions.SectionName), strict: true);
        Assert.Equivalent(new KafkaOptions(), Bound<KafkaOptions>(KafkaOptions.SectionName), strict: true);
        Assert.Equivalent(new AkkaOptions(), Bound<AkkaOptions>(AkkaOptions.SectionName), strict: true);
        Assert.Equivalent(new JournalPublisherOptions(), Bound<JournalPublisherOptions>(JournalPublisherOptions.SectionName), strict: true);
        Assert.Equivalent(new PublisherLagOptions(), Bound<PublisherLagOptions>(PublisherLagOptions.SectionName), strict: true);
        Assert.Equivalent(new ProjectionDeadLetterOptions(), Bound<ProjectionDeadLetterOptions>(ProjectionDeadLetterOptions.SectionName), strict: true);
        Assert.Equivalent(new SessionStoreOptions(), Bound<SessionStoreOptions>(SessionStoreOptions.SectionName), strict: true);
        Assert.Equivalent(new SessionCookieOptions(), Bound<SessionCookieOptions>(SessionCookieOptions.SectionName), strict: true);
        Assert.Equivalent(new EngineOptions(), Bound<EngineOptions>(EngineOptions.SectionName), strict: true);
        Assert.Equivalent(new CorrespondenceOptions(), Bound<CorrespondenceOptions>(CorrespondenceOptions.SectionName), strict: true);

        // Keycloak's section holds environment values (client id, URLs); only its tuning must match.
        Assert.Equal(new KeycloakOptions().HttpTimeoutSeconds, Bound<KeycloakOptions>(KeycloakOptions.SectionName).HttpTimeoutSeconds);
    }

    [Fact]
    public void The_defaults_are_todays_values()
    {
        Assert.Equal((5, 10, 50, 200), (new ApiOptions().AskTimeoutSeconds, new ApiOptions().InviteAskTimeoutSeconds, new ApiOptions().DefaultPageSize, new ApiOptions().MaxPageSize));
        Assert.Equal((10, 10, 60), (new CacheOptions().DefaultMinutes, new CacheOptions().UserIdMinutes, new CacheOptions().OidcDiscoveryMinutes));
        Assert.Equal(10, new DatabaseOptions().ReplicaMaxLagSeconds);
        Assert.Equal((3, 5), (new KafkaOptions().HealthTimeoutSeconds, new KafkaOptions().ConsumerRetrySeconds));
        Assert.Equal((5, 5), (new AkkaOptions().MatchmakingSweepSeconds, new AkkaOptions().IdlePassivationMinutes));
        Assert.Equal(15, new KeycloakOptions().HttpTimeoutSeconds);
    }

    [Fact]
    public void Every_default_is_valid()
    {
        new ApiOptions().Validate();
        new RateLimitOptions().Validate();
        new CacheOptions().Validate();
        new DatabaseOptions().Validate();
        new KafkaOptions().Validate();
        new AkkaOptions().Validate();
        new KeycloakOptions().Validate();
        new JournalPublisherOptions().Validate();
        new PublisherLagOptions().Validate();
        new ProjectionDeadLetterOptions().Validate();
        new SessionStoreOptions().Validate();
    }

    public static TheoryData<string, Action> Invalid() => new()
    {
        { "Api:AskTimeoutSeconds", () => new ApiOptions { AskTimeoutSeconds = 0 }.Validate() },
        { "Api:MaxPageSize < DefaultPageSize", () => new ApiOptions { DefaultPageSize = 300, MaxPageSize = 200 }.Validate() },
        { "Cache:UserIdMinutes", () => new CacheOptions { UserIdMinutes = 0 }.Validate() },
        { "Database:ReplicaMaxLagSeconds", () => new DatabaseOptions { ReplicaMaxLagSeconds = 0 }.Validate() },
        { "Kafka:HealthTimeoutSeconds", () => new KafkaOptions { HealthTimeoutSeconds = 0 }.Validate() },
        { "Akka:MatchmakingSweepSeconds", () => new AkkaOptions { MatchmakingSweepSeconds = 0 }.Validate() },
        { "Keycloak:HttpTimeoutSeconds", () => new KeycloakOptions { HttpTimeoutSeconds = 0 }.Validate() },
        { "Outbox:BatchSize", () => new JournalPublisherOptions { BatchSize = 0 }.Validate() },
        { "Outbox:DegradedAfter", () => new PublisherLagOptions { DegradedAfter = TimeSpan.Zero }.Validate() },
        { "Projections:DeadLetter:MaxAttempts", () => new ProjectionDeadLetterOptions { MaxAttempts = 0 }.Validate() },
        { "SessionStore:CleanupInterval", () => new SessionStoreOptions { CleanupInterval = TimeSpan.Zero }.Validate() },
        { "Engine:MinThinkMs", () => new EngineOptions { MinThinkMs = 8_000, MaxThinkMs = 5_000 }.Validate() },
        { "Engine:StallSeconds", () => new EngineOptions { StallSeconds = 5 }.Validate() },
        { "Correspondence:MoveDeadline", () => new CorrespondenceOptions { MoveDeadline = TimeSpan.Zero }.Validate() },
    };

    [Theory]
    [MemberData(nameof(Invalid))]
    public void A_nonsense_value_is_refused_naming_the_setting(string setting, Action validate)
    {
        ArgumentNullException.ThrowIfNull(validate);
        InvalidOperationException ex = Assert.Throws<InvalidOperationException>(validate);
        Assert.Contains(setting.Split(' ')[0], ex.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Configured_roles_replace_the_default_instead_of_adding_to_it()
    {
        // The binder appends arrays onto a non-empty default: a node configured with ["backend"] ran as backend twice.
        IConfiguration config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Akka:Roles:0"] = "backend" })
            .Build();

        Assert.Equal(["backend"], config.GetSection(AkkaOptions.SectionName).Get<AkkaOptions>()!.EffectiveRoles);
        Assert.Equal(["backend"], new AkkaOptions().EffectiveRoles);
    }
}
