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
        // A study's lines (study-repertoire-trainer D5): found per member, study and side; gone with the study.
        builder.HasIndex(p => new { p.UserId, p.StudyId, p.Color });
        builder.HasOne<Study>().WithMany().HasForeignKey(p => p.StudyId).OnDelete(DeleteBehavior.Cascade);
    }
}
