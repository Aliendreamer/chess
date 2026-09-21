using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Chess.Backend.Data.ModelConfigurations;

internal sealed class UserSessionConfiguration : IEntityTypeConfiguration<UserSession>
{
    public void Configure(EntityTypeBuilder<UserSession> builder)
    {
        builder.ToTable(Constants.Tables.UserSessions);
        builder.HasKey(s => s.Id);
        builder.Property(s => s.TokenHash).HasMaxLength(128).IsRequired();
        builder.HasIndex(s => s.TokenHash).IsUnique();
        builder.Property(s => s.Subject).HasMaxLength(255).IsRequired();
        builder.HasIndex(s => s.Subject);
        builder.Property(s => s.AccessToken).HasColumnType("text").IsRequired();
        builder.Property(s => s.RefreshToken).HasColumnType("text");
        builder.Ignore(s => s.IsRevoked);
    }
}
