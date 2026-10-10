using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Chess.Backend.Data.ModelConfigurations;

internal sealed class TrainingProgressConfiguration : IEntityTypeConfiguration<TrainingProgress>
{
    public void Configure(EntityTypeBuilder<TrainingProgress> builder)
    {
        builder.ToTable("training_progress");
        builder.HasKey(p => new { p.UserId, p.PositionId });
        // What is due for a member, soonest first.
        builder.HasIndex(p => new { p.UserId, p.DueAt });
        builder.HasOne<TrainingPosition>().WithMany().HasForeignKey(p => p.PositionId).OnDelete(DeleteBehavior.Cascade);
    }
}
