using Chess.Backend.Studies;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Studies;

/// <summary>A study as PGN with its variations (studies D3); same access as reading it.</summary>
[ExcludeFromCodeCoverage]
internal sealed class GetStudyPgnEndpoint(IStudyService studies, ICurrentUser user) : Endpoint<StudyRouteRequest>
{
    public override void Configure()
    {
        Get("studies/{id}/pgn");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Studies")
            .Produces<string>(StatusCodes.Status200OK, "application/x-chess-pgn")
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status404NotFound));
    }

    public override async Task HandleAsync(StudyRouteRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        _ = Chess.Backend.WebApi.Games.GameReplyMapper.TryParseId(req.Id, out Guid id);
        if ((await studies.PgnAsync(id, user.Id ?? 0, ct)).Value is { } pgn)
        {
            await Send.StringAsync(pgn, contentType: "application/x-chess-pgn", cancellation: ct);
            return;
        }

        await Send.NotFoundAsync(ct);
    }
}
