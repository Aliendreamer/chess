using Chess.Backend.Studies;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Games;

/// <summary>A finished game as a new study owned by the caller (studies D5); games are public to watch, so anyone signed in may.</summary>
[ExcludeFromCodeCoverage]
internal sealed class StudyFromGameEndpoint(IStudyService studies, ICurrentUser user) : Endpoint<GameRouteRequest, StudyView>
{
    public override void Configure()
    {
        Post("games/{id}/study");
        Policies(Constants.Policies.SignedIn);
        Description(d =>
        {
            d.ClearDefaultAccepts();
            d.WithTags("Studies")
                .Produces<StudyView>(StatusCodes.Status201Created)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status401Unauthorized)
                .Produces(StatusCodes.Status404NotFound);
        });
    }

    public override async Task HandleAsync(GameRouteRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        _ = GameReplyMapper.TryParseId(req.Id, out Guid id);
        StudyOutcome<StudyView> outcome = await studies.FromGameAsync(id, user.Id ?? 0, ct);
        if (outcome.Value is { } study)
        {
            await Send.ResponseAsync(study, StatusCodes.Status201Created, ct);
            return;
        }

        ThrowError(outcome.Error ?? "The game could not become a study.", outcome.Status);
    }
}
