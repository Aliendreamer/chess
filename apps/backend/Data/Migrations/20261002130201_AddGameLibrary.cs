using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Chess.Backend.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddGameLibrary : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:PostgresExtension:pg_trgm", ",,");

            migrationBuilder.CreateTable(
                name: "library_games",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    White = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Black = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Event = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    Site = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    Round = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    DateText = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    Year = table.Column<int>(type: "integer", nullable: true),
                    Result = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: false),
                    Eco = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: true),
                    OpeningName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    WorldChampionship = table.Column<bool>(type: "boolean", nullable: false),
                    MovesUci = table.Column<List<string>>(type: "text[]", nullable: false),
                    Ply = table.Column<int>(type: "integer", nullable: false),
                    Source = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Licence = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    SourceRef = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    DedupeKey = table.Column<string>(type: "character varying(600)", maxLength: 600, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_library_games", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "openings",
                columns: table => new
                {
                    PositionKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Eco = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    Name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Ply = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_openings", x => x.PositionKey);
                });

            migrationBuilder.CreateTable(
                name: "library_positions",
                columns: table => new
                {
                    PositionKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    GameId = table.Column<Guid>(type: "uuid", nullable: false),
                    Ply = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_library_positions", x => new { x.PositionKey, x.GameId, x.Ply });
                    table.ForeignKey(
                        name: "FK_library_positions_library_games_GameId",
                        column: x => x.GameId,
                        principalTable: "library_games",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_library_games_Black",
                table: "library_games",
                column: "Black")
                .Annotation("Npgsql:IndexMethod", "gin")
                .Annotation("Npgsql:IndexOperators", new[] { "gin_trgm_ops" });

            migrationBuilder.CreateIndex(
                name: "IX_library_games_DedupeKey",
                table: "library_games",
                column: "DedupeKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_library_games_Eco",
                table: "library_games",
                column: "Eco");

            migrationBuilder.CreateIndex(
                name: "IX_library_games_Event",
                table: "library_games",
                column: "Event")
                .Annotation("Npgsql:IndexMethod", "gin")
                .Annotation("Npgsql:IndexOperators", new[] { "gin_trgm_ops" });

            migrationBuilder.CreateIndex(
                name: "IX_library_games_White",
                table: "library_games",
                column: "White")
                .Annotation("Npgsql:IndexMethod", "gin")
                .Annotation("Npgsql:IndexOperators", new[] { "gin_trgm_ops" });

            migrationBuilder.CreateIndex(
                name: "IX_library_games_Year_Id",
                table: "library_games",
                columns: new[] { "Year", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_library_positions_GameId",
                table: "library_positions",
                column: "GameId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "library_positions");

            migrationBuilder.DropTable(
                name: "openings");

            migrationBuilder.DropTable(
                name: "library_games");

            migrationBuilder.AlterDatabase()
                .OldAnnotation("Npgsql:PostgresExtension:pg_trgm", ",,");
        }
    }
}
