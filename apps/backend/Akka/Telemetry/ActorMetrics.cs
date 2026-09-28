using System.Diagnostics;
using System.Diagnostics.Metrics;
using Akka.Cluster.Sharding;
using Akka.Event;

namespace Chess.Backend.Akka;

/// <summary>
/// What the actors do, as metrics (observability D8), meter <c>chess.actors</c>: every message handled (by actor
/// type, message type and outcome) and how long it took, persist latency, recovery time, passivations, and dead or
/// unhandled messages. Labels are types only, never an entity id: a game id per series would explode Prometheus.
/// With nothing listening an instrument update costs a check.
/// </summary>
internal static class ActorMetrics
{
    public const string MeterName = "chess.actors";

    private static readonly Meter Meter = new(MeterName);
    private static readonly Counter<long> Messages = Meter.CreateCounter<long>("chess.actor.messages", description: "Messages handled by actors");
    private static readonly Histogram<double> HandleDuration = Meter.CreateHistogram<double>("chess.actor.handle.duration", "s", "Time an actor spent handling one message");
    private static readonly Histogram<double> PersistDuration = Meter.CreateHistogram<double>("chess.actor.persist.duration", "s", "Time from Persist to its callback");
    private static readonly Histogram<double> RecoveryDuration = Meter.CreateHistogram<double>("chess.actor.recovery.duration", "s", "Time from an actor's start to the end of its replay");
    private static readonly Counter<long> Passivations = Meter.CreateCounter<long>("chess.actor.passivations", description: "Entities passivated");
    private static readonly Counter<long> DeadLetters = Meter.CreateCounter<long>("chess.akka.dead_letters", description: "Messages no actor took");

    public static void Handled(string actor, string message, string outcome, TimeSpan elapsed)
    {
        TagList tags = new() { { "actor", actor }, { "message", message } };
        HandleDuration.Record(elapsed.TotalSeconds, tags);
        tags.Add("outcome", outcome);
        Messages.Add(1, tags);
    }

    public static void Persisted(string actor, string evt, TimeSpan elapsed) =>
        PersistDuration.Record(elapsed.TotalSeconds, new TagList { { "actor", actor }, { "event", evt } });

    public static void Recovered(string actor, long startedAt) =>
        RecoveryDuration.Record(Stopwatch.GetElapsedTime(startedAt).TotalSeconds, new TagList { { "actor", actor } });

    public static void Passivated(string actor) => Passivations.Add(1, new TagList { { "actor", actor } });

    public static void DeadLetter(string message, string kind) =>
        DeadLetters.Add(1, new TagList { { "message", message }, { "kind", kind } });
}
