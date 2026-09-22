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
        builder.HasIndex(p => p.UpdatedAt);
    }
}
