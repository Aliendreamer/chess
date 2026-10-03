using FluentValidation;

namespace Chess.Backend.WebApi.Practice;

internal sealed class RecordPracticeRequest
{
    public Guid GameId { get; init; }

    /// <summary>The mistake's ply in its game.</summary>
    public int Ply { get; init; }

    /// <summary>Whether the member's move was one the engine accepts.</summary>
    public bool Correct { get; init; }
}

internal sealed class RecordPracticeRequestValidator : Validator<RecordPracticeRequest>
{
    public RecordPracticeRequestValidator()
    {
        RuleFor(r => r.GameId).NotEmpty();
        RuleFor(r => r.Ply).InclusiveBetween(1, 2000);
    }
}
