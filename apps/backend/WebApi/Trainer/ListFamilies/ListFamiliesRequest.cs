using FluentValidation;

namespace Chess.Backend.WebApi.Trainer;

internal sealed class ListFamiliesRequest
{
    /// <summary>Part of a family's or variation's name, any case; every family when absent.</summary>
    [QueryParam]
    public string? Q { get; init; }

    [QueryParam]
    public string Color { get; init; } = "white";
}

internal sealed class ListFamiliesRequestValidator : Validator<ListFamiliesRequest>
{
    public ListFamiliesRequestValidator()
    {
        RuleFor(r => r.Q).MaximumLength(100);
        RuleFor(r => r.Color).MustBeColor();
    }
}
