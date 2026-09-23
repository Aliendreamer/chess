using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Chess.Backend.Data.Migrations
{
    /// <inheritdoc />
    public partial class RmPingsKeysetIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_rm_pings_UpdatedAt",
                table: "rm_pings");

            migrationBuilder.CreateIndex(
                name: "IX_rm_pings_UpdatedAt_PingId",
                table: "rm_pings",
                columns: new[] { "UpdatedAt", "PingId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_rm_pings_UpdatedAt_PingId",
                table: "rm_pings");

            migrationBuilder.CreateIndex(
                name: "IX_rm_pings_UpdatedAt",
                table: "rm_pings",
                column: "UpdatedAt");
        }
    }
}
