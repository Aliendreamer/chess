using Chess.Backend.Extensions;
using Microsoft.Extensions.Configuration;

namespace Chess.Backend.Tests.Extensions;

public sealed class StartupSummaryTests
{
    private const string DbPassword = "pg-s3cret";
    private const string RedisPassword = "r3dis-pw";
    private const string ClientSecret = "kc-client-secret";

    private static IConfiguration Config(params (string Key, string? Value)[] extra)
    {
        Dictionary<string, string?> values = new()
        {
            ["ConnectionStrings:Postgres"] = $"Host=postgres;Port=5432;Database=chess;Username=chess;Password={DbPassword}",
            ["ConnectionStrings:PostgresReplica"] = $"Host=postgres-replica;Port=5433;Database=chess;Username=chess;Password={DbPassword}",
            ["ConnectionStrings:Redis"] = $"redis:6379,password={RedisPassword}",
            ["Keycloak:Authority"] = "http://keycloak.chess.localhost/realms/chess",
            ["Keycloak:Audience"] = "chess_api",
            ["Keycloak:ClientSecret"] = ClientSecret,
            ["Akka:Hostname"] = "backend",
            ["Akka:Port"] = "8091",
            ["Akka:SeedNodes:0"] = "akka.tcp://chess@backend:8091",
            ["Akka:SeedNodes:1"] = "akka.tcp://chess@backend-2:8091",
            ["Kafka:BootstrapServers"] = "redpanda:9092",
            ["RateLimit:PermitLimit"] = "300",
            ["RateLimit:WindowSeconds"] = "60",
            ["Akka:AbandonAfterSeconds"] = "60",
            ["Akka:PresenceLeaseSeconds"] = "75",
        };
        foreach ((string key, string? value) in extra)
        {
            values[key] = value;
        }

        return new ConfigurationBuilder().AddInMemoryCollection(values).Build();
    }

    [Fact]
    public void It_describes_what_shapes_the_node()
    {
        IReadOnlyDictionary<string, string> summary = StartupSummary.Describe(Config());

        Assert.Equal("backend:8091", summary["Akka"]);
        Assert.Equal("akka.tcp://chess@backend:8091, akka.tcp://chess@backend-2:8091", summary["AkkaSeeds"]);
        Assert.Equal("backend", summary["AkkaRoles"]);
        Assert.Equal("redpanda:9092", summary["Kafka"]);
        Assert.Equal("on", summary["Redis"]);
        Assert.Equal("postgres:5432/chess", summary["Postgres"]);
        Assert.Equal("postgres-replica:5433/chess", summary["PostgresReplica"]);
        Assert.Equal("http://keycloak.chess.localhost/realms/chess (audience chess_api)", summary["Keycloak"]);
        Assert.Equal("300 per 60 s", summary["RateLimit"]);
        Assert.Equal("abandon after 60 s, lease 75 s", summary["Presence"]);
    }

    [Fact]
    public void No_secret_ever_appears()
    {
        string all = string.Join(" | ", StartupSummary.Describe(Config()).Select(kv => $"{kv.Key}={kv.Value}"));

        Assert.DoesNotContain(DbPassword, all, StringComparison.Ordinal);
        Assert.DoesNotContain(RedisPassword, all, StringComparison.Ordinal);
        Assert.DoesNotContain(ClientSecret, all, StringComparison.Ordinal);
        Assert.DoesNotContain("Password", all, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Missing_or_broken_settings_are_named_not_printed()
    {
        IReadOnlyDictionary<string, string> summary = StartupSummary.Describe(Config(
            ("Kafka:BootstrapServers", ""),
            ("ConnectionStrings:Redis", ""),
            ("ConnectionStrings:PostgresReplica", $"not a connection string ;;= Password={DbPassword}")));

        Assert.Equal(("off", "off", "(unparseable)"), (summary["Kafka"], summary["Redis"], summary["PostgresReplica"]));
    }

    [Fact]
    public void Defaults_fill_what_the_config_leaves_out()
    {
        IReadOnlyDictionary<string, string> summary = StartupSummary.Describe(new ConfigurationBuilder().Build());

        Assert.Equal(("localhost:8091", "(self)", "off", "(not set)"), (summary["Akka"], summary["AkkaSeeds"], summary["Kafka"], summary["Postgres"]));
        Assert.Equal("300 per 60 s", summary["RateLimit"]);
    }
}
