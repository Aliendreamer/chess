using Chess.Backend.Data.ReadModels;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Chess.Backend.Data.ModelConfigurations;

internal sealed class RmPingConfiguration : IEntityTypeConfiguration<RmPing>
{
    public void Configure(EntityTypeBuilder<RmPing> builder)
    {
        builder.ToTable("rm_pings");
        builder.HasKey(p => p.PingId);
        builder.Property(p => p.PingId).HasMaxLength(64);
        builder.Property(p => p.LastText).HasMaxLength(200);
        // The watermark doubles as the optimistic-concurrency token: a consumer that lost a rebalance race
        // updates zero rows and gets DbUpdateConcurrencyException instead of applying the same seq twice.
        builder.Property(p => p.LastSeq).IsConcurrencyToken();
        // Keyset paging key for GET api/pings: (UpdatedAt, PingId) DESC, scanned backwards.
        builder.HasIndex(p => new { p.UpdatedAt, p.PingId });
    }
}

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

internal sealed class RmMoveConfiguration : IEntityTypeConfiguration<RmMove>
{
    public void Configure(EntityTypeBuilder<RmMove> builder)
    {
        builder.ToTable("rm_moves");
        builder.HasKey(m => new { m.GameId, m.Ply });
        builder.Property(m => m.Uci).HasMaxLength(5);
        builder.Property(m => m.San).HasMaxLength(10);
        builder.Property(m => m.FenAfter).HasMaxLength(100);
    }
}
