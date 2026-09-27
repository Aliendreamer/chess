namespace Chess.Backend.WebApi.Auth;

internal sealed class LogoutSummary : Summary<LogoutEndpoint>
{
    public LogoutSummary()
    {
        Summary = "Log out";
        Description = "Revokes the server session first (the old cookie is dead even if Keycloak is unreachable), clears the cookie, then ends the Keycloak session.";
        Responses[302] = "Redirect to Keycloak's end-session page.";
    }
}
