namespace Chess.Backend.WebApi.Admin;

internal sealed class CreateMemberSummary : Summary<CreateMemberEndpoint>
{
    public CreateMemberSummary()
    {
        Summary = "Create a member (Admin)";
        Description = "Creates the member in Keycloak with a temporary password they must change at first sign-in, and lists them at once. The password is shown in this answer only.";
        ExampleRequest = new CreateMemberRequest { Username = "carol", FullName = "Carol Smith", Email = "carol@example.com" };
        Responses[200] = "The member and their temporary password.";
        Responses[400] = "A malformed username, full name or e-mail.";
        Responses[401] = "Not signed in.";
        Responses[403] = "Not an Admin.";
        Responses[409] = "That username is taken.";
        Responses[502] = "Keycloak did not answer; nothing was created.";
    }
}
