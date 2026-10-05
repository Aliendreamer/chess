using Chess.Backend.Extensions;
using Chess.Backend.Trainer;
using Chess.Backend.WebApi.Games;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Trainer;

/// <summary>The member's own studies with their lines and learned ones for a side (study-repertoire-trainer D10).</summary>
[ExcludeFromCodeCoverage]
internal sealed class ListStudiesEndpoint(ITrainerService trainer, ICurrentUser user, IOptions<ApiOptions> options)
    : Endpoint<ListStudiesRequest, CursorPage<StudyTraining>>
{
    public override void Configure()
    {
        Get("trainer/studies");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Trainer").Produces<CursorPage<StudyTraining>>().ProducesProblemDetails()
            .Produces(StatusCodes.Status401Unauthorized));
    }

    public override async Task HandleAsync(ListStudiesRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        GameCursor.TryDecode(req.Cursor, out (DateTimeOffset At, Guid Id)? after); // shape checked by the validator
        int limit = GameReadEndpointBase<object>.PageSize(req.Limit, options.Value);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        await Send.OkAsync(await trainer.StudiesAsync(user.Id ?? 0, req.Color, after, limit, ct), ct);
    }
}
