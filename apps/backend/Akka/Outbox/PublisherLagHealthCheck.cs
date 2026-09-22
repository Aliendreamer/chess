using Microsoft.Extensions.Diagnostics.HealthChecks;
using Npgsql;

namespace Chess.Backend.Akka.Outbox;

/// <summary>Where one publisher stream stands against the journal: its saved offset vs the newest tagged event.</summary>
internal sealed record PublisherLag(string StreamId, long LastOrdering, long JournalHead, DateTimeOffset UpdatedAt)
{
    public long Lag => Math.Max(0, JournalHead - LastOrdering);
}

internal interface IPublisherLagReader
{
    Task<IReadOnlyList<PublisherLag>> ReadAsync(CancellationToken ct);
}

internal sealed class PublisherLagOptions
{
    public const string SectionName = "Outbox";

    /// <summary>Unpublished events AND no progress for this long ⇒ Degraded.</summary>
    public TimeSpan DegradedAfter { get; set; } = TimeSpan.FromSeconds(30);
}

/// <summary>
/// Publisher lag on <c>/health</c> (design D8). Deliberately never Unhealthy: a Kafka outage stalls the publisher
/// on every node at once, and failing health would pull the whole API out of rotation for something the journal
/// is already absorbing. "Behind and not moving" is the signal, so a busy-but-advancing publisher stays Healthy.
/// </summary>
internal sealed class PublisherLagHealthCheck(IPublisherLagReader reader, TimeProvider clock, PublisherLagOptions options) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        IReadOnlyList<PublisherLag> lags;
        try
        {
            lags = await reader.ReadAsync(cancellationToken);
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            return HealthCheckResult.Degraded("could not read publisher lag", e);
        }

        Dictionary<string, object> data = [];
        List<string> stuck = [];
        DateTimeOffset now = clock.GetUtcNow();
        foreach (PublisherLag l in lags)
        {
            data[$"{l.StreamId}.lastOrdering"] = l.LastOrdering;
            data[$"{l.StreamId}.journalHead"] = l.JournalHead;
            data[$"{l.StreamId}.lag"] = l.Lag;
            if (l.Lag > 0 && now - l.UpdatedAt > options.DegradedAfter)
            {
                stuck.Add($"{l.StreamId} ({l.Lag} behind since {l.UpdatedAt:O})");
            }
        }

        return stuck.Count == 0
            ? HealthCheckResult.Healthy("publisher caught up or advancing", data)
            : HealthCheckResult.Degraded($"publisher not advancing: {string.Join(", ", stuck)}", data: data);
    }
}

/// <summary>Reads offsets and the per-tag journal head from the PRIMARY (the replica can lag either one).</summary>
[ExcludeFromCodeCoverage(Justification = "Raw SQL against a live server; the evaluation logic lives in PublisherLagHealthCheck.")]
internal sealed class PostgresPublisherLagReader(string connectionString) : IPublisherLagReader
{
    public async Task<IReadOnlyList<PublisherLag>> ReadAsync(CancellationToken ct)
    {
        await using NpgsqlConnection c = new(connectionString);
        await c.OpenAsync(ct);
        // akka.tags only exists once Akka has auto-initialised the journal; until then every head is 0.
        await using NpgsqlCommand probe = new("SELECT to_regclass('akka.tags') IS NOT NULL", c);
        bool tagsExist = await probe.ExecuteScalarAsync(ct) is true;
        string head = tagsExist ? "(SELECT COALESCE(max(t.ordering_id), 0) FROM akka.tags t WHERE t.tag = o.\"StreamId\")" : "0::bigint";
        await using NpgsqlCommand cmd = new($"""SELECT o."StreamId", o."LastOrdering", {head}, o."UpdatedAt" FROM outbox_offsets o""", c);
        await using NpgsqlDataReader r = await cmd.ExecuteReaderAsync(ct);
        List<PublisherLag> lags = [];
        while (await r.ReadAsync(ct))
        {
            lags.Add(new PublisherLag(r.GetString(0), r.GetInt64(1), r.GetInt64(2), r.GetFieldValue<DateTimeOffset>(3)));
        }

        return lags;
    }
}
