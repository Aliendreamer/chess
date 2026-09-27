using Chess.Backend.Data.ReadModels;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Chess.Backend.Data.ModelConfigurations;

internal sealed class RmPingConfiguration : IEntityTypeConfiguration<RmPing>
{
    public void Configure(EntityTypeBuilder<RmPing> builder)
    {
        builder.ToTable("rm_pings");
        builder.HasKey(p => p.PingId);
        builder.Property(p => p.PingId).HasMaxLength(64);
        builder.Property(p => p.LastText).HasMaxLength(200);
        // The watermark doubles as the optimistic-concurrency token: a consumer that lost a rebalance race
        // updates zero rows and gets DbUpdateConcurrencyException instead of applying the same seq twice.
        builder.Property(p => p.LastSeq).IsConcurrencyToken();
        // Keyset paging key for GET api/pings: (UpdatedAt, PingId) DESC, scanned backwards.
        builder.HasIndex(p => new { p.UpdatedAt, p.PingId });
    }
}
