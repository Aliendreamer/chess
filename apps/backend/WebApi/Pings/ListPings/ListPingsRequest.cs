using FluentValidation;

namespace Chess.Backend.WebApi.Pings;

internal sealed class ListPingsRequest
{
    /// <summary>Page size; larger values are clamped to the configured maximum.</summary>
    [QueryParam]
    public int Limit { get; init; } = Keyset.DefaultLimit;

    /// <summary>The previous page's <c>nextCursor</c>.</summary>
    [QueryParam]
    public string? Cursor { get; init; }
}

internal sealed class ListPingsRequestValidator : Validator<ListPingsRequest>
{
    public ListPingsRequestValidator()
    {
        RuleFor(r => r.Limit).GreaterThan(0);
        RuleFor(r => r.Cursor).Must(c => c is null || KeysetCursor.TryDecode(c, out _)).WithMessage("Invalid cursor.");
    }
}
