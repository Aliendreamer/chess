using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Chess.Backend.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddUserPreferences : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Preferences",
                table: "users",
                type: "jsonb",
                nullable: true);

            migrationBuilder.UpdateData(
                table: "users",
                keyColumn: "Id",
                keyValue: -5L,
                column: "Preferences",
                value: null);

            migrationBuilder.UpdateData(
                table: "users",
                keyColumn: "Id",
                keyValue: -4L,
                column: "Preferences",
                value: null);

            migrationBuilder.UpdateData(
                table: "users",
                keyColumn: "Id",
                keyValue: -3L,
                column: "Preferences",
                value: null);

            migrationBuilder.UpdateData(
                table: "users",
                keyColumn: "Id",
                keyValue: -2L,
                column: "Preferences",
                value: null);

            migrationBuilder.UpdateData(
                table: "users",
                keyColumn: "Id",
                keyValue: -1L,
                column: "Preferences",
                value: null);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Preferences",
                table: "users");
        }
    }
}
