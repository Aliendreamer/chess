using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Chess.Backend.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddGameReview : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "game_reviews",
                columns: table => new
                {
                    GameId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequestedBy = table.Column<long>(type: "bigint", nullable: false),
                    RequestedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_game_reviews", x => x.GameId);
                });

            migrationBuilder.CreateTable(
                name: "mistake_drills",
                columns: table => new
                {
                    UserId = table.Column<long>(type: "bigint", nullable: false),
                    GameId = table.Column<Guid>(type: "uuid", nullable: false),
                    Ply = table.Column<int>(type: "integer", nullable: false),
                    Fen = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    PlayedUci = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: false),
                    PlayedSan = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    AcceptedUci = table.Column<List<string>>(type: "text[]", nullable: false),
                    BestLine = table.Column<List<string>>(type: "text[]", nullable: false),
                    Class = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    Box = table.Column<int>(type: "integer", nullable: false),
                    DueAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_mistake_drills", x => new { x.UserId, x.GameId, x.Ply });
                });

            migrationBuilder.CreateIndex(
                name: "IX_mistake_drills_UserId_DueAt",
                table: "mistake_drills",
                columns: new[] { "UserId", "DueAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "game_reviews");

            migrationBuilder.DropTable(
                name: "mistake_drills");
        }
    }
}
