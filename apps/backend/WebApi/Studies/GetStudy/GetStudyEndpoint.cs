using Chess.Backend.Studies;

namespace Chess.Backend.WebApi.Studies;

/// <summary>A study, for its owner or anyone signed in when shared; otherwise 404 (studies D4).</summary>
[ExcludeFromCodeCoverage]
internal sealed class GetStudyEndpoint(IStudyService studies) : StudyEndpointBase<StudyRouteRequest, StudyView>
{
    public override void Configure() => Standard(() => Get("studies/{id}"));

    public override async Task HandleAsync(StudyRouteRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        await SendAsync(await studies.GetAsync(StudyId(req.Id), UserId, ct), ct);
    }
}
