using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Chess.Backend.Data.ModelConfigurations;

internal sealed class MistakeDrillConfiguration : IEntityTypeConfiguration<MistakeDrill>
{
    public void Configure(EntityTypeBuilder<MistakeDrill> builder)
    {
        builder.ToTable("mistake_drills");
        builder.HasKey(d => new { d.UserId, d.GameId, d.Ply });
        builder.Property(d => d.Fen).HasMaxLength(100);
        builder.Property(d => d.PlayedUci).HasMaxLength(5);
        builder.Property(d => d.PlayedSan).HasMaxLength(10);
        builder.Property(d => d.Class).HasMaxLength(10);
        // What is due for a member, soonest first.
        builder.HasIndex(d => new { d.UserId, d.DueAt });
    }
}
