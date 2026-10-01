using Chess.Backend.Games;
using FluentValidation;

namespace Chess.Backend.WebApi.Games;

internal sealed class StartEngineGameRequest
{
    /// <summary>The engine's level as <c>GET /api/engine-levels</c> lists it: <c>1320</c> (Casual) … <c>max</c> (Maximum).</summary>
    public string Level { get; init; } = string.Empty;

    /// <summary><c>white</c>, <c>black</c> or <c>random</c>: your colour.</summary>
    public string Color { get; init; } = SideNames.Random;
}

internal sealed class StartEngineGameRequestValidator : Validator<StartEngineGameRequest>
{
    public StartEngineGameRequestValidator()
    {
        RuleFor(r => r.Level).Must(l => EngineLevel.Find(l) is not null).WithMessage("Level must be 1320, 1600, 2000, 2400 or max.");
        RuleFor(r => r.Color).Must(SideNames.IsChoice).WithMessage("Colour must be white, black or random.");
    }
}
