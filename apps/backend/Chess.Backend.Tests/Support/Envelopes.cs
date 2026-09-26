using Chess.Backend.Events;

namespace Chess.Backend.Tests.Support;

internal static class Envelopes
{
    /// <summary>A serialized <c>ping.pinged</c> envelope for <paramref name="id"/> at <paramref name="seq"/>; the
    /// event time defaults to the Unix epoch.</summary>
    public static string Pinged(string id, long seq, string text = "x", DateTimeOffset? at = null)
    {
        DateTimeOffset when = at ?? DateTimeOffset.UnixEpoch;
        return EventJson.Serialize(new EventEnvelope<Pinged>(EventTypes.Pinged, 1, id, seq, when, new Pinged(text, 1, when)));
    }
}
