namespace Chess.Backend.WebApi.Auth.Groups;

/// <summary><c>api/auth/*</c>: every endpoint here is part of getting a session, so all are anonymous.</summary>
internal sealed class AuthGroup : Group
{
    public AuthGroup()
    {
        Configure(Constants.Routes.AuthGroup, ep =>
        {
            ep.AllowAnonymous();
            ep.Description(d => d.WithTags("Auth"));
        });
    }
}
