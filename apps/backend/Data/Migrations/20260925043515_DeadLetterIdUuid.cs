using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Chess.Backend.Data.Migrations
{
    /// <inheritdoc />
    public partial class DeadLetterIdUuid : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // ROADMAP D11: ids live in native uuid columns. Npgsql's AlterColumn emits no USING clause, and Postgres
            // refuses varchar -> uuid without one; the existing values are Guid v7 as 32 hex chars, which cast directly.
            migrationBuilder.Sql("""ALTER TABLE projection_dead_letters ALTER COLUMN "Id" TYPE uuid USING "Id"::uuid;""");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""ALTER TABLE projection_dead_letters ALTER COLUMN "Id" TYPE character varying(32) USING replace("Id"::text, '-', '');""");
        }
    }
}
