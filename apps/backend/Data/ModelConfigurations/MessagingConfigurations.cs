using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Chess.Backend.Data.ModelConfigurations;

internal sealed class OutboxOffsetConfiguration : IEntityTypeConfiguration<OutboxOffset>
{
    public void Configure(EntityTypeBuilder<OutboxOffset> builder)
    {
        builder.ToTable("outbox_offsets");
        builder.HasKey(o => o.StreamId);
        builder.Property(o => o.StreamId).HasMaxLength(128);
    }
}

internal sealed class ConsumerPositionConfiguration : IEntityTypeConfiguration<ConsumerPosition>
{
    public void Configure(EntityTypeBuilder<ConsumerPosition> builder)
    {
        builder.ToTable("consumer_positions");
        builder.HasKey(p => new { p.GroupId, p.AggregateId });
        builder.Property(p => p.GroupId).HasMaxLength(128);
        builder.Property(p => p.AggregateId).HasMaxLength(128);
        // Same rule as RmPing.LastSeq: the watermark is the concurrency token, so a racing writer loses loudly.
        builder.Property(p => p.LastSeq).IsConcurrencyToken();
    }
}

internal sealed class ProjectionDeadLetterConfiguration : IEntityTypeConfiguration<ProjectionDeadLetter>
{
    public void Configure(EntityTypeBuilder<ProjectionDeadLetter> builder)
    {
        builder.ToTable("projection_dead_letters");
        builder.HasKey(d => d.Id);
        builder.Property(d => d.GroupId).HasMaxLength(128);
        // AggregateId and KafkaKey stay unbounded text on purpose: the fallback identity is the raw Kafka key, and
        // a length limit here would turn an oversized key into a park that itself fails — a new poison loop.
        builder.Property(d => d.LastError).HasMaxLength(2000);
        // Quarantine check (EXISTS) and replay order (lowest seq first) for one consumer + aggregate.
        builder.HasIndex(d => new { d.GroupId, d.AggregateId, d.Seq });
        // Keyset paging key for the admin list: (ParkedAt, Id) DESC.
        builder.HasIndex(d => new { d.ParkedAt, d.Id });
    }
}
