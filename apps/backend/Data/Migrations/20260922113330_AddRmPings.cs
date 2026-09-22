using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Chess.Backend.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddRmPings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "rm_pings",
                columns: table => new
                {
                    PingId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Count = table.Column<long>(type: "bigint", nullable: false),
                    LastText = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    LastAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    LastSeq = table.Column<long>(type: "bigint", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_rm_pings", x => x.PingId);
                });

            migrationBuilder.CreateIndex(
                name: "IX_rm_pings_UpdatedAt",
                table: "rm_pings",
                column: "UpdatedAt");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "rm_pings");
        }
    }
}
