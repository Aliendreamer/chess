using System.Collections.Concurrent;
using System.Diagnostics.Metrics;
using System.Text.RegularExpressions;
using Akka.Actor;
using Akka.TestKit.Xunit2;
using Chess.Backend.Akka;
using Chess.Backend.Akka.Games;
using Chess.Backend.Games;
using Chess.Backend.Projections;

namespace Chess.Backend.Tests.Akka;

/// <summary>
/// The actor metrics (observability D8): every handled message is counted and timed by actor, message and outcome,
/// each persist is timed by event, dead and unhandled messages are counted, and no label ever carries an id.
/// </summary>
public sealed partial class ActorMetricsTests : TestKit
{
    private readonly ConcurrentQueue<(string Instrument, IReadOnlyDictionary<string, object?> Tags)> _measured = new();
    private readonly MeterListener _listener = new();
    private readonly FakeClock _clock = new(Time.Utc("2026-09-28T10:00:00Z"));

    public ActorMetricsTests()
        : base(AkkaConfig.InMemoryPersistence)
    {
        _listener.InstrumentPublished = (instrument, listener) =>
        {
            if (instrument.Meter.Name.StartsWith("chess.", StringComparison.Ordinal))
            {
                listener.EnableMeasurementEvents(instrument);
            }
        };
        _listener.SetMeasurementEventCallback<long>((i, _, tags, _) => Record(i, tags));
        _listener.SetMeasurementEventCallback<int>((i, _, tags, _) => Record(i, tags));
        _listener.SetMeasurementEventCallback<double>((i, _, tags, _) => Record(i, tags));
        _listener.Start();
    }

    protected override void Dispose(bool disposing)
    {
        _listener.Dispose();
        base.Dispose(disposing);
    }

    private void Record(Instrument instrument, ReadOnlySpan<KeyValuePair<string, object?>> tags) =>
        _measured.Enqueue((instrument.Name, tags.ToArray().ToDictionary(t => t.Key, t => t.Value, StringComparer.Ordinal)));

    private bool Saw(string instrument, params (string Key, string Value)[] tags) =>
        _measured.Any(m => m.Instrument == instrument && tags.All(t => Equals(m.Tags.GetValueOrDefault(t.Key), t.Value)));

    [GeneratedRegex(@"(^|[._])id$", RegexOptions.IgnoreCase)]
    private static partial Regex IdLike();

    [Fact]
    public void A_handled_move_is_counted_and_timed_and_its_persist_is_timed_by_event()
    {
        Guid id = Guid.CreateVersion7();
        IActorRef game = Sys.ActorOf(Props.Create(() => new GameActor(id, null, _clock)));
        game.Tell(new CreateGame(id, 11, 22, TimeControl.Presets.Single(tc => tc.ToString() == "5+3")), TestActor);
        ExpectMsg<GameView>();
        game.Tell(new MakeMove(id, 11, "e2e4"), TestActor);
        ExpectMsg<GameView>();

        AwaitCondition(() => Saw("chess.actor.persist.duration", ("actor", "game"), ("event", "MoveMade")));
        Assert.True(Saw("chess.actor.messages", ("actor", "game"), ("message", "MakeMove"), ("outcome", "handled")));
        Assert.True(Saw("chess.actor.handle.duration", ("actor", "game"), ("message", "MakeMove")));
        Assert.True(Saw("chess.actor.recovery.duration", ("actor", "game")));
    }

    [Fact]
    public void Dead_and_unhandled_messages_are_counted_by_type()
    {
        Dictionary<string, IActorRef> noRegions = [];
        string[] noSingletons = [];
        Sys.ActorOf(Props.Create(() => new ClusterMetricsActor(noRegions, noSingletons, "backend", TimeSpan.FromSeconds(10))));
        IActorRef gone = Sys.ActorOf(Props.Empty);
        Watch(gone);
        Sys.Stop(gone);
        ExpectTerminated(gone);
        IActorRef game = Sys.ActorOf(Props.Create(() => new GameActor(Guid.CreateVersion7(), null, _clock)));

        AwaitAssert(() =>
        {
            gone.Tell(new GetGameView(Guid.Empty));
            game.Tell(DateTimeOffset.MinValue);
            Assert.True(Saw("chess.akka.dead_letters", ("message", "GetGameView"), ("kind", "dead")));
            Assert.True(Saw("chess.akka.dead_letters", ("message", "DateTimeOffset"), ("kind", "unhandled")));
        });
    }

    [Fact]
    public void No_label_on_any_chess_instrument_is_an_id()
    {
        A_handled_move_is_counted_and_timed_and_its_persist_is_timed_by_event();
        PipelineMetrics.Projected("chess.rm-games", ProjectionOutcome.Applied, TimeSpan.FromMilliseconds(3));
        PipelineMetrics.Produced("game.events", 2);
        PipelineMetrics.Lag("game.events", 0);
        PipelineMetrics.Quarantined(new Dictionary<string, int> { ["chess.rm-games"] = 1 });
        ClusterMetrics.Publish(new ClusterSnapshot(new Dictionary<string, int> { ["Up"] = 1 }, 0, ["matchmaking"], [("games", "7", 2)]));
        _listener.RecordObservableInstruments();

        string[] keys = [.. _measured.SelectMany(m => m.Tags.Keys).Distinct()];

        Assert.Contains("actor", keys);
        Assert.Contains("shard", keys);
        Assert.Contains("group", keys);
        Assert.DoesNotContain(keys, k => IdLike().IsMatch(k));
    }
}
