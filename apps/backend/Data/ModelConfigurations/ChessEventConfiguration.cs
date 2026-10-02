using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Chess.Backend.Data.ModelConfigurations;

internal sealed class ChessEventConfiguration : IEntityTypeConfiguration<ChessEvent>
{
    public void Configure(EntityTypeBuilder<ChessEvent> builder)
    {
        builder.ToTable("chess_events");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Id).HasMaxLength(32);
        builder.Property(e => e.Name).HasMaxLength(300);
        builder.Property(e => e.Url).HasMaxLength(500);
        builder.Property(e => e.RoundName).HasMaxLength(100);
        builder.Property(e => e.RoundUrl).HasMaxLength(500);
        builder.Property(e => e.Location).HasMaxLength(200);
        builder.Property(e => e.FideTc).HasMaxLength(16);
    }
}
