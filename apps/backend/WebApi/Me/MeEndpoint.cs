using Chess.Backend.WebApi.Authentication;
using Microsoft.Net.Http.Headers;

namespace Chess.Backend.WebApi.Me;

/// <summary><c>GET api/me</c>: who the cookie session belongs to. 401 when anonymous (FastEndpoints default).</summary>
[ExcludeFromCodeCoverage]
internal sealed class MeEndpoint(ICurrentUser user) : EndpointWithoutRequest<MeResponse>
{
    public override void Configure()
    {
        Get(Constants.Routes.Me);
        Description(d => d.WithTags("Identity").Produces<MeResponse>().Produces(StatusCodes.Status401Unauthorized));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        HttpContext.Response.Headers[HeaderNames.CacheControl] = "no-store";
        if (!MeResponseFactory.TryCreate(user, out MeResponse? response))
        {
            await Send.UnauthorizedAsync(ct);
            return;
        }

        await Send.OkAsync(response, ct);
    }
}
