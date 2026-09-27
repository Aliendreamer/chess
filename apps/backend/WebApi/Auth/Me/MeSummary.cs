namespace Chess.Backend.WebApi.Auth;

internal sealed class MeSummary : Summary<MeEndpoint>
{
    public MeSummary()
    {
        Summary = "Who am I";
        Description = "The signed-in user behind the session cookie: id, subject, e-mail, roles and display name. Never cached.";
        Responses[200] = "The signed-in user.";
        Responses[401] = "No valid session.";
    }
}
