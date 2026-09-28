using Chess.Backend.Analysis;
using FluentValidation;

namespace Chess.Backend.WebApi.Analysis;

internal sealed class AnalysePositionRequest
{
    /// <summary>The position, as a FEN.</summary>
    public string Fen { get; init; } = string.Empty;

    /// <summary><c>quick</c>, <c>normal</c> or <c>deep</c>.</summary>
    public string Think { get; init; } = "normal";
}

internal sealed class AnalysePositionRequestValidator : Validator<AnalysePositionRequest>
{
    public AnalysePositionRequestValidator()
    {
        RuleFor(r => r.Think).Must(t => t is "quick" or "normal" or "deep").WithMessage("Think must be quick, normal or deep.");
        RuleFor(r => r.Fen).Must(fen => PositionKey.Of(fen) is not null).WithMessage("Not a position (FEN).");
    }
}
