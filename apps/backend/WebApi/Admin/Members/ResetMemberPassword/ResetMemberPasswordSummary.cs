namespace Chess.Backend.WebApi.Admin;

internal sealed class ResetMemberPasswordSummary : Summary<ResetMemberPasswordEndpoint>
{
    public ResetMemberPasswordSummary()
    {
        Summary = "Reset a member's password (Admin)";
        Description = "Sets a new temporary password in Keycloak, which the member must change at their next sign-in. Shown in this answer only.";
        ExampleRequest = new MemberRouteRequest { Id = 2 };
        Responses[200] = "The temporary password.";
        Responses[400] = "A malformed id.";
        Responses[401] = "Not signed in.";
        Responses[403] = "Not an Admin.";
        Responses[404] = "No such member.";
        Responses[502] = "Keycloak did not answer; the password is unchanged.";
    }
}
