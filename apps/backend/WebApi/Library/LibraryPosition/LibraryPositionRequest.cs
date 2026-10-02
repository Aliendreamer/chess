using FluentValidation;

namespace Chess.Backend.WebApi.Library;

internal sealed class LibraryPositionRequest
{
    /// <summary>The position key: a FEN's first four fields (<c>PositionKey.Of</c>; the browser's <c>positionKey</c>).</summary>
    [QueryParam]
    public string Key { get; init; } = string.Empty;
}

internal sealed class LibraryPositionRequestValidator : Validator<LibraryPositionRequest>
{
    public LibraryPositionRequestValidator() => RuleFor(r => r.Key).MustBePositionKey();
}
