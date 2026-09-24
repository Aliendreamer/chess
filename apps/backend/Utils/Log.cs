namespace Chess.Backend.Utils;

/// <summary>Source-generated log messages: no boxing, no formatting when the level is off.</summary>
internal static partial class Log
{
    [LoggerMessage(Level = LogLevel.Information, Message = "Purged {Count} dead sessions")]
    public static partial void PurgedSessions(ILogger logger, int count);

    [LoggerMessage(Level = LogLevel.Information, Message = "Provisioned user {UserId} for subject {Subject}")]
    public static partial void ProvisionedUser(ILogger logger, long userId, string subject);

    [LoggerMessage(Level = LogLevel.Information, Message = "Refresh failed for session {SessionId}")]
    public static partial void RefreshFailed(ILogger logger, Exception exception, long sessionId);

    [LoggerMessage(Level = LogLevel.Warning, Message = "IdP token revocation returned {Status}")]
    public static partial void RevocationStatus(ILogger logger, int status);

    [LoggerMessage(Level = LogLevel.Warning, Message = "IdP token revocation failed")]
    public static partial void RevocationFailed(ILogger logger, Exception exception);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Token endpoint returned {Status}: {Body}")]
    public static partial void TokenEndpointError(ILogger logger, int status, string body);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Callback rejected: {Reason}")]
    public static partial void CallbackRejected(ILogger logger, string reason);

    [LoggerMessage(Level = LogLevel.Error, Message = "Session cleanup failed; will retry next interval")]
    public static partial void CleanupFailed(ILogger logger, Exception exception);

    [LoggerMessage(Level = LogLevel.Debug, Message = "Projection skipped replayed event {AggregateId}#{Seq}")]
    public static partial void ProjectionSkippedReplay(ILogger logger, string aggregateId, long seq);

    [LoggerMessage(Level = LogLevel.Error, Message = "{GroupId}: gap for {AggregateId} after seq {LastSeq}, got {Seq}; stalling")]
    public static partial void ProjectionGap(ILogger logger, string groupId, string aggregateId, long lastSeq, long seq);

    [LoggerMessage(Level = LogLevel.Warning, Message = "{GroupId}: attempt {Attempt} at {AggregateId}#{Seq} failed; retrying")]
    public static partial void ProjectionAttemptFailed(ILogger logger, Exception exception, string groupId, string aggregateId, long seq, int attempt);

    [LoggerMessage(Level = LogLevel.Error, Message = "{GroupId}: parked {AggregateId}#{Seq} after {Attempts} attempts; aggregate quarantined")]
    public static partial void ProjectionParked(ILogger logger, Exception exception, string groupId, string aggregateId, long seq, int attempts);

    [LoggerMessage(Level = LogLevel.Warning, Message = "{GroupId}: parked {AggregateId}#{Seq} behind an existing quarantine")]
    public static partial void ProjectionParkedBehindQuarantine(ILogger logger, string groupId, string aggregateId, long seq);

    [LoggerMessage(Level = LogLevel.Information, Message = "{GroupId}: replayed {Applied} parked events for {AggregateId}; quarantine lifted: {Lifted}")]
    public static partial void ProjectionReplayed(ILogger logger, string groupId, string aggregateId, int applied, bool lifted);

    [LoggerMessage(Level = LogLevel.Error, Message = "Consumer stream for {GroupId} failed; restarting")]
    public static partial void ConsumerStreamFailed(ILogger logger, Exception exception, string groupId);

    [LoggerMessage(Level = LogLevel.Information, Message = "Journal publisher lease acquired; publishing from {StreamId}@{Ordering}")]
    public static partial void PublisherLeaseAcquired(ILogger logger, string streamId, long ordering);

    [LoggerMessage(Level = LogLevel.Debug, Message = "Journal publisher lease is held elsewhere; retrying in {Delay}")]
    public static partial void PublisherLeaseBusy(ILogger logger, TimeSpan delay);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Journal publisher stopped ({Reason}); re-acquiring in {Delay}")]
    public static partial void PublisherStopped(ILogger logger, Exception exception, string reason, TimeSpan delay);
}
