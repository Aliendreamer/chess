using FluentValidation;

namespace Chess.Backend.WebApi.Games;

internal sealed class MyGamesRequest
{
    /// <summary>Page size; larger values are clamped to the configured maximum.</summary>
    [QueryParam]
    public int Limit { get; init; } = Keyset.DefaultLimit;

    /// <summary>The previous page's <c>nextCursor</c>.</summary>
    [QueryParam]
    public string? Cursor { get; init; }
}

internal sealed class MyGamesRequestValidator : Validator<MyGamesRequest>
{
    public MyGamesRequestValidator()
    {
        RuleFor(r => r.Limit).GreaterThan(0);
        RuleFor(r => r.Cursor).Must(c => GameCursor.TryDecode(c, out _)).WithMessage("Invalid cursor.");
    }
}
