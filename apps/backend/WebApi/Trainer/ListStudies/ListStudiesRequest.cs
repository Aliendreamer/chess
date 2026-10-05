using Chess.Backend.WebApi.Games;
using FluentValidation;

namespace Chess.Backend.WebApi.Trainer;

internal sealed class ListStudiesRequest
{
    /// <summary><c>white</c> or <c>black</c>: the side the member plays.</summary>
    [QueryParam]
    public string Color { get; init; } = "white";

    /// <summary>Page size: <c>Api:DefaultPageSize</c> when absent, clamped to <c>Api:MaxPageSize</c>.</summary>
    [QueryParam]
    public int? Limit { get; init; }

    /// <summary>The previous page's <c>nextCursor</c>.</summary>
    [QueryParam]
    public string? Cursor { get; init; }
}

internal sealed class ListStudiesRequestValidator : Validator<ListStudiesRequest>
{
    public ListStudiesRequestValidator()
    {
        RuleFor(r => r.Color).MustBeColor();
        RuleFor(r => r.Limit).GreaterThan(0).When(r => r.Limit is not null);
        RuleFor(r => r.Cursor).Must(c => GameCursor.TryDecode(c, out _)).WithMessage("Invalid cursor.");
    }
}
