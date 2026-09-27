namespace Chess.Backend.WebApi.Auth;

internal sealed class CallbackSummary : Summary<CallbackEndpoint>
{
    public CallbackSummary()
    {
        Summary = "Login callback";
        Description = "Keycloak redirects here: the state must match the PKCE cookie; the code is exchanged, the server session created, the opaque mp_sid cookie set, and the browser sent back to the app.";
        ExampleRequest = new CallbackRequest { Code = "…", State = "…" };
        Responses[302] = "Signed in: redirect to the app (returnTo).";
        Responses[400] = "State, cookie or code is missing or does not match.";
    }
}
