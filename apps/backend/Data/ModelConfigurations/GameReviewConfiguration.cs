using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Chess.Backend.Data.ModelConfigurations;

internal sealed class GameReviewConfiguration : IEntityTypeConfiguration<GameReview>
{
    public void Configure(EntityTypeBuilder<GameReview> builder)
    {
        builder.ToTable("game_reviews");
        builder.HasKey(r => r.GameId);
        builder.Property(r => r.GameId).ValueGeneratedNever();
    }
}
