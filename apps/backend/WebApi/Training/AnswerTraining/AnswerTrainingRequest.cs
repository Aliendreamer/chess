using Chess.Backend.Training;
using FluentValidation;

namespace Chess.Backend.WebApi.Training;

internal sealed class AnswerTrainingRequest
{
    /// <summary><c>games</c> or <c>library</c>.</summary>
    public string Mode { get; init; } = string.Empty;

    /// <summary>The position's id as <c>next</c> gave it.</summary>
    public string Id { get; init; } = string.Empty;

    /// <summary>The member's move, UCI (<c>e2e4</c>, <c>e7e8q</c>).</summary>
    public string Uci { get; init; } = string.Empty;
}

internal sealed partial class AnswerTrainingRequestValidator : Validator<AnswerTrainingRequest>
{
    public AnswerTrainingRequestValidator()
    {
        RuleFor(r => r.Mode).MustBeMode();
        RuleFor(r => r.Id)
            .Must((r, id) => TrainingIds.IsValid(r.Mode, id))
            .When(r => TrainingModes.IsMode(r.Mode))
            .WithMessage("Not an id of the mode (g:{gameId}:{ply} or p:{positionId}).");
        RuleFor(r => r.Uci).Matches(UciPattern()).WithMessage("Not a UCI move (e.g. e2e4, e7e8q).");
    }

    [System.Text.RegularExpressions.GeneratedRegex("^[a-h][1-8][a-h][1-8][qrbn]?$")]
    private static partial System.Text.RegularExpressions.Regex UciPattern();
}
