namespace Chess.Backend.WebApi.Auth;

/// <summary>What Keycloak sends back; checked against the PKCE cookie by <c>CallbackValidator</c>.</summary>
internal sealed class CallbackRequest
{
    [QueryParam]
    public string? Code { get; init; }

    [QueryParam]
    public string? State { get; init; }

    [QueryParam]
    public string? Error { get; init; }
}
