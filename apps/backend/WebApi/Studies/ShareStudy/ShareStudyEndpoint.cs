using Chess.Backend.Studies;

namespace Chess.Backend.WebApi.Studies;

/// <summary>Shares or unshares a study you own (studies D4).</summary>
[ExcludeFromCodeCoverage]
internal sealed class ShareStudyEndpoint(IStudyService studies) : StudyEndpointBase<ShareStudyRequest, StudyView>
{
    public override void Configure() => Standard(() => Post("studies/{id}/share"));

    public override async Task HandleAsync(ShareStudyRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        await SendAsync(await studies.ShareAsync(StudyId(req.Id), UserId, req.Shared, ct), ct);
    }
}
