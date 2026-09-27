using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Chess.Backend.Data.ModelConfigurations;

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
