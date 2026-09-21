namespace Chess.Backend.Data.Auth;

internal interface IKeycloakOidcClient
{
    Task<string> BuildAuthorizeUrlAsync(string state, string codeChallenge, string nonce, CancellationToken ct);

    Task<TokenResponse> ExchangeCodeAsync(string code, string codeVerifier, CancellationToken ct);

    Task<TokenResponse> RefreshAsync(string refreshToken, CancellationToken ct);

    /// <summary>Best-effort back-channel revocation of the refresh token at the IdP.</summary>
    Task RevokeRefreshTokenAsync(string refreshToken, CancellationToken ct);

    Task<string> BuildEndSessionUrlAsync(string? idTokenHint, CancellationToken ct);
}
