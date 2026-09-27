using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Chess.Backend.Data.ModelConfigurations;

internal sealed class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.ToTable(Constants.Tables.Users);
        builder.HasKey(u => u.Id);
        builder.Property(u => u.Sub).HasMaxLength(255).IsRequired();
        builder.HasIndex(u => u.Sub).IsUnique();
        builder.Property(u => u.Email).HasMaxLength(320);
        builder.Property(u => u.FullName).HasMaxLength(255);
        builder.Property(u => u.Username).HasMaxLength(255);
        builder.Property(u => u.Version).IsConcurrencyToken();
    }
}

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
