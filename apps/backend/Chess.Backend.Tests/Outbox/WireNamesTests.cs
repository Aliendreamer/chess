using System.Text.Json;
using Chess.Backend.Akka.Games;
using Chess.Backend.Akka.Matchmaking;
using Chess.Backend.Akka.Outbox;
using Chess.Backend.Akka.Ping;
using Chess.Backend.Analysis;
using Chess.Backend.Engine;
using Chess.Backend.Events;
using Chess.Backend.Games;
using Chess.Backend.Projections;
using Chess.Backend.WebApi.Matchmaking;

namespace Chess.Backend.Tests.Outbox;

/// <summary>
/// The names other systems hold on to, spelled out on purpose: event types are in replays and on the wire, topics are
/// on the broker and in the engine worker, and a consumer group is its committed offsets and its dead-letter key.
/// Changing a constant must fail here first, so the rename is a decision and not a typo.
/// </summary>
public sealed class WireNamesTests
{
    [Fact]
    public void Game_event_types_keep_their_names()
    {
        Assert.Equal(
            ["game.created", "game.move-made", "game.draw-offered", "game.draw-declined", "game.ended", "game.player-left", "game.player-returned", "game.abandonment-offered"],
            [GameEventTypes.Created, GameEventTypes.MoveMade, GameEventTypes.DrawOffered, GameEventTypes.DrawDeclined, GameEventTypes.Ended, GameEventTypes.PlayerLeft, GameEventTypes.PlayerReturned, GameEventTypes.AbandonmentOffered]);
        Assert.Equal("ping.pinged", EventTypes.Pinged);
        Assert.All(GameEventTypes.All, t => Assert.StartsWith(GameEventTypes.Prefix, t, StringComparison.Ordinal));
    }

    [Fact]
    public void Topics_keep_their_names()
    {
        Assert.Equal("game.events", GameTopics.Kafka);
        Assert.Equal(GameTopics.Kafka, PingTopics.Kafka);
        Assert.Equal(("engine.moves.requests", "engine.moves.results"), (EngineTopics.Requests, EngineTopics.Results));
        Assert.Equal(("analysis.requests", "analysis.results"), (AnalysisTopics.Requests, AnalysisTopics.Results));
    }

    [Fact]
    public void Consumer_groups_keep_their_names()
    {
        Assert.Equal(
            ["chess.rm-games", "chess.rm-pings", "chess.deadlines", "chess.notifications", "chess.engine-requests", "chess.engine-moves-apply", "chess.analysis-results"],
            [ConsumerGroups.RmGames, ConsumerGroups.RmPings, ConsumerGroups.Deadlines, ConsumerGroups.Notifications, ConsumerGroups.EngineRequests, ConsumerGroups.EngineMovesApply, ConsumerGroups.AnalysisResults]);
    }

    [Fact]
    public void Statuses_and_sides_are_lower_case_on_the_wire()
    {
        GameView game = new(Guid.Empty, 1, 2, "5+3", GameStatus.Playing, "fen", 1, Side.Black, null, null, 1, 2, DateTimeOffset.UnixEpoch, null, null, null, 2);
        InviteView invite = new(Guid.Empty, 1, "5+3", "white", InviteStatus.Expired, null, DateTimeOffset.UnixEpoch, DateTimeOffset.UnixEpoch, 1);
        JoinQueueResponse queue = new(QueueStatus.Waiting, "5+3", 1, 1, null, null, null, 4);

        Assert.Contains("\"status\":\"playing\"", JsonSerializer.Serialize(game, JsonSerializerOptions.Web), StringComparison.Ordinal);
        Assert.Contains("\"sideToMove\":\"black\"", JsonSerializer.Serialize(game, JsonSerializerOptions.Web), StringComparison.Ordinal);
        Assert.Contains("\"status\":\"expired\"", JsonSerializer.Serialize(invite, JsonSerializerOptions.Web), StringComparison.Ordinal);
        Assert.Contains("\"status\":\"waiting\"", JsonSerializer.Serialize(queue, JsonSerializerOptions.Web), StringComparison.Ordinal);
        Assert.Equal("expired", InviteStatus.Expired.WireName());
    }
}
