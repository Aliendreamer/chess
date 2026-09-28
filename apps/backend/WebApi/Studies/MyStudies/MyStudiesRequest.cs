using Chess.Backend.WebApi.Games;
using FluentValidation;

namespace Chess.Backend.WebApi.Studies;

internal sealed class MyStudiesRequest
{
    /// <summary>Page size: <c>Api:DefaultPageSize</c> when absent, clamped to <c>Api:MaxPageSize</c>.</summary>
    [QueryParam]
    public int? Limit { get; init; }

    /// <summary>The previous page's <c>nextCursor</c>.</summary>
    [QueryParam]
    public string? Cursor { get; init; }
}

internal sealed class MyStudiesRequestValidator : Validator<MyStudiesRequest>
{
    public MyStudiesRequestValidator()
    {
        RuleFor(r => r.Limit).GreaterThan(0).When(r => r.Limit is not null);
        RuleFor(r => r.Cursor).Must(c => GameCursor.TryDecode(c, out _)).WithMessage("Invalid cursor.");
    }
}
