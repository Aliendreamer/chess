using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Chess.Backend.Data.Migrations
{
    /// <inheritdoc />
    public partial class LastSeqConcurrencyToken : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Model-only: LastSeq on rm_pings / consumer_positions became a concurrency token, which changes
            // the generated UPDATE ... WHERE, not the schema. Kept so the snapshot matches the model.
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
        }
    }
}
