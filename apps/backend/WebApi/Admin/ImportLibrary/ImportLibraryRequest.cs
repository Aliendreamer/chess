using Chess.Backend.Library;
using FluentValidation;

namespace Chess.Backend.WebApi.Admin;

/// <summary>One batch of library games (game-library D3) and where they came from; the browser parsed the PGN.</summary>
internal sealed class ImportLibraryRequest
{
    /// <summary>Where the games came from, e.g. "PGN Mentor".</summary>
    public string Source { get; init; } = string.Empty;

    /// <summary>Under what terms, e.g. "CC BY-SA 4.0" or "moves only (facts)".</summary>
    public string Licence { get; init; } = string.Empty;

    /// <summary>The file name or URL the games were taken from.</summary>
    public string? SourceRef { get; init; }

    /// <summary>The batch is World Championship games.</summary>
    public bool WorldChampionship { get; init; }

    public IReadOnlyList<ImportGame> Games { get; init; } = [];
}

internal sealed class ImportLibraryRequestValidator : Validator<ImportLibraryRequest>
{
    public ImportLibraryRequestValidator()
    {
        RuleFor(r => r.Source).NotEmpty().MaximumLength(100);
        RuleFor(r => r.Licence).NotEmpty().MaximumLength(100);
        RuleFor(r => r.SourceRef).MaximumLength(500);
        RuleFor(r => r.Games).Must(g => g.Count is > 0 and <= LibraryService.MaxBatch)
            .WithMessage($"Send 1 to {LibraryService.MaxBatch} games at a time.");
        RuleForEach(r => r.Games).ChildRules(game =>
        {
            game.RuleFor(g => g.White).MaximumLength(255);
            game.RuleFor(g => g.Black).MaximumLength(255);
            game.RuleFor(g => g.Event).MaximumLength(255);
            game.RuleFor(g => g.Site).MaximumLength(255);
            game.RuleFor(g => g.Round).MaximumLength(32);
            game.RuleFor(g => g.Date).MaximumLength(10);
            game.RuleFor(g => g.Eco).MaximumLength(3);
            game.RuleFor(g => g.Moves).Must(m => m is not null && m.Count <= 1000).WithMessage("At most 1000 moves.");
        });
    }
}
