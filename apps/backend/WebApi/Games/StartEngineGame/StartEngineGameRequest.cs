using Chess.Backend.Games;
using FluentValidation;

namespace Chess.Backend.WebApi.Games;

internal sealed class StartEngineGameRequest
{
    /// <summary>The engine's level: <c>1320</c>, <c>1600</c>, <c>2000</c>, <c>2400</c> or <c>max</c>.</summary>
    public string Level { get; init; } = string.Empty;

    /// <summary><c>white</c>, <c>black</c> or <c>random</c>: your colour.</summary>
    public string Color { get; init; } = "random";
}

internal sealed class StartEngineGameRequestValidator : Validator<StartEngineGameRequest>
{
    public StartEngineGameRequestValidator()
    {
        RuleFor(r => r.Level).Must(l => EngineLevel.Find(l) is not null).WithMessage("Level must be 1320, 1600, 2000, 2400 or max.");
        RuleFor(r => r.Color).Must(c => c is "white" or "black" or "random").WithMessage("Colour must be white, black or random.");
    }
}
