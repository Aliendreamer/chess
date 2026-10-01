using System.Text.Json;
using System.Text.Json.Serialization;

namespace Chess.Backend.Games;

/// <summary>
/// An enum on the wire (HTTP and the live relay) is its lower-case name, <c>"playing"</c>, like every other value the
/// API sends; <see cref="WireNames.WireName{T}"/> spells it the same way for messages.
/// </summary>
internal sealed class WireEnumConverter<T>() : JsonStringEnumConverter<T>(JsonNamingPolicy.CamelCase, allowIntegerValues: false)
    where T : struct, Enum;

internal static class WireNames
{
    public static string WireName<T>(this T value)
        where T : struct, Enum => JsonNamingPolicy.CamelCase.ConvertName(value.ToString());
}

[JsonConverter(typeof(WireEnumConverter<Side>))]
internal enum Side
{
    White,
    Black,
}

/// <summary>
/// The colour names requests, events and read rows use (<c>white</c>, <c>black</c>, and <c>random</c> for a choice).
/// They are in the journal (<c>InviteCreated.Color</c>, <c>EnginePlayer.Side</c>) and in <c>rm_game_players</c>.
/// </summary>
internal static class SideNames
{
    public const string White = "white";
    public const string Black = "black";
    public const string Random = "random";

    public static string Of(Side side) => side == Side.White ? White : Black;

    /// <summary>A colour someone may ask for: white, black or random.</summary>
    public static bool IsChoice(string? color) => color is White or Black or Random;
}

internal enum GameResult
{
    /// <summary>No result: the game was aborted before it really started (<c>*</c> in PGN).</summary>
    None,
    WhiteWins,
    BlackWins,
    Draw,
}

/// <summary>
/// Why a game ended. Stored by name (<c>"FiftyMoveRule"</c>) in the journal, <c>rm_games</c> and the PGN; on the wire it
/// is camel-cased (<c>"fiftyMoveRule"</c>) like every other enum, through <see cref="EndReasons.Parse"/>.
/// </summary>
[JsonConverter(typeof(WireEnumConverter<EndReason>))]
internal enum EndReason
{
    Checkmate,
    Stalemate,
    InsufficientMaterial,
    ThreefoldRepetition,
    FiftyMoveRule,
    Resignation,
    Agreement,
    Timeout,

    /// <summary>The flag fell, but the opponent had no mating material: a draw (D18).</summary>
    TimeoutVsInsufficientMaterial,
    Aborted,

    /// <summary>The opponent was away a minute and the remaining player claimed the win or a draw.</summary>
    Abandonment,
}

internal static class EndReasons
{
    /// <summary>A stored reason as the enum; null for none (or a name this build does not know).</summary>
    public static EndReason? Parse(string? stored) =>
        Enum.TryParse(stored, ignoreCase: false, out EndReason reason) && Enum.IsDefined(reason) ? reason : null;
}

internal sealed record GameOutcome(GameResult Result, EndReason Reason);

/// <summary>What <see cref="ChessRules.TryApply"/> made of a move.</summary>
internal abstract record MoveOutcome;

internal sealed record MoveApplied(string Uci, string San, string FenAfter, GameOutcome? End) : MoveOutcome;

internal sealed record MoveRejected(string Reason) : MoveOutcome;

/// <summary>A result as PGN writes it, which is also how events, read rows and the API carry it.</summary>
internal static class PgnResults
{
    public const string WhiteWins = "1-0";
    public const string BlackWins = "0-1";
    public const string Draw = "1/2-1/2";

    /// <summary>No result: unfinished or aborted.</summary>
    public const string None = "*";

    /// <summary>A decided result (not <see cref="None"/>).</summary>
    public static bool IsDecided(string? result) => result is WhiteWins or BlackWins or Draw;
}

internal static class GameResultExtensions
{
    public static string ToPgn(this GameResult result) => result switch
    {
        GameResult.WhiteWins => PgnResults.WhiteWins,
        GameResult.BlackWins => PgnResults.BlackWins,
        GameResult.Draw => PgnResults.Draw,
        _ => PgnResults.None,
    };

    public static Side Opponent(this Side side) => side == Side.White ? Side.Black : Side.White;

    public static GameResult WinFor(this Side side) => side == Side.White ? GameResult.WhiteWins : GameResult.BlackWins;
}
