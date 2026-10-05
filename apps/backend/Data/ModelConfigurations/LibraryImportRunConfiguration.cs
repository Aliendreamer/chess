using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Chess.Backend.Data.ModelConfigurations;

internal sealed class LibraryImportRunConfiguration : IEntityTypeConfiguration<LibraryImportRun>
{
    public void Configure(EntityTypeBuilder<LibraryImportRun> builder)
    {
        builder.ToTable("library_import_runs");
        builder.HasKey(r => r.Id);
        builder.Property(r => r.Month).HasMaxLength(7);
        builder.Property(r => r.State).HasMaxLength(10);
        builder.Property(r => r.Error).HasMaxLength(500);
        // The admin list, newest first.
        builder.HasIndex(r => r.StartedAt);
    }
}
