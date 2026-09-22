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
