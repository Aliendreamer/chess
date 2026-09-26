using System.Net;
using System.Net.Http.Json;
using Chess.Backend.Data;
using Chess.Backend.Events;
using Chess.Backend.IntegrationTests.Fixtures;
using Chess.Backend.Projections;
using Confluent.Kafka;
using Confluent.Kafka.Admin;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Chess.Backend.IntegrationTests;

/// <summary>
/// The dead-letter path through real Kafka (design D1, D4, D7): a projection that throws on one aggregate
/// parks it, keeps parking its later events without calling the projection, lets every other aggregate through,
/// and still commits the offset. After the "fix", an Admin replay drains the parked events in order and live
/// events flow again.
/// </summary>
[Collection(StackFixture.Collection)]
public sealed class DeadLetterRoundTripTests(StackFixture stack)
{
    private const string Group = "it.flaky";
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan TestTimeout = TimeSpan.FromMinutes(4);

    /// <summary>A consumer with its own group on game.events that throws on one ping id until "fixed".</summary>
    private sealed class FlakyProjection(ProjectDbContext db, ILogger<PositionedProjection<Pinged>> logger)
        : PositionedProjection<Pinged>(db, logger)
    {
        public static string? PoisonId { get; set; }

        public static bool Fixed { get; set; }

        public override string Topic => "game.events";

        public override string GroupId => Group;

        protected override string EventType => EventTypes.Pinged;

        protected override Task StageAsync(EventEnvelope<Pinged> e, CancellationToken ct) =>
            e.AggregateId == PoisonId && !Fixed
                ? throw new InvalidOperationException($"flaky projection cannot handle {e.AggregateId}")
                : Task.CompletedTask;
    }

    private sealed record ReplayResponse(string GroupId, string AggregateId, string Status, int Applied, string? Error);

    private sealed record DeadLetterItem(string Id, string GroupId, string AggregateId, long Seq, int Attempts);

    private sealed record DeadLetterPage(IReadOnlyList<DeadLetterItem> Items, string? NextCursor, int Limit);

    [Fact]
    public async Task A_poison_aggregate_is_parked_others_flow_and_an_admin_replay_drains_it()
    {
        using CancellationTokenSource cts = new(TestTimeout);
        CancellationToken ct = cts.Token;
        string poison = Api.NewId();
        string healthy = Api.NewId();
        FlakyProjection.PoisonId = poison;
        FlakyProjection.Fixed = false;
        await using PingApiFactory app = new(services =>
        {
            services.AddScoped<FlakyProjection>();
            services.AddScoped<IProjection>(sp => sp.GetRequiredService<FlakyProjection>());
        });
        using HttpClient client = await app.CreateReadyClientAsync(ct);

        // seq 1 fails 5 times and is parked; seq 2 is parked behind the quarantine without a call.
        await Api.PostPingAsync(client, poison, "one", ct);
        await Api.EventuallyAsync(async () => (await ParkedAsync(poison, ct)).Count == 1, "seq 1 parked", Timeout, ct);
        await Api.PostPingAsync(client, poison, "two", ct);
        await Api.EventuallyAsync(async () => (await ParkedAsync(poison, ct)).Count == 2, "seq 2 parked behind the quarantine", Timeout, ct);
        List<(long Seq, int Attempts)> parked = await ParkedAsync(poison, ct);
        Assert.Equal([(1L, 5), (2L, 0)], parked);

        // Another aggregate on the same topic and group still flows, and the group's offset reaches the end.
        await Api.PostPingAsync(client, healthy, "fine", ct);
        await Api.EventuallyAsync(async () => await PositionAsync(healthy, ct) == 1, "healthy aggregate applied", Timeout, ct);
        await Api.EventuallyAsync(async () => await LagAsync(ct) == 0, "offset committed past the parked records", Timeout, ct);

        // The admin list shows them; a non-admin can neither list nor replay.
        using (HttpResponseMessage forbidden = await client.PostAsync(ReplayUri(poison), null, ct))
        {
            Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
        }

        using (HttpRequestMessage list = new(HttpMethod.Get, $"/api/admin/projections/dead-letters?groupId={Group}&limit=1"))
        {
            list.Headers.Add(PingApiFactory.RolesHeader, "Admin");
            using HttpResponseMessage listed = await client.SendAsync(list, ct);
            Assert.Equal(HttpStatusCode.OK, listed.StatusCode);
            DeadLetterPage? page = await listed.Content.ReadFromJsonAsync<DeadLetterPage>(Api.Json, ct);
            Assert.Equal(poison, Assert.Single(page!.Items).AggregateId);
            Assert.NotNull(page.NextCursor); // two parked, limit 1: the keyset seek has somewhere to go
        }

        // Replay while still broken: 409, nothing moves.
        ReplayResponse stillBroken = await ReplayAsync(client, poison, HttpStatusCode.Conflict, ct);
        Assert.Equal((0, "Failed"), (stillBroken.Applied, stillBroken.Status));
        Assert.Equal(2, (await ParkedAsync(poison, ct)).Count);

        // After the fix: both apply in order, the quarantine lifts, and seq 3 flows live.
        FlakyProjection.Fixed = true;
        ReplayResponse replayed = await ReplayAsync(client, poison, HttpStatusCode.OK, ct);
        Assert.Equal((2, "Completed"), (replayed.Applied, replayed.Status));
        Assert.Empty(await ParkedAsync(poison, ct));
        Assert.Equal(2, await PositionAsync(poison, ct));

        await Api.PostPingAsync(client, poison, "three", ct);
        await Api.EventuallyAsync(async () => await PositionAsync(poison, ct) == 3, "seq 3 applied live after replay", Timeout, ct);
        Assert.Empty(await ParkedAsync(poison, ct));
    }

    private static string ReplayUri(string aggregateId) => $"/api/admin/projections/{Group}/dead-letters/{aggregateId}/replay";

    private static async Task<ReplayResponse> ReplayAsync(HttpClient client, string aggregateId, HttpStatusCode expected, CancellationToken ct)
    {
        using HttpRequestMessage request = new(HttpMethod.Post, ReplayUri(aggregateId));
        request.Headers.Add(PingApiFactory.RolesHeader, "Admin");
        using HttpResponseMessage response = await client.SendAsync(request, ct);
        Assert.Equal(expected, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ReplayResponse>(Api.Json, ct))!;
    }

    private ProjectDbContext Db() =>
        new(new DbContextOptionsBuilder<ProjectDbContext>().UseNpgsql(stack.PostgresConnectionString).Options);

    private async Task<List<(long Seq, int Attempts)>> ParkedAsync(string aggregateId, CancellationToken ct)
    {
        await using ProjectDbContext db = Db();
        return (await db.ProjectionDeadLetters.AsNoTracking()
                .Where(d => d.GroupId == Group && d.AggregateId == aggregateId)
                .OrderBy(d => d.Seq)
                .Select(d => new { d.Seq, d.Attempts })
                .ToListAsync(ct))
            .ConvertAll(d => (d.Seq, d.Attempts));
    }

    private async Task<long> PositionAsync(string aggregateId, CancellationToken ct)
    {
        await using ProjectDbContext db = Db();
        return await db.ConsumerPositions.AsNoTracking()
            .Where(p => p.GroupId == Group && p.AggregateId == aggregateId)
            .Select(p => p.LastSeq)
            .SingleOrDefaultAsync(ct);
    }

    /// <summary>High watermark minus committed offset over every partition the group has committed on; -1 before any commit.</summary>
    private async Task<long> LagAsync(CancellationToken ct)
    {
        using IAdminClient admin = new AdminClientBuilder(new AdminClientConfig { BootstrapServers = stack.BootstrapServers }).Build();
        List<ListConsumerGroupOffsetsResult> offsets = await admin.ListConsumerGroupOffsetsAsync([new ConsumerGroupTopicPartitions(Group, null)]);
        List<TopicPartitionOffsetError> committed = [.. offsets.SelectMany(o => o.Partitions).Where(p => p.Topic == "game.events" && p.Offset.Value >= 0)];
        if (committed.Count == 0)
        {
            return -1;
        }

        using IConsumer<Ignore, Ignore> probe = new ConsumerBuilder<Ignore, Ignore>(new ConsumerConfig
        {
            BootstrapServers = stack.BootstrapServers,
            GroupId = "it.lag-probe",
        }).Build();
        ct.ThrowIfCancellationRequested();
        return committed.Sum(p => probe.QueryWatermarkOffsets(p.TopicPartition, TimeSpan.FromSeconds(5)).High.Value - p.Offset.Value);
    }
}
