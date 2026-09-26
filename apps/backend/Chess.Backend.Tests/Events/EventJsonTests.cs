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
