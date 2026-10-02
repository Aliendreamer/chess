using Chess.Backend.Akka;
using Chess.Backend.Akka.Matchmaking;
using Chess.Backend.Data.ReadModels;
using Chess.Backend.Extensions;
using Microsoft.Net.Http.Headers;
using Npgsql;
using ZiggyCreatures.Caching.Fusion;

namespace Chess.Backend.WebApi.Lobby;

/// <summary>
/// The lobby, one answer shared by every caller for <see cref="LobbyOptions.CacheSeconds"/>: a count and the Club TV
/// games from the replica, the queue sizes from the matchmaking singleton (live-home).
/// </summary>
[ExcludeFromCodeCoverage]
internal sealed class GetLobbyEndpoint(
    ReadDbContext read,
    IRequiredActor<MatchmakingActor> matchmaker,
    IFusionCache cache,
    IOptions<LobbyOptions> lobby,
    IOptions<ApiOptions> api) : EndpointWithoutRequest<LobbyResponse>
{
    public override void Configure()
    {
        Get("lobby");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Lobby")
            .Produces<LobbyResponse>()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status503ServiceUnavailable));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        LobbyOptions options = lobby.Value;
        try
        {
            LobbyResponse answer = await cache.GetOrSetAsync(
                Constants.Cache.Lobby,
                async (FusionCacheFactoryExecutionContext<LobbyResponse> _, CancellationToken token) => await BuildAsync(options, token),
                o => o.SetDuration(TimeSpan.FromSeconds(options.CacheSeconds)),
                ct);
            await Send.OkAsync(answer, ct);
        }
        catch (NpgsqlException)
        {
            ThrowError("Read replica unavailable.", StatusCodes.Status503ServiceUnavailable);
        }
    }

    private async Task<LobbyResponse> BuildAsync(LobbyOptions options, CancellationToken ct)
    {
        int inPlay = await LobbyReads.InPlay(read.RmGames).CountAsync(ct);
        List<RmGame> tv = await LobbyReads.Tv(read.RmGames, options.TvGames).ToListAsync(ct);
        QueueCounts? queues;
        try
        {
            queues = await matchmaker.ActorRef.Ask(ActorTracing.Wrap(GetQueues.Instance), api.Value.AskTimeout, ct) as QueueCounts;
        }
        catch (AskTimeoutException)
        {
            queues = null; // the lobby still answers; home just shows no queue sizes
        }

        return LobbyReads.Compose(inPlay, tv, queues);
    }
}
