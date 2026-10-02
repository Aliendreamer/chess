using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Chess.Backend.Data.ModelConfigurations;

internal sealed class LibraryGameConfiguration : IEntityTypeConfiguration<LibraryGame>
{
    public void Configure(EntityTypeBuilder<LibraryGame> builder)
    {
        builder.ToTable("library_games");
        builder.HasKey(g => g.Id);
        builder.Property(g => g.White).HasMaxLength(255);
        builder.Property(g => g.Black).HasMaxLength(255);
        builder.Property(g => g.Event).HasMaxLength(255);
        builder.Property(g => g.Site).HasMaxLength(255);
        builder.Property(g => g.Round).HasMaxLength(32);
        builder.Property(g => g.DateText).HasMaxLength(10);
        builder.Property(g => g.Result).HasMaxLength(7);
        builder.Property(g => g.Eco).HasMaxLength(3);
        builder.Property(g => g.OpeningName).HasMaxLength(255);
        builder.Property(g => g.Source).HasMaxLength(100);
        builder.Property(g => g.Licence).HasMaxLength(100);
        builder.Property(g => g.SourceRef).HasMaxLength(500);
        builder.Property(g => g.DedupeKey).HasMaxLength(600);
        builder.HasIndex(g => g.DedupeKey).IsUnique();
        // The search list's keyset: newest year first, then id.
        builder.HasIndex(g => new { g.Year, g.Id });
        builder.HasIndex(g => g.Eco);
        // "Part of a name, any case": ILIKE '%…%' answered from trigram indexes (pg_trgm), not a scan.
        builder.HasIndex(g => g.White).HasMethod("gin").HasOperators("gin_trgm_ops");
        builder.HasIndex(g => g.Black).HasMethod("gin").HasOperators("gin_trgm_ops");
        builder.HasIndex(g => g.Event).HasMethod("gin").HasOperators("gin_trgm_ops");
    }
}
