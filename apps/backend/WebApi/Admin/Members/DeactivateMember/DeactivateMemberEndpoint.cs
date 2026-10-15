namespace Chess.Backend.WebApi.Admin;

/// <summary>Deactivates a member: disabled in Keycloak, every session revoked, their challenges withdrawn and queue places dropped; their games and studies stay. Not yourself.</summary>
[ExcludeFromCodeCoverage]
internal sealed class DeactivateMemberEndpoint(IMemberAdminService admin, ICurrentUser user) : MemberAdminEndpointBase<MemberRouteRequest, AdminMemberItem>
{
    public override void Configure() => Standard("admin/members/{id}/deactivate", Http.POST, bodyless: true);

    public override async Task HandleAsync(MemberRouteRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        await AnswerAsync(await admin.SetActiveAsync(req.Id, active: false, user.Id ?? 0, ct), item => item, ct);
    }
}
