namespace Chess.Backend.WebApi.Admin;

/// <summary>Grants or removes the realm role Admin in Keycloak; nobody removes their own. Takes effect at the member's next token.</summary>
[ExcludeFromCodeCoverage]
internal sealed class SetMemberAdminEndpoint(IMemberAdminService admin, ICurrentUser user) : MemberAdminEndpointBase<SetMemberAdminRequest, AdminMemberItem>
{
    public override void Configure() => Standard("admin/members/{id}/admin", Http.PUT, bodyless: false);

    public override async Task HandleAsync(SetMemberAdminRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        await AnswerAsync(await admin.SetAdminAsync(req.Id, req.Admin, user.Id ?? 0, ct), item => item, ct);
    }
}
