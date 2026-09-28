using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Chess.Backend.Data.ModelConfigurations;

internal sealed class StudyConfiguration : IEntityTypeConfiguration<Study>
{
    public void Configure(EntityTypeBuilder<Study> builder)
    {
        builder.ToTable("studies");
        builder.HasKey(s => s.Id);
        builder.Property(s => s.Title).HasMaxLength(200);
        builder.Property(s => s.StartFen).HasMaxLength(100);
        builder.Property(s => s.Tree).HasColumnType("jsonb");
        builder.Property(s => s.White).HasMaxLength(255);
        builder.Property(s => s.Black).HasMaxLength(255);
        builder.Property(s => s.Result).HasMaxLength(7);
        builder.Property(s => s.Date).HasMaxLength(10);
        builder.Property(s => s.Version).IsConcurrencyToken();
        // "My studies", newest first: one seek on (OwnerId, CreatedAt, Id), the keyset of every list (CLAUDE.md).
        builder.HasIndex(s => new { s.OwnerId, s.CreatedAt, s.Id });
    }
}
