using Chess.Backend.Studies;

namespace Chess.Backend.WebApi.Studies;

/// <summary>Saves a study's title and tree; owner only, and only over the version you opened.</summary>
[ExcludeFromCodeCoverage]
internal sealed class UpdateStudyEndpoint(IStudyService studies) : StudyEndpointBase<UpdateStudyRequest, StudyView>
{
    public override void Configure() => Standard(() => Put("studies/{id}"));

    public override async Task HandleAsync(UpdateStudyRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        await SendAsync(await studies.UpdateAsync(StudyId(req.Id), UserId, req.Title, req.Tree, req.Version, ct), ct);
    }
}
