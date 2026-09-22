using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Chess.Backend.WebApi.Hubs;

/// <summary>Authenticated by the same cookie resolver as HTTP (JwtBearer OnMessageReceived sees the cookie).</summary>
[Authorize]
[ExcludeFromCodeCoverage]
internal sealed class PingsHub : Hub
{
    public const string Path = "/hub/pings";
    public const string StateMethod = "state";

    public Task Subscribe(string pingId) => Groups.AddToGroupAsync(Context.ConnectionId, HubGroups.Ping(pingId));

    public Task Unsubscribe(string pingId) => Groups.RemoveFromGroupAsync(Context.ConnectionId, HubGroups.Ping(pingId));
}
