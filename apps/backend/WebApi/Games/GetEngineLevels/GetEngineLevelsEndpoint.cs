using Chess.Backend.Games;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Games;

/// <summary>The fixed list of engine levels (engine-play D2); it changes only with a deploy, so a day's caching is fine.</summary>
[ExcludeFromCodeCoverage]
internal sealed class GetEngineLevelsEndpoint : EndpointWithoutRequest<GetEngineLevelsResponse>
{
    public override void Configure()
    {
        Get("engine-levels");
        Policies(Constants.Policies.SignedIn);
        Description(d => d.WithTags("Games")
            .Produces<GetEngineLevelsResponse>()
            .Produces(StatusCodes.Status401Unauthorized));
    }

    public override Task HandleAsync(CancellationToken ct)
    {
        HttpContext.Response.Headers[HeaderNames.CacheControl] = "private, max-age=86400";
        return Send.OkAsync(new GetEngineLevelsResponse([.. EngineLevel.All.Select(l => new EngineLevelItem(l.Level, l.Name))]), ct);
    }
}
