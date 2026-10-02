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
        builder.HasOne<LibraryGame>().WithMany().HasForeignKey(p => p.GameId).OnDelete(DeleteBehavior.Cascade);
    }
}
