using FluentValidation;

namespace Chess.Backend.WebApi.Games;

internal sealed class MyGamesRequest
{
    /// <summary>Page size: <c>Api:DefaultPageSize</c> when absent, clamped to <c>Api:MaxPageSize</c>.</summary>
    [QueryParam]
    public int? Limit { get; init; }

    /// <summary>The previous page's <c>nextCursor</c>.</summary>
    [QueryParam]
    public string? Cursor { get; init; }

    /// <summary><c>mine</c>: only the games being played where it is your move.</summary>
    [QueryParam]
    public string? Turn { get; init; }
}

internal sealed class MyGamesRequestValidator : Validator<MyGamesRequest>
{
    public MyGamesRequestValidator()
    {
        RuleFor(r => r.Limit).GreaterThan(0).When(r => r.Limit is not null);
        RuleFor(r => r.Cursor).Must(c => GameCursor.TryDecode(c, out _)).WithMessage("Invalid cursor.");
        RuleFor(r => r.Turn).Must(t => t is null or "mine").WithMessage("Turn must be mine.");
    }
}
