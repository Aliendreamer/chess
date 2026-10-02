using Chess.Backend.Library;
using FluentValidation;

namespace Chess.Backend.WebApi.Library;

/// <summary>A library game in a list (game-library): headers, opening, source and licence — never moves or notes.</summary>
internal sealed record LibraryGameItem(
    Guid Id,
    string White,
    string Black,
    string? Event,
    string? Site,
    string? Round,
    string? Date,
    int? Year,
    string Result,
    string? Eco,
    string? Opening,
    bool WorldChampionship,
    int Ply,
    string Source,
    string Licence);

/// <summary>The library's shapes and the rules every library endpoint shares.</summary>
internal static class LibraryHttp
{
    /// <summary>The library changes only when an admin imports: an answer may be reused for an hour.</summary>
    public const string CacheControl = "private, max-age=3600";

    public static LibraryGameItem ToItem(LibraryGame g) => new(
        g.Id, g.White, g.Black, g.Event, g.Site, g.Round, g.DateText, g.Year, g.Result, g.Eco, g.OpeningName, g.WorldChampionship, g.Ply,
        g.Source, g.Licence);

    /// <summary>A position key as <c>PositionKey.Of</c> writes it: four FEN fields, nothing else.</summary>
    public static IRuleBuilderOptions<T, string> MustBePositionKey<T>(this IRuleBuilder<T, string> rule) =>
        rule.NotEmpty().MaximumLength(100).Matches("^[pnbrqkPNBRQK1-8/]+ [wb] [KQkq-]+ [a-h1-8-]+$").WithMessage("Not a position key.");
}
