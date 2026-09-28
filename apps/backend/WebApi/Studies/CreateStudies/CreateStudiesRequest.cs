using Chess.Backend.Studies;
using FluentValidation;

namespace Chess.Backend.WebApi.Studies;

internal sealed class CreateStudiesRequest
{
    /// <summary>One study, or up to 20 from a PGN import; each tree is UCI moves (a node's first child continues its line).</summary>
    public IReadOnlyList<StudyInput> Studies { get; init; } = [];
}

internal sealed class CreateStudiesRequestValidator : Validator<CreateStudiesRequest>
{
    public CreateStudiesRequestValidator() =>
        RuleFor(r => r.Studies).Must(s => s.Count is > 0 and <= StudyService.MaxImport).WithMessage($"Send 1 to {StudyService.MaxImport} studies at a time.");
}
