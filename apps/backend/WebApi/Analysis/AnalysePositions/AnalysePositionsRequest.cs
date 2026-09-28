using Chess.Backend.Analysis;
using FluentValidation;

namespace Chess.Backend.WebApi.Analysis;

internal sealed class AnalysePositionsRequest
{
    /// <summary>The positions, as FENs: one to evaluate, or the next positions of a line (up to <c>Analysis:MaxPositions</c>).</summary>
    public IReadOnlyList<string> Positions { get; init; } = [];

    /// <summary><c>quick</c>, <c>normal</c> or <c>deep</c>.</summary>
    public string Think { get; init; } = "normal";
}

internal sealed class AnalysePositionsRequestValidator : Validator<AnalysePositionsRequest>
{
    public AnalysePositionsRequestValidator()
    {
        RuleFor(r => r.Think).Must(t => t is "quick" or "normal" or "deep").WithMessage("Think must be quick, normal or deep.");
        RuleFor(r => r.Positions).NotEmpty();
        RuleForEach(r => r.Positions).Must(fen => PositionKey.Of(fen) is not null).WithMessage("Not a position (FEN): {PropertyValue}");
    }
}
