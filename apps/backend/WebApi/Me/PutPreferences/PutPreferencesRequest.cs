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

    /// <summary>The engine switches (evaluation-display); left out, each keeps its default, so an older page saving its
    /// themes does not turn the analysis board's engine off.</summary>
    public bool? AnalysisBar { get; init; }

    public bool? AnalysisLines { get; init; }

    public bool? PlayBar { get; init; }

    public bool? PlayLines { get; init; }

    public Preferences ToPreferences() => new(
        BoardTheme,
        PieceSet,
        Animation,
        Coordinates,
        SiteTheme,
        AnalysisBar ?? Preferences.Default.AnalysisBar,
        AnalysisLines ?? Preferences.Default.AnalysisLines,
        PlayBar ?? Preferences.Default.PlayBar,
        PlayLines ?? Preferences.Default.PlayLines);
}

internal sealed class PutPreferencesRequestValidator : Validator<PutPreferencesRequest>
{
    public PutPreferencesRequestValidator() =>
        RuleFor(r => r.ToPreferences())
            .Must(p => p.Problem() is null)
            .WithMessage((_, p) => p.Problem());
}
