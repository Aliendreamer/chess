using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Chess.Backend.Data.ModelConfigurations;

internal sealed class TrainingSyncedConfiguration : IEntityTypeConfiguration<TrainingSynced>
{
    public void Configure(EntityTypeBuilder<TrainingSynced> builder)
    {
        builder.ToTable("training_synced");
        builder.HasKey(s => new { s.UserId, s.GameId });
    }
}
