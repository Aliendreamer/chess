namespace Chess.Backend.Akka;

/// <summary>
/// Every metric label key and span attribute key the backend writes. Dashboards (tools/localdev/observability/grafana)
/// and the tail sampler (otel-sampler.yml) query these by name, so a rename here is a rename there too.
/// </summary>
internal static class TelemetryTags
{
    // Metric labels: types only, never ids (ActorMetricsTests checks).
    public const string Actor = "actor";
    public const string Message = "message";
    public const string Event = "event";
    public const string Outcome = "outcome";
    public const string Kind = "kind";
    public const string Group = "group";
    public const string Topic = "topic";
    public const string Status = "status";
    public const string Singleton = "singleton";
    public const string Region = "region";
    public const string Shard = "shard";

    /// <summary>The slow-actor rule in otel-sampler.yml keys on this attribute.</summary>
    public const string ActorType = "actor.type";
    public const string ActorMessage = "actor.message";
    public const string PersistEvents = "persist.events";
    public const string GameId = "game.id";
    public const string InviteId = "invite.id";
    public const string PingId = "ping.id";
    public const string PingSeq = "ping.seq";
    public const string OutboxStream = "outbox.stream";
    public const string OutboxCount = "outbox.count";
    public const string OutboxLastOrdering = "outbox.last_ordering";
    public const string ProjectionAggregate = "projection.aggregate";
    public const string ProjectionSeq = "projection.seq";
    public const string ProjectionOutcome = "projection.outcome";

    // OpenTelemetry messaging conventions.
    public const string MessagingSystem = "messaging.system";
    public const string MessagingKafka = "kafka";
    public const string MessagingDestination = "messaging.destination.name";
    public const string MessagingKey = "messaging.kafka.message.key";
    public const string MessagingGroup = "messaging.consumer.group.name";
}

/// <summary>How an actor's message went: the <c>outcome</c> label of <c>chess.actor.messages</c>.</summary>
internal enum MessageOutcome
{
    Handled,
    Unhandled,
    Failed,
}

/// <summary>Why no actor took a message: the <c>kind</c> label of <c>chess.akka.dead_letters</c>.</summary>
internal enum DeadLetterKind
{
    Unhandled,
    Dropped,
    Suppressed,
    Dead,
}

internal static class TelemetryLabels
{
    /// <summary>The label dashboards query; the actors dashboard counts every <c>outcome!="handled"</c> as an error.</summary>
    public static string Label(this MessageOutcome outcome) => outcome switch
    {
        MessageOutcome.Handled => "handled",
        MessageOutcome.Unhandled => "unhandled",
        MessageOutcome.Failed => "failed",
        _ => throw new ArgumentOutOfRangeException(nameof(outcome), outcome, null),
    };

    public static string Label(this DeadLetterKind kind) => kind switch
    {
        DeadLetterKind.Unhandled => "unhandled",
        DeadLetterKind.Dropped => "dropped",
        DeadLetterKind.Suppressed => "suppressed",
        DeadLetterKind.Dead => "dead",
        _ => throw new ArgumentOutOfRangeException(nameof(kind), kind, null),
    };
}
