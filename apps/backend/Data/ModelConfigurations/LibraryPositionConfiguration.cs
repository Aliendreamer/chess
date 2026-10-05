using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Chess.Backend.Data.ModelConfigurations;

internal sealed class LibraryPositionConfiguration : IEntityTypeConfiguration<LibraryPosition>
{
    public void Configure(EntityTypeBuilder<LibraryPosition> builder)
    {
        builder.ToTable("library_positions");
        // The key's leading column is the lookup: every game at a position, with the ply it got there.
        builder.HasKey(p => new { p.PositionKey, p.GameId, p.Ply });
        builder.Property(p => p.PositionKey).HasMaxLength(100);
        builder.Property(p => p.NextUci).HasMaxLength(5);
        builder.Property(p => p.Result).HasMaxLength(7);
        builder.Property(p => p.Source).HasMaxLength(100);
        // The explorer's index-only scan (broadcast-explorer D6): every game at a position with what it needs to count.
        builder.HasIndex(p => p.PositionKey)
            .IncludeProperties(p => new { p.NextUci, p.Result, p.Source, p.GameId, p.Ply })
            .HasDatabaseName("IX_library_positions_explorer");
        builder.HasOne<LibraryGame>().WithMany().HasForeignKey(p => p.GameId).OnDelete(DeleteBehavior.Cascade);
    }
}
