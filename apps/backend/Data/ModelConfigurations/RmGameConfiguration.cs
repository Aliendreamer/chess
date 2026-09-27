using Chess.Backend.Data.ReadModels;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Chess.Backend.Data.ModelConfigurations;

internal sealed class RmGameConfiguration : IEntityTypeConfiguration<RmGame>
{
    public void Configure(EntityTypeBuilder<RmGame> builder)
    {
        builder.ToTable("rm_games");
        builder.HasKey(g => g.GameId);
        builder.Property(g => g.WhiteName).HasMaxLength(255);
        builder.Property(g => g.BlackName).HasMaxLength(255);
        builder.Property(g => g.TimeControl).HasMaxLength(16);
        builder.Property(g => g.Status).HasMaxLength(16);
        builder.Property(g => g.Result).HasMaxLength(8);
        builder.Property(g => g.Reason).HasMaxLength(64);
        builder.Property(g => g.LastFen).HasMaxLength(100);
        builder.Property(g => g.LastUci).HasMaxLength(5);
        builder.Property(g => g.LastSan).HasMaxLength(10);
        // The watermark is the concurrency token: a consumer that lost a rebalance race fails its save (event-publishing).
        builder.Property(g => g.LastSeq).IsConcurrencyToken();
        // Keyset paging for the lists: status filter, then (UpdatedAt, GameId) DESC.
        builder.HasIndex(g => new { g.Status, g.UpdatedAt, g.GameId });
    }
}
