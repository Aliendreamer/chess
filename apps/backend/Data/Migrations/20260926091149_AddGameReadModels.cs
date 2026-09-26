using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Chess.Backend.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddGameReadModels : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "rm_game_players",
                columns: table => new
                {
                    UserId = table.Column<long>(type: "bigint", nullable: false),
                    GameId = table.Column<Guid>(type: "uuid", nullable: false),
                    Color = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    OpponentId = table.Column<long>(type: "bigint", nullable: false),
                    OpponentName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_rm_game_players", x => new { x.UserId, x.GameId });
                });

            migrationBuilder.CreateTable(
                name: "rm_games",
                columns: table => new
                {
                    GameId = table.Column<Guid>(type: "uuid", nullable: false),
                    WhiteId = table.Column<long>(type: "bigint", nullable: false),
                    WhiteName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    BlackId = table.Column<long>(type: "bigint", nullable: false),
                    BlackName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    TimeControl = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Result = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: true),
                    Reason = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    Ply = table.Column<int>(type: "integer", nullable: false),
                    LastFen = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    EndedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    LastSeq = table.Column<long>(type: "bigint", nullable: false),
                    Pgn = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_rm_games", x => x.GameId);
                });

            migrationBuilder.CreateTable(
                name: "rm_moves",
                columns: table => new
                {
                    GameId = table.Column<Guid>(type: "uuid", nullable: false),
                    Ply = table.Column<int>(type: "integer", nullable: false),
                    Uci = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: false),
                    San = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    FenAfter = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    WhiteMs = table.Column<long>(type: "bigint", nullable: false),
                    BlackMs = table.Column<long>(type: "bigint", nullable: false),
                    At = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_rm_moves", x => new { x.GameId, x.Ply });
                });

            migrationBuilder.CreateIndex(
                name: "IX_rm_game_players_UserId_CreatedAt_GameId",
                table: "rm_game_players",
                columns: new[] { "UserId", "CreatedAt", "GameId" });

            migrationBuilder.CreateIndex(
                name: "IX_rm_games_Status_UpdatedAt_GameId",
                table: "rm_games",
                columns: new[] { "Status", "UpdatedAt", "GameId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "rm_game_players");

            migrationBuilder.DropTable(
                name: "rm_games");

            migrationBuilder.DropTable(
                name: "rm_moves");
        }
    }
}
