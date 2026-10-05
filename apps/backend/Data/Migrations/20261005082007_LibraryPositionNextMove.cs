using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Chess.Backend.Data.Migrations
{
    /// <inheritdoc />
    public partial class LibraryPositionNextMove : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "NextUci",
                table: "library_positions",
                type: "character varying(5)",
                maxLength: 5,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Result",
                table: "library_positions",
                type: "character varying(7)",
                maxLength: 7,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Source",
                table: "library_positions",
                type: "character varying(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "");

            // Backfill (broadcast-explorer D6): the move played next (Postgres arrays count from 1, so the move after ply
            // n is MovesUci[n + 1], null past the end), the game's result and source; then the start position for every
            // game, which was not stored before.
            migrationBuilder.Sql("""
                UPDATE library_positions p
                SET "NextUci" = g."MovesUci"[p."Ply" + 1], "Result" = g."Result", "Source" = g."Source"
                FROM library_games g
                WHERE g."Id" = p."GameId";

                INSERT INTO library_positions ("PositionKey", "GameId", "Ply", "NextUci", "Result", "Source")
                SELECT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -', g."Id", 0, g."MovesUci"[1], g."Result", g."Source"
                FROM library_games g
                ON CONFLICT DO NOTHING;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_library_positions_explorer",
                table: "library_positions",
                column: "PositionKey")
                .Annotation("Npgsql:IndexInclude", new[] { "NextUci", "Result", "Source", "GameId", "Ply" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""DELETE FROM library_positions WHERE "Ply" = 0;""");

            migrationBuilder.DropIndex(
                name: "IX_library_positions_explorer",
                table: "library_positions");

            migrationBuilder.DropColumn(
                name: "NextUci",
                table: "library_positions");

            migrationBuilder.DropColumn(
                name: "Result",
                table: "library_positions");

            migrationBuilder.DropColumn(
                name: "Source",
                table: "library_positions");
        }
    }
}
