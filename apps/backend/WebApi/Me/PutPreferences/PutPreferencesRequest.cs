using FluentValidation;

namespace Chess.Backend.WebApi.Me;

/// <summary>The whole set of preferences; every value must be one the site offers.</summary>
internal sealed class PutPreferencesRequest
{
    public string BoardTheme { get; init; } = string.Empty;

    public string PieceSet { get; init; } = string.Empty;

    public string Animation { get; init; } = string.Empty;

    public bool Coordinates { get; init; }

    public string SiteTheme { get; init; } = string.Empty;

    public Preferences ToPreferences() => new(BoardTheme, PieceSet, Animation, Coordinates, SiteTheme);
}

internal sealed class PutPreferencesRequestValidator : Validator<PutPreferencesRequest>
{
    public PutPreferencesRequestValidator() =>
        RuleFor(r => r.ToPreferences())
            .Must(p => p.Problem() is null)
            .WithMessage((_, p) => p.Problem());
}
