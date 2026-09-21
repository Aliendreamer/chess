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
        builder.Property(u => u.Version).IsConcurrencyToken();
    }
}
