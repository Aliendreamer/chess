using Chess.Backend.Studies;
using FluentValidation;

namespace Chess.Backend.WebApi.Studies;

internal sealed class UpdateStudyRequest : IStudyRoute
{
    public string Id { get; init; } = string.Empty;

    public string Title { get; init; } = string.Empty;

    /// <summary>The whole tree, as UCI moves.</summary>
    public IReadOnlyList<StudyMoveInput> Tree { get; init; } = [];

    /// <summary>The version you opened; a different current version is a 409 (someone saved in between).</summary>
    public long Version { get; init; }
}

internal sealed class UpdateStudyRequestValidator : Validator<UpdateStudyRequest>
{
    public UpdateStudyRequestValidator()
    {
        RuleFor(r => r.Id).MustBeStudyId();
        RuleFor(r => r.Title).NotEmpty().MaximumLength(200);
    }
}
