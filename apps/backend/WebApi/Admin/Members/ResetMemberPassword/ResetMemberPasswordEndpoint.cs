namespace Chess.Backend.WebApi.Admin;

/// <summary>Gives a member a new temporary password in Keycloak; it is in this answer only.</summary>
[ExcludeFromCodeCoverage]
internal sealed class ResetMemberPasswordEndpoint(IMemberAdminService admin) : MemberAdminEndpointBase<MemberRouteRequest, ResetMemberPasswordResponse>
{
    public override void Configure() => Standard("admin/members/{id}/reset-password", Http.POST, bodyless: true);

    public override async Task HandleAsync(MemberRouteRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        await AnswerAsync(await admin.ResetPasswordAsync(req.Id, ct), password => new ResetMemberPasswordResponse(password), ct);
    }
}
