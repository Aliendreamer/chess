using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Chess.Backend.Data.ModelConfigurations;

internal sealed class TrainingCandidateConfiguration : IEntityTypeConfiguration<TrainingCandidate>
{
    public void Configure(EntityTypeBuilder<TrainingCandidate> builder)
    {
        builder.ToTable("training_candidates");
        builder.HasKey(c => c.PositionKey);
        builder.Property(c => c.PositionKey).HasMaxLength(100);
        builder.Property(c => c.Fen).HasMaxLength(100);
        builder.Property(c => c.MasterUci).HasMaxLength(5);
        builder.Property(c => c.Status).HasMaxLength(10);
        // The miner's round: its waiting candidates, and how many of a game it has looked at (Training:PerGame).
        builder.HasIndex(c => c.Status);
        builder.HasIndex(c => c.LibraryGameId);
        builder.HasOne<LibraryGame>().WithMany().HasForeignKey(c => c.LibraryGameId).OnDelete(DeleteBehavior.Cascade);
    }
}
