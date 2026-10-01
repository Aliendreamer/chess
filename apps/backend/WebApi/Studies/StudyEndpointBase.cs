using Chess.Backend.Studies;
using Chess.Backend.WebApi.Games;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Studies;

/// <summary>A request that names a study in its route (<c>studies/{id}</c>).</summary>
internal interface IStudyRoute
{
    string Id { get; }
}

/// <summary>
/// Shared plumbing of the study endpoints (studies D6): the route id, the answer of a <see cref="StudyOutcome{T}"/>,
/// and <c>no-store</c> on everything, since a study is private and changes. Signed in only.
/// </summary>
[ExcludeFromCodeCoverage]
internal abstract class StudyEndpointBase<TRequest, TResponse> : Endpoint<TRequest, TResponse>
    where TRequest : notnull
{
    protected static Guid StudyId(string id) => GameReplyMapper.TryParseId(id, out Guid parsed) ? parsed : Guid.Empty;

    protected long UserId => Resolve<ICurrentUser>().Id ?? 0;

    protected async Task SendAsync(StudyOutcome<TResponse> outcome, CancellationToken ct, int success = StatusCodes.Status200OK)
    {
        HttpContext.Response.Headers[HeaderNames.CacheControl] = Constants.CacheControl.NoStore;
        if (outcome.Value is { } value)
        {
            await Send.ResponseAsync(value, success, ct);
            return;
        }

        ThrowError(outcome.Error ?? "The study request failed.", outcome.Status);
    }

    protected void Standard(Action route, int success = StatusCodes.Status200OK, bool bodyless = false)
    {
        ArgumentNullException.ThrowIfNull(route);
        route();
        Policies(Constants.Policies.SignedIn);
        Description(d =>
        {
            if (bodyless)
            {
                d.ClearDefaultAccepts();
            }

            d.WithTags("Studies")
                .Produces<TResponse>(success)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status401Unauthorized)
                .Produces(StatusCodes.Status404NotFound)
                .Produces(StatusCodes.Status409Conflict);
        });
    }
}
