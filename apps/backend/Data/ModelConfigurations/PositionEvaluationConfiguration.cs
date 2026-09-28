using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Chess.Backend.Data.ModelConfigurations;

internal sealed class PositionEvaluationConfiguration : IEntityTypeConfiguration<PositionEvaluation>
{
    public void Configure(EntityTypeBuilder<PositionEvaluation> builder)
    {
        builder.ToTable("position_evaluations");
        builder.HasKey(e => new { e.PositionKey, e.ThinkMs });
        builder.Property(e => e.PositionKey).HasMaxLength(100);
        builder.Property(e => e.Status).HasMaxLength(10);
        builder.Property(e => e.Lines).HasColumnType("jsonb");
    }
}
