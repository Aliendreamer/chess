namespace Chess.Backend.Games;

internal enum Side
{
    White,
    Black,
}

internal enum GameResult
{
    /// <summary>No result: the game was aborted before it really started (<c>*</c> in PGN).</summary>
    None,
    WhiteWins,
    BlackWins,
    Draw,
}

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
}

internal sealed record GameOutcome(GameResult Result, EndReason Reason);

/// <summary>What <see cref="ChessRules.TryApply"/> made of a move.</summary>
internal abstract record MoveOutcome;

internal sealed record MoveApplied(string Uci, string San, string FenAfter, GameOutcome? End) : MoveOutcome;

internal sealed record MoveRejected(string Reason) : MoveOutcome;

internal static class GameResultExtensions
{
    public static string ToPgn(this GameResult result) => result switch
    {
        GameResult.WhiteWins => "1-0",
        GameResult.BlackWins => "0-1",
        GameResult.Draw => "1/2-1/2",
        _ => "*",
    };

    public static Side Opponent(this Side side) => side == Side.White ? Side.Black : Side.White;

    public static GameResult WinFor(this Side side) => side == Side.White ? GameResult.WhiteWins : GameResult.BlackWins;
}
