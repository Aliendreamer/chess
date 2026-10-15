namespace Chess.Backend.WebApi.Admin;

internal sealed class ListAdminMembersSummary : Summary<ListAdminMembersEndpoint>
{
    public ListAdminMembersSummary()
    {
        Summary = "List every member (Admin)";
        Description = "Every member, active or deactivated, with their full name, e-mail, whether they hold Admin, when they joined and when they were last seen.";
        Responses[200] = "The members, by username.";
        Responses[401] = "Not signed in.";
        Responses[403] = "Not an Admin.";
        Responses[502] = "Keycloak did not answer.";
    }
}
