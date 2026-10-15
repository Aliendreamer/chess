namespace Chess.Backend.WebApi.Admin;

internal sealed class SetMemberAdminSummary : Summary<SetMemberAdminEndpoint>
{
    public SetMemberAdminSummary()
    {
        Summary = "Grant or remove Admin (Admin)";
        Description = "Adds or removes the realm role Admin in Keycloak. An Admin cannot remove their own.";
        ExampleRequest = new SetMemberAdminRequest { Id = 2, Admin = true };
        Responses[200] = "The member as now.";
        Responses[400] = "A malformed id, or removing your own Admin.";
        Responses[401] = "Not signed in.";
        Responses[403] = "Not an Admin.";
        Responses[404] = "No such member.";
        Responses[502] = "Keycloak did not answer; nothing changed.";
    }
}
