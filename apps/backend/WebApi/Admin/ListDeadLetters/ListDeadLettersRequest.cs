using FluentValidation;

namespace Chess.Backend.WebApi.Admin;

internal sealed class ListDeadLettersRequest
{
    /// <summary>Page size: <c>Api:DefaultPageSize</c> when absent, clamped to <c>Api:MaxPageSize</c>.</summary>
    [QueryParam]
    public int? Limit { get; init; }

    /// <summary>The previous page's <c>nextCursor</c>.</summary>
    [QueryParam]
    public string? Cursor { get; init; }

    /// <summary>Only this projection's records (e.g. <c>chess.rm-games</c>).</summary>
    [QueryParam]
    public string? GroupId { get; init; }
}

internal sealed class ListDeadLettersRequestValidator : Validator<ListDeadLettersRequest>
{
    public ListDeadLettersRequestValidator()
    {
        RuleFor(r => r.Limit).GreaterThan(0).When(r => r.Limit is not null);
        RuleFor(r => r.Cursor).Must(c => c is null || KeysetCursor.TryDecodeGuid(c, out _, out _)).WithMessage("Invalid cursor.");
    }
}
