using System.Text;
using Akka.Actor;
using Chess.Backend.Events;

namespace Chess.Backend.Tests.Outbox;

/// <summary>
/// Every event carries the trace it was made in (observability D4) as an optional last member. These rows are real
/// journal payloads written before that member existed: they must still read, through the journal's own serializer,
/// with no trace. The trace is journal metadata only: the Kafka envelope (System.Text.Json) never shows it.
/// </summary>
public sealed class JournalCompatibilityTests : IDisposable
{
    private const string Trace = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
    private static readonly DateTimeOffset At = Time.Utc("2026-09-28T07:50:21.0887511Z");

    private readonly ActorSystem _system = ActorSystem.Create("journal-compat");

    public void Dispose() => _system.Dispose();

    private object Read(string row) => _system.Serialization.Deserialize(Encoding.UTF8.GetBytes(row), 1, string.Empty);

    private T RoundTrip<T>(T evt)
        where T : notnull
    {
        global::Akka.Serialization.Serializer serializer = _system.Serialization.FindSerializerFor(evt);
        Assert.Equal(1, serializer.Identifier); // the journal's serializer: Newtonsoft JSON with $type
        return (T)_system.Serialization.Deserialize(serializer.ToBinary(evt), serializer.Identifier, string.Empty);
    }

    [Fact]
    public void Rows_written_before_the_trace_member_still_read_with_no_trace()
    {
        const string Created = """{"$id":"1","$type":"Chess.Backend.Events.GameCreated, Chess.Backend","WhiteId":4,"BlackId":5,"TimeControl":"3+2","InitialMs":180000,"IncrementMs":2000,"At":"2026-09-28T07:50:20.5623429+00:00"}""";
        const string Move = """{"$id":"1","$type":"Chess.Backend.Events.MoveMade, Chess.Backend","Ply":{"$":"I2"},"Uci":"e7e5","San":"e5","FenAfter":"rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2","WhiteMs":180000,"BlackMs":180000,"At":"2026-09-28T07:50:21.0887511+00:00"}""";
        const string Ended = """{"$id":"1","$type":"Chess.Backend.Events.GameEnded, Chess.Backend","Result":"1-0","Reason":"Abandonment","WhiteMs":538785,"BlackMs":600000,"At":"2026-09-28T07:50:27.6690654+00:00"}""";
        const string Left = """{"$id":"1","$type":"Chess.Backend.Events.PlayerLeft, Chess.Backend","UserId":5,"At":"2026-09-28T07:49:26.699829+00:00"}""";
        const string Pinged = """{"$id":"1","$type":"Chess.Backend.Events.Pinged, Chess.Backend","Text":"hello","UserId":6,"At":"2026-09-28T12:33:42.8342689+00:00"}""";
        const string Invite = """{"$id":"1","$type":"Chess.Backend.Events.InviteCreated, Chess.Backend","CreatorId":4,"TimeControl":"3+2","Color":"white","At":"2026-09-28T07:50:18.3996597+00:00"}""";

        Assert.Equal(new GameCreated(4, 5, "3+2", 180_000, 2_000, Time.Utc("2026-09-28T07:50:20.5623429Z")), Read(Created));
        Assert.Equal(
            new MoveMade(2, "e7e5", "e5", "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2", 180_000, 180_000, At),
            Read(Move));
        Assert.Equal(new GameEnded("1-0", "Abandonment", 538_785, 600_000, Time.Utc("2026-09-28T07:50:27.6690654Z")), Read(Ended));
        Assert.Equal(new PlayerLeft(5, Time.Utc("2026-09-28T07:49:26.699829Z")), Read(Left));
        Assert.Equal(new Pinged("hello", 6, Time.Utc("2026-09-28T12:33:42.8342689Z")), Read(Pinged));
        Assert.Equal(new InviteCreated(4, "3+2", "white", Time.Utc("2026-09-28T07:50:18.3996597Z")), Read(Invite));
        Assert.Null(((MoveMade)Read(Move)).Trace);
    }

    [Fact]
    public void The_journal_keeps_an_events_trace()
    {
        MoveMade move = new(1, "e2e4", "e4", "fen", 1_000, 1_000, At, Trace);
        GameCreated created = new(4, 5, "untimed", 0, 0, At, new EnginePlayer("black", "1600"), Trace);

        Assert.Equal(Trace, RoundTrip(move).Trace);
        Assert.Equal(created, RoundTrip(created));
    }

    [Fact]
    public void The_kafka_payload_never_shows_the_trace()
    {
        EventEnvelope<MoveMade> envelope = new("game.move", 1, "g1", 1, At, new MoveMade(1, "e2e4", "e4", "fen", 1_000, 1_000, At, Trace));

        Assert.DoesNotContain("trace", EventJson.Serialize(envelope), StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(Trace, EventJson.Serialize(envelope), StringComparison.Ordinal);
    }
}
