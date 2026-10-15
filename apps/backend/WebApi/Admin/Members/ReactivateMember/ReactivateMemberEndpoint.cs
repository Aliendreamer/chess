namespace Chess.Backend.WebApi.Admin;

/// <summary>Reactivates a member: enabled in Keycloak again; they sign in with their password.</summary>
[ExcludeFromCodeCoverage]
internal sealed class ReactivateMemberEndpoint(IMemberAdminService admin, ICurrentUser user) : MemberAdminEndpointBase<MemberRouteRequest, AdminMemberItem>
{
    public override void Configure() => Standard("admin/members/{id}/reactivate", Http.POST, bodyless: true);

    public override async Task HandleAsync(MemberRouteRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        await AnswerAsync(await admin.SetActiveAsync(req.Id, active: true, user.Id ?? 0, ct), item => item, ct);
    }
}
