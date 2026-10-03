using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Chess.Backend.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddOpeningTrainer : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<List<string>>(
                name: "MovesUci",
                table: "openings",
                type: "text[]",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "trainer_progress",
                columns: table => new
                {
                    UserId = table.Column<long>(type: "bigint", nullable: false),
                    LineKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Color = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: false),
                    Box = table.Column<int>(type: "integer", nullable: false),
                    DueAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    LastClean = table.Column<bool>(type: "boolean", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_trainer_progress", x => new { x.UserId, x.LineKey, x.Color });
                });

            migrationBuilder.CreateIndex(
                name: "IX_trainer_progress_UserId_Color_DueAt",
                table: "trainer_progress",
                columns: new[] { "UserId", "Color", "DueAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "trainer_progress");

            migrationBuilder.DropColumn(
                name: "MovesUci",
                table: "openings");
        }
    }
}
