using Chess.Backend.Games;
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

        // The engine's players (engine-play D2): fixed negative ids, so games can name them without a lookup.
        DateTimeOffset seeded = new(2026, 9, 27, 0, 0, 0, TimeSpan.Zero);
        builder.HasData(EngineLevel.All.Select(level => new User
        {
            Id = level.UserId,
            Sub = level.Sub,
            Username = level.Name,
            CreatedAt = seeded,
            UpdatedAt = seeded,
        }));
    }
}
