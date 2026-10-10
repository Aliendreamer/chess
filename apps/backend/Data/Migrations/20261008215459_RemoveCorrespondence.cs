using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Chess.Backend.Data.Migrations
{
    /// <inheritdoc />
    public partial class RemoveCorrespondence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Correspondence (7d) games are gone entirely, and a 7d game's journal no longer recovers, so its read-side
            // rows go too: every table keyed by a game id, dependants first (none has a foreign key to rm_games), then
            // the consumer bookkeeping keyed by the aggregate id (the game id without dashes) and the two consumer groups
            // that no longer exist. A 7d game is never against the engine; engine_games is cleaned for completeness.
            migrationBuilder.Sql("""
                DELETE FROM mistake_drills WHERE "GameId" IN (SELECT "GameId" FROM rm_games WHERE "TimeControl" = '7d');
                DELETE FROM game_reviews WHERE "GameId" IN (SELECT "GameId" FROM rm_games WHERE "TimeControl" = '7d');
                DELETE FROM engine_games WHERE "GameId" IN (SELECT "GameId" FROM rm_games WHERE "TimeControl" = '7d');
                DELETE FROM rm_moves WHERE "GameId" IN (SELECT "GameId" FROM rm_games WHERE "TimeControl" = '7d');
                DELETE FROM rm_game_players WHERE "GameId" IN (SELECT "GameId" FROM rm_games WHERE "TimeControl" = '7d');
                DELETE FROM consumer_positions WHERE "AggregateId" IN (SELECT replace("GameId"::text, '-', '') FROM rm_games WHERE "TimeControl" = '7d');
                DELETE FROM projection_dead_letters WHERE "AggregateId" IN (SELECT replace("GameId"::text, '-', '') FROM rm_games WHERE "TimeControl" = '7d');
                DELETE FROM rm_games WHERE "TimeControl" = '7d';

                DELETE FROM consumer_positions WHERE "GroupId" IN ('chess.deadlines', 'chess.notifications');
                DELETE FROM projection_dead_letters WHERE "GroupId" IN ('chess.deadlines', 'chess.notifications');
                """);

            migrationBuilder.DropTable(
                name: "game_deadlines");

            migrationBuilder.DropTable(
                name: "notification_games");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Recreates the two tables empty. The 7d games' read-side rows deleted in Up cannot come back.
            migrationBuilder.CreateTable(
                name: "game_deadlines",
                columns: table => new
                {
                    GameId = table.Column<Guid>(type: "uuid", nullable: false),
                    DueAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    LastSeq = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_game_deadlines", x => x.GameId);
                });

            migrationBuilder.CreateTable(
                name: "notification_games",
                columns: table => new
                {
                    GameId = table.Column<Guid>(type: "uuid", nullable: false),
                    BlackId = table.Column<long>(type: "bigint", nullable: false),
                    BlackName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    LastSeq = table.Column<long>(type: "bigint", nullable: false),
                    WhiteId = table.Column<long>(type: "bigint", nullable: false),
                    WhiteName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_notification_games", x => x.GameId);
                });

            migrationBuilder.CreateIndex(
                name: "IX_game_deadlines_DueAt",
                table: "game_deadlines",
                column: "DueAt");
        }
    }
}
