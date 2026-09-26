using Chess.Backend.Events;

namespace Chess.Backend.Tests.Events;

public sealed class EventJsonTests
{
    [Fact]
    public void Round_trips_an_envelope()
    {
        DateTimeOffset at = Time.Utc("2026-09-22T10:00:00Z");
        EventEnvelope<Pinged> e = new(EventTypes.Pinged, 1, "p1", 7, at, new Pinged("hello", 42, at));
        string json = EventJson.Serialize(e);
        Assert.Contains("\"type\":\"ping.pinged\"", json, StringComparison.Ordinal);
        Assert.True(EventJson.TryDeserialize(json, out EventEnvelope<Pinged>? back));
        Assert.Equal(e, back);
    }

    [Fact]
    public void Reads_the_pinned_wire_format()
    {
        const string Wire = """{"type":"ping.pinged","v":1,"aggregateId":"p1","seq":7,"at":"2026-09-22T10:00:00+00:00","payload":{"text":"hello","userId":42,"at":"2026-09-22T10:00:00+00:00"}}""";
        DateTimeOffset at = Time.Utc("2026-09-22T10:00:00Z");

        Assert.True(EventJson.TryDeserialize(Wire, out EventEnvelope<Pinged>? e));
        Assert.Equal(new EventEnvelope<Pinged>("ping.pinged", 1, "p1", 7, at, new Pinged("hello", 42, at)), e);
    }

    [Fact]
    public void Writes_the_pinned_wire_format()
    {
        DateTimeOffset at = Time.Utc("2026-09-22T10:00:00Z");
        Assert.Equal(
            """{"type":"ping.pinged","v":1,"aggregateId":"p1","seq":7,"at":"2026-09-22T10:00:00+00:00","payload":{"text":"hello","userId":42,"at":"2026-09-22T10:00:00+00:00"}}""",
            EventJson.Serialize(new EventEnvelope<Pinged>(EventTypes.Pinged, 1, "p1", 7, at, new Pinged("hello", 42, at))));
    }

    [Theory]
    [InlineData("")]
    [InlineData("not json")]
    [InlineData("{}")]
    [InlineData("""{"type":"x","v":1,"aggregateId":"","seq":1,"at":"2026-01-01T00:00:00Z","payload":{}}""")]
    public void Rejects_garbage(string json)
    {
        Assert.False(EventJson.TryDeserialize(json, out EventEnvelope<Pinged>? back));
        Assert.Null(back);
    }
}
