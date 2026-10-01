using Chess.Backend.Extensions;
using Chess.Backend.Studies;
using Chess.Backend.WebApi.Games;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Studies;

/// <summary>My studies, newest first, keyset-paged, from the primary (my own data).</summary>
[ExcludeFromCodeCoverage]
internal sealed class MyStudiesEndpoint(IStudyService studies, ICurrentUser user, IOptions<ApiOptions> options)
    : Endpoint<MyStudiesRequest, CursorPage<StudyListItem>>
{
    public override void Configure()
    {
        Get("studies");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Studies")
            .Produces<CursorPage<StudyListItem>>()
            .ProducesProblemDetails()
            .Produces(StatusCodes.Status401Unauthorized));
    }

    public override async Task HandleAsync(MyStudiesRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        GameCursor.TryDecode(req.Cursor, out (DateTimeOffset At, Guid Id)? after); // shape checked by the validator
        int limit = GameReadEndpointBase<object>.PageSize(req.Limit, options.Value);
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        await Send.OkAsync(await studies.MineAsync(user.Id ?? 0, after, limit, ct), ct);
    }
}
