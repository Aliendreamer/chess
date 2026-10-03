using FluentValidation;

namespace Chess.Backend.WebApi.Trainer;

internal sealed class RecordResultRequest
{
    /// <summary>The line's id (its end position key).</summary>
    public string LineKey { get; init; } = string.Empty;

    public string Color { get; init; } = "white";

    /// <summary>Wrong moves in the run; any at all makes it a missed run.</summary>
    public int Mistakes { get; init; }
}

internal sealed class RecordResultRequestValidator : Validator<RecordResultRequest>
{
    public RecordResultRequestValidator()
    {
        RuleFor(r => r.LineKey).NotEmpty().MaximumLength(100);
        RuleFor(r => r.Color).MustBeColor();
        RuleFor(r => r.Mistakes).InclusiveBetween(0, 1000);
    }
}
