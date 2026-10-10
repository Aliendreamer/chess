using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Chess.Backend.Data.Migrations
{
    /// <inheritdoc />
    public partial class TrainingSessions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "training_candidates",
                columns: table => new
                {
                    PositionKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Fen = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    LibraryGameId = table.Column<Guid>(type: "uuid", nullable: false),
                    Ply = table.Column<int>(type: "integer", nullable: false),
                    MasterUci = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: false),
                    Status = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    RequestedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    JudgedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_training_candidates", x => x.PositionKey);
                    table.ForeignKey(
                        name: "FK_training_candidates_library_games_LibraryGameId",
                        column: x => x.LibraryGameId,
                        principalTable: "library_games",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "training_positions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PositionKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Fen = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    SideToMove = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: false),
                    LibraryGameId = table.Column<Guid>(type: "uuid", nullable: false),
                    Ply = table.Column<int>(type: "integer", nullable: false),
                    MasterUci = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: false),
                    AcceptedUci = table.Column<List<string>>(type: "text[]", nullable: false),
                    BestLine = table.Column<List<string>>(type: "text[]", nullable: false),
                    Gap = table.Column<float>(type: "real", nullable: false),
                    Eco = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: true),
                    OpeningName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    Phase = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    White = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Black = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Event = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    Year = table.Column<int>(type: "integer", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_training_positions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_training_positions_library_games_LibraryGameId",
                        column: x => x.LibraryGameId,
                        principalTable: "library_games",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "training_synced",
                columns: table => new
                {
                    UserId = table.Column<long>(type: "bigint", nullable: false),
                    GameId = table.Column<Guid>(type: "uuid", nullable: false),
                    SyncedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_training_synced", x => new { x.UserId, x.GameId });
                });

            migrationBuilder.CreateTable(
                name: "training_progress",
                columns: table => new
                {
                    UserId = table.Column<long>(type: "bigint", nullable: false),
                    PositionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Box = table.Column<int>(type: "integer", nullable: false),
                    DueAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_training_progress", x => new { x.UserId, x.PositionId });
                    table.ForeignKey(
                        name: "FK_training_progress_training_positions_PositionId",
                        column: x => x.PositionId,
                        principalTable: "training_positions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_training_candidates_LibraryGameId",
                table: "training_candidates",
                column: "LibraryGameId");

            migrationBuilder.CreateIndex(
                name: "IX_training_candidates_Status",
                table: "training_candidates",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_training_positions_Black",
                table: "training_positions",
                column: "Black")
                .Annotation("Npgsql:IndexMethod", "gin")
                .Annotation("Npgsql:IndexOperators", new[] { "gin_trgm_ops" });

            migrationBuilder.CreateIndex(
                name: "IX_training_positions_Eco",
                table: "training_positions",
                column: "Eco");

            migrationBuilder.CreateIndex(
                name: "IX_training_positions_LibraryGameId",
                table: "training_positions",
                column: "LibraryGameId");

            migrationBuilder.CreateIndex(
                name: "IX_training_positions_OpeningName",
                table: "training_positions",
                column: "OpeningName")
                .Annotation("Npgsql:IndexMethod", "gin")
                .Annotation("Npgsql:IndexOperators", new[] { "gin_trgm_ops" });

            migrationBuilder.CreateIndex(
                name: "IX_training_positions_Phase",
                table: "training_positions",
                column: "Phase");

            migrationBuilder.CreateIndex(
                name: "IX_training_positions_PositionKey",
                table: "training_positions",
                column: "PositionKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_training_positions_White",
                table: "training_positions",
                column: "White")
                .Annotation("Npgsql:IndexMethod", "gin")
                .Annotation("Npgsql:IndexOperators", new[] { "gin_trgm_ops" });

            migrationBuilder.CreateIndex(
                name: "IX_training_positions_Year",
                table: "training_positions",
                column: "Year");

            migrationBuilder.CreateIndex(
                name: "IX_training_progress_PositionId",
                table: "training_progress",
                column: "PositionId");

            migrationBuilder.CreateIndex(
                name: "IX_training_progress_UserId_DueAt",
                table: "training_progress",
                columns: new[] { "UserId", "DueAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "training_candidates");

            migrationBuilder.DropTable(
                name: "training_progress");

            migrationBuilder.DropTable(
                name: "training_synced");

            migrationBuilder.DropTable(
                name: "training_positions");
        }
    }
}
