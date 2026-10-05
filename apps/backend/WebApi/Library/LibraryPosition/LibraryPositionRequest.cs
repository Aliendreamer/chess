using Chess.Backend.Library;
using FluentValidation;

namespace Chess.Backend.WebApi.Library;

internal sealed class LibraryPositionRequest
{
    /// <summary>The position key: a FEN's first four fields (<c>PositionKey.Of</c>; the browser's <c>positionKey</c>).</summary>
    [QueryParam]
    public string Key { get; init; } = string.Empty;

    /// <summary><c>all</c> (default), <c>wc</c> or <c>broadcasts</c> (broadcast-explorer D8).</summary>
    [QueryParam]
    public string? Source { get; init; }

    public LibrarySource SourceChoice => LibrarySources.TryParse(Source, out LibrarySource source) ? source : LibrarySource.All;
}

internal sealed class LibraryPositionRequestValidator : Validator<LibraryPositionRequest>
{
    public LibraryPositionRequestValidator()
    {
        RuleFor(r => r.Key).MustBePositionKey();
        RuleFor(r => r.Source).Must(s => LibrarySources.TryParse(s, out _)).WithMessage("Source is all, wc or broadcasts.");
    }
}
