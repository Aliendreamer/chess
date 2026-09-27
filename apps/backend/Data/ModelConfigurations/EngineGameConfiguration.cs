using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Chess.Backend.Data.ModelConfigurations;

internal sealed class EngineGameConfiguration : IEntityTypeConfiguration<EngineGame>
{
    public void Configure(EntityTypeBuilder<EngineGame> builder)
    {
        builder.ToTable("engine_games");
        builder.HasKey(g => g.GameId);
        builder.Property(g => g.Side).HasMaxLength(8);
        builder.Property(g => g.Level).HasMaxLength(8);
        builder.Property(g => g.LastSeq).IsConcurrencyToken();
    }
}
