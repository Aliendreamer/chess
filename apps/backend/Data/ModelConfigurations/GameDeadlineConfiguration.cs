using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Chess.Backend.Data.ModelConfigurations;

internal sealed class GameDeadlineConfiguration : IEntityTypeConfiguration<GameDeadline>
{
    public void Configure(EntityTypeBuilder<GameDeadline> builder)
    {
        builder.ToTable("game_deadlines");
        builder.HasKey(d => d.GameId);
        builder.Property(d => d.LastSeq).IsConcurrencyToken();
        // The sweeper's query: the earliest due deadlines first.
        builder.HasIndex(d => d.DueAt);
    }
}
