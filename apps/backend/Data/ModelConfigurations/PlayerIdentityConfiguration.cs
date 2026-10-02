using Chess.Backend.Data.ReadModels;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Chess.Backend.Data.ModelConfigurations;

/// <summary>Maps <see cref="PlayerIdentity"/> onto three columns of <c>users</c> for the replica-bound context only.</summary>
internal sealed class PlayerIdentityConfiguration : IEntityTypeConfiguration<PlayerIdentity>
{
    public void Configure(EntityTypeBuilder<PlayerIdentity> builder)
    {
        builder.ToTable(Constants.Tables.Users);
        builder.HasKey(u => u.Id);
        builder.Property(u => u.Username).HasMaxLength(255);
    }
}
