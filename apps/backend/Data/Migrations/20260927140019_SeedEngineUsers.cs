using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Chess.Backend.Data.Migrations
{
    /// <inheritdoc />
    public partial class SeedEngineUsers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "users",
                columns: new[] { "Id", "CreatedAt", "Email", "FullName", "Sub", "UpdatedAt", "Username", "Version" },
                values: new object[,]
                {
                    { -5L, new DateTimeOffset(new DateTime(2026, 9, 27, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, null, "engine:max", new DateTimeOffset(new DateTime(2026, 9, 27, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "Stockfish", 0L },
                    { -4L, new DateTimeOffset(new DateTime(2026, 9, 27, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, null, "engine:2400", new DateTimeOffset(new DateTime(2026, 9, 27, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "Stockfish 2400", 0L },
                    { -3L, new DateTimeOffset(new DateTime(2026, 9, 27, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, null, "engine:2000", new DateTimeOffset(new DateTime(2026, 9, 27, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "Stockfish 2000", 0L },
                    { -2L, new DateTimeOffset(new DateTime(2026, 9, 27, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, null, "engine:1600", new DateTimeOffset(new DateTime(2026, 9, 27, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "Stockfish 1600", 0L },
                    { -1L, new DateTimeOffset(new DateTime(2026, 9, 27, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, null, "engine:1320", new DateTimeOffset(new DateTime(2026, 9, 27, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "Stockfish 1320", 0L }
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "users",
                keyColumn: "Id",
                keyValue: -5L);

            migrationBuilder.DeleteData(
                table: "users",
                keyColumn: "Id",
                keyValue: -4L);

            migrationBuilder.DeleteData(
                table: "users",
                keyColumn: "Id",
                keyValue: -3L);

            migrationBuilder.DeleteData(
                table: "users",
                keyColumn: "Id",
                keyValue: -2L);

            migrationBuilder.DeleteData(
                table: "users",
                keyColumn: "Id",
                keyValue: -1L);
        }
    }
}
