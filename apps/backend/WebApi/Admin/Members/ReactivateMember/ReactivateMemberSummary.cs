namespace Chess.Backend.WebApi.Admin;

internal sealed class ReactivateMemberSummary : Summary<ReactivateMemberEndpoint>
{
    public ReactivateMemberSummary()
    {
        Summary = "Reactivate a member (Admin)";
        Description = "Reactivates a member: enabled in Keycloak again; they sign in with their password.";
        ExampleRequest = new MemberRouteRequest { Id = 2 };
        Responses[200] = "The member as now.";
        Responses[400] = "A malformed id, or yourself.";
        Responses[401] = "Not signed in.";
        Responses[403] = "Not an Admin.";
        Responses[404] = "No such member.";
        Responses[502] = "Keycloak did not answer; nothing changed.";
    }
}
