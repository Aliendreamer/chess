namespace Chess.Backend.WebApi.Admin;

internal sealed class DeactivateMemberSummary : Summary<DeactivateMemberEndpoint>
{
    public DeactivateMemberSummary()
    {
        Summary = "Deactivate a member (Admin)";
        Description = "Deactivates a member: disabled in Keycloak, every session revoked, their challenges withdrawn and queue places dropped; their games and studies stay. Not yourself.";
        ExampleRequest = new MemberRouteRequest { Id = 2 };
        Responses[200] = "The member as now.";
        Responses[400] = "A malformed id, or yourself.";
        Responses[401] = "Not signed in.";
        Responses[403] = "Not an Admin.";
        Responses[404] = "No such member.";
        Responses[502] = "Keycloak did not answer; nothing changed.";
    }
}
