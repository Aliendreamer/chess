using Chess.Backend.Library;
using Microsoft.Net.Http.Headers;
using Npgsql;

namespace Chess.Backend.WebApi.Library;

/// <summary>The library games that reached a position (game-library): "In the library" on the analysis board.</summary>
[ExcludeFromCodeCoverage]
internal sealed class LibraryPositionEndpoint(ReadDbContext read) : Endpoint<LibraryPositionRequest, LibraryPositionView>
{
    private const int Shown = 50;

    public override void Configure()
    {
        Get("library/positions");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Library")
            .Produces<LibraryPositionView>()
            .ProducesProblemDetails()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status503ServiceUnavailable));
    }

    public override async Task HandleAsync(LibraryPositionRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = LibraryHttp.CacheControl;
        try
        {
            // A game may pass through a position twice (a repetition): it counts once, at its first visit.
            var rows = await read.LibraryPositions
                .Where(p => p.PositionKey == req.Key)
                .GroupBy(p => p.GameId)
                .Select(g => new { GameId = g.Key, Ply = g.Min(p => p.Ply) })
                .Join(read.LibraryGames, p => p.GameId, g => g.Id, (p, g) => new { p.Ply, Game = g })
                .ToListAsync(ct);
            PositionCounts counts = LibraryReads.Count([.. rows.Select(r => r.Game.Result)]);
            List<PositionGame> items = [.. rows
                .OrderByDescending(r => r.Game.Year ?? -1)
                .ThenBy(r => r.Game.White, StringComparer.Ordinal)
                .Take(Shown)
                .Select(r => new PositionGame(r.Game.Id, r.Game.White, r.Game.Black, r.Game.Year, r.Game.Event, r.Game.Result, r.Ply))];
            await Send.OkAsync(new LibraryPositionView(counts.Games, counts.WhiteWins, counts.Draws, counts.BlackWins, items), ct);
        }
        catch (NpgsqlException)
        {
            ThrowError("Read replica unavailable.", StatusCodes.Status503ServiceUnavailable);
        }
    }
}
