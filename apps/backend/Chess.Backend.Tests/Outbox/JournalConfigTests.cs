using Akka.Actor;
using Akka.Hosting;
using Chess.Backend.Akka;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Chess.Backend.Tests.Outbox;

/// <summary>
/// Pins the journal settings the outbox depends on, as the ActorSystem actually resolves them, so a package
/// bump that changes a default fails here instead of silently breaking EventsByTag in the stack.
/// </summary>
public sealed class JournalConfigTests : IAsyncLifetime
{
    private IHost? _host;
    private global::Akka.Configuration.Config _config = global::Akka.Configuration.Config.Empty;

    public async Task InitializeAsync()
    {
        HostApplicationBuilder builder = Host.CreateApplicationBuilder();
        // The journal plugin connects lazily (on first persist), so an unreachable DB is fine here.
        builder.Services.AddAkka("journal-config", (akka, _) => akka.WithChessPersistence("Host=127.0.0.1;Port=1;Database=x"));
        _host = builder.Build();
        await _host.StartAsync();
        _config = _host.Services.GetRequiredService<ActorSystem>().Settings.Config;
    }

    public async Task DisposeAsync()
    {
        if (_host is not null)
        {
            await _host.StopAsync();
            _host.Dispose();
        }
    }

    [Fact]
    public void Tags_are_written_and_read_through_the_tag_table()
    {
        Assert.Equal("TagTable", _config.GetString("akka.persistence.journal.sql.tag-write-mode"));
        Assert.Equal("TagTable", _config.GetString("akka.persistence.query.journal.sql.tag-read-mode"));
    }

    [Fact]
    public void Topic_tagger_is_bound_to_pinged()
    {
        Assert.Contains("TopicTagger", _config.GetString("akka.persistence.journal.sql.event-adapters.topic-tagger"), StringComparison.Ordinal);
        // Binding keys are assembly-qualified type names, which HOCON path syntax cannot address; read the node.
        string bindings = _config.GetConfig("akka.persistence.journal.sql.event-adapter-bindings").Root.ToString();
        Assert.Contains("\"Chess.Backend.Events.Pinged, Chess.Backend\" : [topic-tagger]", bindings, StringComparison.Ordinal);
    }

    [Fact]
    public void Query_side_is_tuned_for_low_latency()
    {
        Assert.Equal(TimeSpan.FromMilliseconds(200), _config.GetTimeSpan("akka.persistence.query.journal.sql.refresh-interval"));
        Assert.Equal(TimeSpan.FromMilliseconds(200), _config.GetTimeSpan("akka.persistence.query.journal.sql.journal-sequence-retrieval.query-delay"));
    }

    [Fact]
    public void Journal_lives_in_the_akka_schema() =>
        Assert.Equal(Chess.Backend.Akka.AkkaHostingExtensions.PersistenceSchema, _config.GetString("akka.persistence.journal.sql.default.schema-name"));
}
