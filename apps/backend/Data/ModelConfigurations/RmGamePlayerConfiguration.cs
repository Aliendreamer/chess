using Chess.Backend.Data.ReadModels;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Chess.Backend.Data.ModelConfigurations;

internal sealed class RmGamePlayerConfiguration : IEntityTypeConfiguration<RmGamePlayer>
{
    public void Configure(EntityTypeBuilder<RmGamePlayer> builder)
    {
        builder.ToTable("rm_game_players");
        builder.HasKey(p => new { p.UserId, p.GameId });
        builder.Property(p => p.Color).HasMaxLength(8);
        builder.Property(p => p.OpponentName).HasMaxLength(255);
        // "My games": one seek per user, newest first.
        builder.HasIndex(p => new { p.UserId, p.CreatedAt, p.GameId });
    }
}
