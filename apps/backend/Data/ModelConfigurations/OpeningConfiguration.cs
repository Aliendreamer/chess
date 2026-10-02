using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Chess.Backend.Data.ModelConfigurations;

internal sealed class OpeningConfiguration : IEntityTypeConfiguration<Opening>
{
    public void Configure(EntityTypeBuilder<Opening> builder)
    {
        builder.ToTable("openings");
        builder.HasKey(o => o.PositionKey);
        builder.Property(o => o.PositionKey).HasMaxLength(100);
        builder.Property(o => o.Eco).HasMaxLength(3);
        builder.Property(o => o.Name).HasMaxLength(255);
    }
}
