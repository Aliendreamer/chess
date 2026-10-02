using Chess.Backend.Data.ReadModels;
using Chess.Backend.Games;
using Microsoft.Net.Http.Headers;
using Npgsql;

namespace Chess.Backend.WebApi.Players;

/// <summary>A player's public profile and record, from the replica (player-profiles).</summary>
[ExcludeFromCodeCoverage]
internal sealed class GetPlayerEndpoint(ReadDbContext read) : Endpoint<PlayerRouteRequest, PlayerProfile>
{
    public override void Configure()
    {
        Get("players/{id}");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Players")
            .Produces<PlayerProfile>()
            .ProducesProblemDetails()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status503ServiceUnavailable));
    }

    public override async Task HandleAsync(PlayerRouteRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        try
        {
            PlayerIdentity? player = await read.Players.SingleOrDefaultAsync(p => p.Id == req.Id, ct);
            if (player is null)
            {
                await Send.NotFoundAsync(ct);
                return;
            }

            List<ResultRow> rows = await read.RmGamePlayers
                .Where(p => p.UserId == req.Id)
                .Join(read.RmGames.Where(g => g.Status == RmGame.Ended), p => p.GameId, g => g.GameId, (p, g) => new ResultRow(p.Color, g.Result, g.TimeControl))
                .ToListAsync(ct);
            PlayerRecordTotals record = PlayerRecord.Count(rows);
            await Send.OkAsync(
                new PlayerProfile(
                    player.Id,
                    player.Username ?? $"Player {player.Id}",
                    player.CreatedAt,
                    EngineLevel.All.Any(l => l.UserId == player.Id),
                    record.Wins,
                    record.Draws,
                    record.Losses,
                    record.ByTimeControl),
                ct);
        }
        catch (NpgsqlException)
        {
            ThrowError("Read replica unavailable.", StatusCodes.Status503ServiceUnavailable);
        }
    }
}
