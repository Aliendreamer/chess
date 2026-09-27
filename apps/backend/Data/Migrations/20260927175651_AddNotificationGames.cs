using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Chess.Backend.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddNotificationGames : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "notification_games",
                columns: table => new
                {
                    GameId = table.Column<Guid>(type: "uuid", nullable: false),
                    WhiteId = table.Column<long>(type: "bigint", nullable: false),
                    BlackId = table.Column<long>(type: "bigint", nullable: false),
                    WhiteName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    BlackName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    LastSeq = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_notification_games", x => x.GameId);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "notification_games");
        }
    }
}
