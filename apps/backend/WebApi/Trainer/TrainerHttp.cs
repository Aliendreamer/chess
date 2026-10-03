using FluentValidation;

namespace Chess.Backend.WebApi.Trainer;

/// <summary>The rules every trainer endpoint shares (opening-trainer).</summary>
internal static class TrainerHttp
{
    public static IRuleBuilderOptions<T, string> MustBeColor<T>(this IRuleBuilder<T, string> rule) =>
        rule.Must(c => c is "white" or "black").WithMessage("Color must be white or black.");
}

/// <summary>A family or variation and a side: the request of the family and next-line endpoints.</summary>
internal sealed class FamilyRequest
{
    /// <summary>A family ("Sicilian Defense") or variation ("Sicilian Defense: Najdorf Variation").</summary>
    [QueryParam]
    public string Name { get; init; } = string.Empty;

    /// <summary><c>white</c> or <c>black</c>: the side the member plays.</summary>
    [QueryParam]
    public string Color { get; init; } = "white";
}

internal sealed class FamilyRequestValidator : Validator<FamilyRequest>
{
    public FamilyRequestValidator()
    {
        RuleFor(r => r.Name).NotEmpty().MaximumLength(255);
        RuleFor(r => r.Color).MustBeColor();
    }
}
