using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Chess.Backend.Data.ModelConfigurations;

internal sealed class NotificationGameConfiguration : IEntityTypeConfiguration<NotificationGame>
{
    public void Configure(EntityTypeBuilder<NotificationGame> builder)
    {
        builder.ToTable("notification_games");
        builder.HasKey(g => g.GameId);
        builder.Property(g => g.WhiteName).HasMaxLength(255);
        builder.Property(g => g.BlackName).HasMaxLength(255);
        builder.Property(g => g.LastSeq).IsConcurrencyToken();
    }
}
