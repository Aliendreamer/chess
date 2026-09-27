using FluentValidation;

namespace Chess.Backend.WebApi.Admin;

internal sealed class ListDeadLettersRequest
{
    /// <summary>Page size; larger values are clamped to the configured maximum.</summary>
    [QueryParam]
    public int Limit { get; init; } = Keyset.DefaultLimit;

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
        RuleFor(r => r.Limit).GreaterThan(0);
        RuleFor(r => r.Cursor).Must(c => c is null || KeysetCursor.TryDecodeGuid(c, out _, out _)).WithMessage("Invalid cursor.");
    }
}
