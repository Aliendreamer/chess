namespace Chess.Backend.WebApi.Matchmaking;

/// <summary>
/// Still waiting (with your place and the queue's live seq: ignore pairings in frames up to it), or matched (with
/// the game).
/// </summary>
internal sealed record JoinQueueResponse(
    string Status,
    string TimeControl,
    int? Position,
    int? Waiting,
    Guid? GameId,
    long? WhiteId,
    long? BlackId,
    long? Seq);
