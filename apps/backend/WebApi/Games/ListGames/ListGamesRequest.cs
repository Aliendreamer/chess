using FluentValidation;

namespace Chess.Backend.WebApi.Games;

internal sealed class ListGamesRequest
{
    /// <summary><c>playing</c> or <c>ended</c>.</summary>
    [QueryParam]
    public string? Status { get; init; }

    /// <summary>Page size: <c>Api:DefaultPageSize</c> when absent, clamped to <c>Api:MaxPageSize</c>.</summary>
    [QueryParam]
    public int? Limit { get; init; }

    /// <summary>The previous page's <c>nextCursor</c>.</summary>
    [QueryParam]
    public string? Cursor { get; init; }
}

internal sealed class ListGamesRequestValidator : Validator<ListGamesRequest>
{
    public ListGamesRequestValidator()
    {
        RuleFor(r => r.Status).Must(GameReads.IsListStatus).WithMessage("status must be 'playing' or 'ended'.");
        RuleFor(r => r.Limit).GreaterThan(0).When(r => r.Limit is not null);
        RuleFor(r => r.Cursor).Must(c => GameCursor.TryDecode(c, out _)).WithMessage("Invalid cursor.");
    }
}
