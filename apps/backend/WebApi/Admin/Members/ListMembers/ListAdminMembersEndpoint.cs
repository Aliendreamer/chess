namespace Chess.Backend.WebApi.Admin;

/// <summary>Every member, active or not, with whether they hold Admin (from Keycloak); engine players are not listed.</summary>
[ExcludeFromCodeCoverage]
internal sealed class ListAdminMembersEndpoint(IMemberAdminService admin) : MemberAdminEndpointBase<EmptyRequest, ListAdminMembersResponse>
{
    public override void Configure() => Standard("admin/members", Http.GET, bodyless: false);

    public override async Task HandleAsync(EmptyRequest req, CancellationToken ct) =>
        await AnswerAsync(await admin.ListAsync(ct), items => new ListAdminMembersResponse(items), ct);
}
