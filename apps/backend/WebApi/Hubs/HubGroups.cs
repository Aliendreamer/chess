using Chess.Backend.Akka.Ping;

namespace Chess.Backend.WebApi.Hubs;

/// <summary>Group-name mapping for <see cref="PingsHub"/>; delegates id validation to <see cref="PingIds"/>
/// so the shape of a ping id is defined once and shared with <c>PingEndpoints</c>.</summary>
internal static class HubGroups
{
    public static string Ping(string pingId) => "ping:" + PingIds.Validate(pingId);
}
