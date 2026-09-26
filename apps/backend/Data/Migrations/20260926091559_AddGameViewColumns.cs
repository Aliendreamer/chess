using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Chess.Backend.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddGameViewColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "BlackMs",
                table: "rm_games",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AddColumn<string>(
                name: "LastSan",
                table: "rm_games",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LastUci",
                table: "rm_games",
                type: "character varying(5)",
                maxLength: 5,
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "WhiteMs",
                table: "rm_games",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BlackMs",
                table: "rm_games");

            migrationBuilder.DropColumn(
                name: "LastSan",
                table: "rm_games");

            migrationBuilder.DropColumn(
                name: "LastUci",
                table: "rm_games");

            migrationBuilder.DropColumn(
                name: "WhiteMs",
                table: "rm_games");
        }
    }
}
