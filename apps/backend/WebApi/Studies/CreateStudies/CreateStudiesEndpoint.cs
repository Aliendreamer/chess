using Chess.Backend.Studies;

namespace Chess.Backend.WebApi.Studies;

/// <summary>Creates studies, one or an import of up to 20; each tree is checked move by move (studies D2).</summary>
[ExcludeFromCodeCoverage]
internal sealed class CreateStudiesEndpoint(IStudyService studies) : StudyEndpointBase<CreateStudiesRequest, ImportResult>
{
    public override void Configure() => Standard(() => Post("studies"), StatusCodes.Status201Created);

    public override async Task HandleAsync(CreateStudiesRequest req, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(req);
        await SendAsync(await studies.CreateAsync(UserId, req.Studies, ct), ct, StatusCodes.Status201Created);
    }
}
