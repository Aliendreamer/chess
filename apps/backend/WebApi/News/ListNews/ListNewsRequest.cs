using FluentValidation;

namespace Chess.Backend.WebApi.News;

internal sealed class ListNewsRequest
{
    /// <summary>One source's id (e.g. <c>fide</c>); all sources when absent.</summary>
    [QueryParam]
    public string? Source { get; init; }

    [QueryParam]
    public int? Limit { get; init; }

    [QueryParam]
    public string? Cursor { get; init; }
}

internal sealed class ListNewsRequestValidator : Validator<ListNewsRequest>
{
    public ListNewsRequestValidator()
    {
        RuleFor(r => r.Source).Matches("^[a-z0-9-]{1,32}$").When(r => r.Source is not null).WithMessage("Not a source id.");
        RuleFor(r => r.Limit).GreaterThan(0).When(r => r.Limit is not null);
        RuleFor(r => r.Cursor).Must(c => KeysetCursor.TryDecodeGuid(c, out _, out _) || c is null).WithMessage("Invalid cursor.");
    }
}
