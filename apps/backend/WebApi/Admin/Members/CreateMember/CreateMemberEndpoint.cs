namespace Chess.Backend.WebApi.Admin;

/// <summary>
/// Creates a member: a Keycloak user with a temporary password (changed at first sign-in), and the <c>users</c> row,
/// so they are listed at once. The password is in this answer only.
/// </summary>
[ExcludeFromCodeCoverage]
internal sealed class CreateMemberEndpoint(IMemberAdminService admin) : MemberAdminEndpointBase<CreateMemberRequest, CreateMemberResponse>
{
    public override void Configure() => Standard("admin/members", Http.POST, bodyless: false);

    public override async Task HandleAsync(CreateMemberRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        await AnswerAsync(
            await admin.CreateAsync(req.Username, req.FullName, req.Email, ct),
            created => new CreateMemberResponse(created.Member, created.TemporaryPassword),
            ct);
    }
}
