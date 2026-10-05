using Chess.Backend.WebApi.Games;
using Chess.Backend.WebApi.Studies;
using FluentValidation;

namespace Chess.Backend.WebApi.Trainer;

internal sealed class RecordStudyResultRequest
{
    /// <summary>The study id (route): a lower-case Guid, with or without dashes.</summary>
    public string Id { get; init; } = string.Empty;

    /// <summary>The line's key (<c>study:…</c>) as the study's lines list gave it.</summary>
    public string LineKey { get; init; } = string.Empty;

    public string Color { get; init; } = "white";

    /// <summary>Wrong moves in the run; any at all makes it a missed run. "Your other line" is not one.</summary>
    public int Mistakes { get; init; }

    public Guid StudyId => GameReplyMapper.TryParseId(Id, out Guid id) ? id : Guid.Empty;
}

internal sealed class RecordStudyResultRequestValidator : Validator<RecordStudyResultRequest>
{
    public RecordStudyResultRequestValidator()
    {
        RuleFor(r => r.Id).MustBeStudyId();
        RuleFor(r => r.LineKey).NotEmpty().MaximumLength(100);
        RuleFor(r => r.Color).MustBeColor();
        RuleFor(r => r.Mistakes).InclusiveBetween(0, 1000);
    }
}
