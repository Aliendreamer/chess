using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Chess.Backend.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddStudies : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "studies",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerId = table.Column<long>(type: "bigint", nullable: false),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    StartFen = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Tree = table.Column<string>(type: "jsonb", nullable: false),
                    White = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    Black = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    Result = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: true),
                    Date = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    Shared = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_studies", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_studies_OwnerId_CreatedAt_Id",
                table: "studies",
                columns: new[] { "OwnerId", "CreatedAt", "Id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "studies");
        }
    }
}
