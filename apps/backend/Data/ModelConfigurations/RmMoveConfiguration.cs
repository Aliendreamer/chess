using Chess.Backend.Data.ReadModels;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Chess.Backend.Data.ModelConfigurations;

internal sealed class RmMoveConfiguration : IEntityTypeConfiguration<RmMove>
{
    public void Configure(EntityTypeBuilder<RmMove> builder)
    {
        builder.ToTable("rm_moves");
        builder.HasKey(m => new { m.GameId, m.Ply });
        builder.Property(m => m.Uci).HasMaxLength(5);
        builder.Property(m => m.San).HasMaxLength(10);
        builder.Property(m => m.FenAfter).HasMaxLength(100);
    }
}
