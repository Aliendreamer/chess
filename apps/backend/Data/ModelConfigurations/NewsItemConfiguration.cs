using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Chess.Backend.Data.ModelConfigurations;

internal sealed class NewsItemConfiguration : IEntityTypeConfiguration<NewsItem>
{
    public void Configure(EntityTypeBuilder<NewsItem> builder)
    {
        builder.ToTable("news_items");
        builder.HasKey(n => n.Id);
        builder.Property(n => n.Source).HasMaxLength(32);
        builder.Property(n => n.Title).HasMaxLength(300);
        builder.Property(n => n.Url).HasMaxLength(1000);
        // One row per article per source: a fetch upserts on it.
        builder.HasIndex(n => new { n.Source, n.Url }).IsUnique();
        // The list's keyset, newest first, and the same per source.
        builder.HasIndex(n => new { n.PublishedAt, n.Id });
        builder.HasIndex(n => new { n.Source, n.PublishedAt, n.Id });
    }
}
