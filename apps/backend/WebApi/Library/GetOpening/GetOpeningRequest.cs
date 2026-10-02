using FluentValidation;

namespace Chess.Backend.WebApi.Library;

internal sealed class GetOpeningRequest
{
    /// <summary>The position key of a position to name.</summary>
    [QueryParam]
    public string Key { get; init; } = string.Empty;
}

internal sealed class GetOpeningRequestValidator : Validator<GetOpeningRequest>
{
    public GetOpeningRequestValidator() => RuleFor(r => r.Key).MustBePositionKey();
}
