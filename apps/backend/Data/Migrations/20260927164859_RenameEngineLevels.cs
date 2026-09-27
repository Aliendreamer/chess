using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Chess.Backend.Data.Migrations
{
    /// <inheritdoc />
    public partial class RenameEngineLevels : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.UpdateData(
                table: "users",
                keyColumn: "Id",
                keyValue: -5L,
                column: "Username",
                value: "Stockfish (Maximum)");

            migrationBuilder.UpdateData(
                table: "users",
                keyColumn: "Id",
                keyValue: -4L,
                column: "Username",
                value: "Stockfish (Master)");

            migrationBuilder.UpdateData(
                table: "users",
                keyColumn: "Id",
                keyValue: -3L,
                column: "Username",
                value: "Stockfish (Expert)");

            migrationBuilder.UpdateData(
                table: "users",
                keyColumn: "Id",
                keyValue: -2L,
                column: "Username",
                value: "Stockfish (Club)");

            migrationBuilder.UpdateData(
                table: "users",
                keyColumn: "Id",
                keyValue: -1L,
                column: "Username",
                value: "Stockfish (Casual)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.UpdateData(
                table: "users",
                keyColumn: "Id",
                keyValue: -5L,
                column: "Username",
                value: "Stockfish");

            migrationBuilder.UpdateData(
                table: "users",
                keyColumn: "Id",
                keyValue: -4L,
                column: "Username",
                value: "Stockfish 2400");

            migrationBuilder.UpdateData(
                table: "users",
                keyColumn: "Id",
                keyValue: -3L,
                column: "Username",
                value: "Stockfish 2000");

            migrationBuilder.UpdateData(
                table: "users",
                keyColumn: "Id",
                keyValue: -2L,
                column: "Username",
                value: "Stockfish 1600");

            migrationBuilder.UpdateData(
                table: "users",
                keyColumn: "Id",
                keyValue: -1L,
                column: "Username",
                value: "Stockfish 1320");
        }
    }
}
