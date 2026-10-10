using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Chess.Backend.Data.ModelConfigurations;

internal sealed class TrainingPositionConfiguration : IEntityTypeConfiguration<TrainingPosition>
{
    public void Configure(EntityTypeBuilder<TrainingPosition> builder)
    {
        builder.ToTable("training_positions");
        builder.HasKey(p => p.Id);
        builder.Property(p => p.Id).ValueGeneratedNever();
        builder.Property(p => p.PositionKey).HasMaxLength(100);
        builder.HasIndex(p => p.PositionKey).IsUnique();
        builder.Property(p => p.Fen).HasMaxLength(100);
        builder.Property(p => p.SideToMove).HasMaxLength(5);
        builder.Property(p => p.MasterUci).HasMaxLength(5);
        builder.Property(p => p.Gap).HasColumnType("real");
        builder.Property(p => p.Eco).HasMaxLength(3);
        builder.Property(p => p.OpeningName).HasMaxLength(255);
        builder.Property(p => p.Phase).HasMaxLength(10);
        builder.Property(p => p.White).HasMaxLength(255);
        builder.Property(p => p.Black).HasMaxLength(255);
        builder.Property(p => p.Event).HasMaxLength(255);
        // The session filters (training D4): phase and ECO prefix as plain indexes, names and opening by trigram (ILIKE).
        builder.HasIndex(p => p.Phase);
        builder.HasIndex(p => p.Eco);
        builder.HasIndex(p => p.Year);
        builder.HasIndex(p => p.White).HasMethod("gin").HasOperators("gin_trgm_ops");
        builder.HasIndex(p => p.Black).HasMethod("gin").HasOperators("gin_trgm_ops");
        builder.HasIndex(p => p.OpeningName).HasMethod("gin").HasOperators("gin_trgm_ops");
        builder.HasOne<LibraryGame>().WithMany().HasForeignKey(p => p.LibraryGameId).OnDelete(DeleteBehavior.Cascade);
    }
}
