using Chess.Backend.Akka.Games;
using Chess.Backend.Live;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Chess.Backend.WebApi.Live;

/// <summary>
/// The one live hub (ROADMAP D5). Only the BFF connects, with its <c>chess_bff</c> service token (role
/// <see cref="Constants.Roles.Relay"/>); it authorizes browsers itself and multiplexes them over one connection.
/// <see cref="Subscribe"/> joins the topic's group first and only then reads the snapshot, so nothing published
/// after the join can be missed; the browser drops the duplicate by seq.
/// </summary>
[Authorize(Roles = Constants.Roles.Relay)]
[ExcludeFromCodeCoverage]
internal sealed class LiveHub(LiveTopicResolver topics, IRequiredActor<GameActor> games) : Hub
{
    private const int MaxInstanceLength = 64;

    public const string Path = "/hub/live";

    public async Task<LiveFrame?> Subscribe(string topic)
    {
        if (!topics.TryResolve(topic, out ILiveTopicSource? source, out string id))
        {
            throw new HubException("Unknown live topic.");
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, topic);
        return await source.SnapshotAsync(id, Context.ConnectionAborted);
    }

    public Task Unsubscribe(string topic) => Groups.RemoveFromGroupAsync(Context.ConnectionId, topic);

    /// <summary>
    /// The BFF's presence report for a signed-in user on a game topic (presence-and-abandonment D1–D2); re-sent every
    /// 30 s as a lease. Only <c>game</c> topics carry presence; anything else is ignored. The game decides who plays.
    /// </summary>
    public void Present(string topic, long userId, string instance) => Report(topic, userId, instance, present: true);

    public void Absent(string topic, long userId, string instance) => Report(topic, userId, instance, present: false);

    private void Report(string topic, long userId, string instance, bool present)
    {
        if (string.IsNullOrEmpty(instance) || instance.Length > MaxInstanceLength
            || !topics.TryResolve(topic, out ILiveTopicSource? source, out string id)
            || source.Kind != GameLiveSource.KindName
            || !Guid.TryParseExact(id, "N", out Guid gameId))
        {
            return;
        }

        games.ActorRef.Tell(new ReportPresence(gameId, userId, instance, present));
    }
}
