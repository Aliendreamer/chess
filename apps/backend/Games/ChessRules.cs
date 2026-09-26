using System.Text.RegularExpressions;
using Gera = global::Chess;

namespace Chess.Backend.Games;

/// <summary>
/// The only door to the rules library (design D1). Gera.Chess shares our root namespace <c>Chess</c>, so it is used
/// through the <c>Gera</c> alias here and nowhere else; the actor and its tests see only UCI strings, SAN, FEN and
/// our own result types. Moves come in as UCI (<c>e2e4</c>, <c>a7a8n</c>) because UCI is unambiguous without a
/// position — which is also why the move list, not the FEN, is what recovery replays (D22).
/// </summary>
internal sealed partial class ChessRules
{
    private readonly Gera.ChessBoard _board;
    private readonly List<string> _moves = [];
    private char? _pendingPromotion;

    private ChessRules(Gera.ChessBoard board)
    {
        _board = board;
        // Gera asks for the promotion piece through an event; the requested piece is parked in _pendingPromotion
        // for the duration of one Move call.
        _board.OnPromotePawn += (_, e) => e.PromotionResult = _pendingPromotion switch
        {
            'r' => Gera.PromotionType.ToRook,
            'b' => Gera.PromotionType.ToBishop,
            'n' => Gera.PromotionType.ToKnight,
            _ => Gera.PromotionType.ToQueen,
        };
    }

    public Side SideToMove => _board.Turn == Gera.PieceColor.White ? Side.White : Side.Black;

    public string Fen => _board.ToFen();

    /// <summary>Every accepted move, as UCI, in order: the game's canonical record.</summary>
    public IReadOnlyList<string> Moves => _moves;

    /// <summary>A new game from the initial position, with every automatic draw rule on (they are off by default).</summary>
    public static ChessRules NewGame() => new(new Gera.ChessBoard { AutoEndgameRules = Gera.AutoEndgameRules.All });

    /// <summary>Rebuilds a game from its move list (recovery); an illegal entry means a corrupt record.</summary>
    public static ChessRules Replay(IEnumerable<string> uciMoves)
    {
        ArgumentNullException.ThrowIfNull(uciMoves);
        ChessRules rules = NewGame();
        foreach (string uci in uciMoves)
        {
            if (rules.TryApply(uci) is MoveRejected rejected)
            {
                throw new InvalidOperationException($"Cannot replay move {rules._moves.Count + 1} ({uci}): {rejected.Reason}");
            }
        }

        return rules;
    }

    /// <summary>A position with no history — tests and material checks only; a real game starts from <see cref="NewGame"/>.</summary>
    public static ChessRules FromFen(string fen) => new(Gera.ChessBoard.LoadFromFen(fen, Gera.AutoEndgameRules.All));

    public MoveOutcome TryApply(string uci)
    {
        Match m = UciPattern().Match(uci ?? string.Empty);
        if (!m.Success)
        {
            return new MoveRejected("Not a UCI move (e.g. e2e4, e7e8q).");
        }

        if (_board.IsEndGame)
        {
            return new MoveRejected("The game is over.");
        }

        string from = m.Groups[1].Value;
        string to = m.Groups[2].Value;
        char? promotion = m.Groups[3].Success ? m.Groups[3].Value[0] : null;
        if (_board[from] is not { } piece || piece.Color != _board.Turn)
        {
            return new MoveRejected($"No piece of the side to move on {from}.");
        }

        bool promoting = piece.Type == Gera.PieceType.Pawn && to[1] == (piece.Color == Gera.PieceColor.White ? '8' : '1');
        if (promoting != promotion.HasValue)
        {
            return new MoveRejected(promoting
                ? "A pawn reaching the last rank needs a promotion piece (q, r, b or n)."
                : "Only a pawn reaching the last rank promotes.");
        }

        Gera.Move move = new(from, to);
        _pendingPromotion = promotion;
        try
        {
            if (!_board.Move(move))
            {
                return new MoveRejected("Illegal move.");
            }
        }
        catch (Exception e) when (e is Gera.ChessInvalidMoveException or Gera.ChessPieceNotFoundException
                                      or Gera.ChessArgumentException or Gera.ChessGameEndedException)
        {
            return new MoveRejected(e.Message);
        }
        finally
        {
            _pendingPromotion = null;
        }

        _moves.Add(uci!);
        // Gera marks a stalemating move with '$', which is not SAN.
        string san = (move.San ?? throw new InvalidOperationException("Rules library produced no SAN.")).TrimEnd('$');
        return new MoveApplied(uci!, san, Fen, Outcome());
    }

    /// <summary>
    /// Whether <paramref name="side"/> still has mating material (D18 flag fall). False for a lone king or a king
    /// with a single bishop or knight; anything else — a pawn, a rook, a queen, two minor pieces — can mate.
    /// </summary>
    public bool CanMate(Side side)
    {
        Gera.PieceColor color = side == Side.White ? Gera.PieceColor.White : Gera.PieceColor.Black;
        int minors = 0;
        for (short x = 0; x < Gera.ChessBoard.MAX_COLS; x++)
        {
            for (short y = 0; y < Gera.ChessBoard.MAX_ROWS; y++)
            {
                if (_board[x, y] is not { } p || p.Color != color || p.Type == Gera.PieceType.King)
                {
                    continue;
                }

                if (p.Type == Gera.PieceType.Bishop || p.Type == Gera.PieceType.Knight)
                {
                    minors++;
                }
                else
                {
                    return true;
                }
            }
        }

        return minors >= 2;
    }

    /// <summary>The moves as PGN movetext (plus the result when the rules ended the game).</summary>
    public string ToPgnMovetext() => _board.ToPgn().Trim();

    private GameOutcome? Outcome()
    {
        if (_board.EndGame is not { } end)
        {
            return null;
        }

        GameResult won = end.WonSide == Gera.PieceColor.White ? GameResult.WhiteWins
            : end.WonSide == Gera.PieceColor.Black ? GameResult.BlackWins
            : GameResult.Draw;
        EndReason reason = end.EndgameType switch
        {
            Gera.EndgameType.Checkmate => EndReason.Checkmate,
            Gera.EndgameType.Stalemate => EndReason.Stalemate,
            Gera.EndgameType.InsufficientMaterial => EndReason.InsufficientMaterial,
            Gera.EndgameType.Repetition => EndReason.ThreefoldRepetition,
            Gera.EndgameType.FiftyMoveRule => EndReason.FiftyMoveRule,
            _ => throw new InvalidOperationException($"Unexpected rules ending {end.EndgameType}."),
        };
        return new GameOutcome(won, reason);
    }

    [GeneratedRegex("^([a-h][1-8])([a-h][1-8])([qrbn])?$")]
    private static partial Regex UciPattern();
}
