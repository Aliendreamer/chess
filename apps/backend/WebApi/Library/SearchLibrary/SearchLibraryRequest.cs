using Chess.Backend.Library;
using FluentValidation;

namespace Chess.Backend.WebApi.Library;

internal sealed class SearchLibraryRequest
{
    /// <summary>Part of either player's name, any case.</summary>
    [QueryParam]
    public string? Player { get; init; }

    /// <summary>Part of the event's name, any case.</summary>
    [QueryParam]
    public string? Event { get; init; }

    [QueryParam]
    public int? From { get; init; }

    [QueryParam]
    public int? To { get; init; }

    /// <summary><c>1-0</c>, <c>0-1</c> or <c>1/2-1/2</c>.</summary>
    [QueryParam]
    public string? Result { get; init; }

    /// <summary>World Championship games only.</summary>
    [QueryParam]
    public bool? Wc { get; init; }

    /// <summary>An ECO code or its start: <c>C67</c>, <c>C6</c>, <c>C</c>.</summary>
    [QueryParam]
    public string? Eco { get; init; }

    /// <summary>Part of the opening's name, any case.</summary>
    [QueryParam]
    public string? Opening { get; init; }

    [QueryParam]
    public int? Limit { get; init; }

    [QueryParam]
    public string? Cursor { get; init; }

    public LibrarySearch ToSearch() => new(Player, Event, From, To, Result, Wc, Eco, Opening);
}

internal sealed class SearchLibraryRequestValidator : Validator<SearchLibraryRequest>
{
    public SearchLibraryRequestValidator()
    {
        RuleFor(r => r.Player).MaximumLength(100);
        RuleFor(r => r.Event).MaximumLength(100);
        RuleFor(r => r.Opening).MaximumLength(100);
        RuleFor(r => r.Result).Must(r => r is null or "1-0" or "0-1" or "1/2-1/2").WithMessage("Result must be 1-0, 0-1 or 1/2-1/2.");
        RuleFor(r => r.Eco).Matches("^[A-Ea-e][0-9]{0,2}$").When(r => r.Eco is not null).WithMessage("ECO is A00–E99 or its start.");
        RuleFor(r => r.From).InclusiveBetween(1400, 2100).When(r => r.From is not null);
        RuleFor(r => r.To).InclusiveBetween(1400, 2100).When(r => r.To is not null);
        RuleFor(r => r.Limit).GreaterThan(0).When(r => r.Limit is not null);
        RuleFor(r => r.Cursor).Must(c => LibraryCursor.TryDecode(c, out _)).WithMessage("Invalid cursor.");
    }
}
