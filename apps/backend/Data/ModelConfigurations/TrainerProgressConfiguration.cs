using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Chess.Backend.Data.ModelConfigurations;

internal sealed class TrainerProgressConfiguration : IEntityTypeConfiguration<TrainerProgress>
{
    public void Configure(EntityTypeBuilder<TrainerProgress> builder)
    {
        builder.ToTable("trainer_progress");
        builder.HasKey(p => new { p.UserId, p.LineKey, p.Color });
        builder.Property(p => p.LineKey).HasMaxLength(100);
        builder.Property(p => p.Color).HasMaxLength(5);
        // What is due for a member and side, soonest first.
        builder.HasIndex(p => new { p.UserId, p.Color, p.DueAt });
    }
}
