namespace Chess.Backend.WebApi.Auth;

internal sealed class LoginSummary : Summary<LoginEndpoint>
{
    public LoginSummary()
    {
        Summary = "Log in";
        Description = "Starts the PKCE authorization-code flow: sets a short-lived PKCE cookie and redirects to Keycloak.";
        ExampleRequest = new LoginRequest { ReturnTo = "/games" };
        Responses[302] = "Redirect to the Keycloak login page.";
    }
}
