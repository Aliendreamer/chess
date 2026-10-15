using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Chess.Backend.Data.Migrations
{
    /// <inheritdoc />
    public partial class ClubMembers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Every member there is today stays active. Edited by hand: the model has no default (EF would then never
            // write false on insert), so only this migration fills the existing rows.
            migrationBuilder.AddColumn<bool>(
                name: "Active",
                table: "users",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastSeenAt",
                table: "users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.UpdateData(
                table: "users",
                keyColumn: "Id",
                keyValue: -5L,
                columns: new[] { "Active", "LastSeenAt" },
                values: new object[] { true, null });

            migrationBuilder.UpdateData(
                table: "users",
                keyColumn: "Id",
                keyValue: -4L,
                columns: new[] { "Active", "LastSeenAt" },
                values: new object[] { true, null });

            migrationBuilder.UpdateData(
                table: "users",
                keyColumn: "Id",
                keyValue: -3L,
                columns: new[] { "Active", "LastSeenAt" },
                values: new object[] { true, null });

            migrationBuilder.UpdateData(
                table: "users",
                keyColumn: "Id",
                keyValue: -2L,
                columns: new[] { "Active", "LastSeenAt" },
                values: new object[] { true, null });

            migrationBuilder.UpdateData(
                table: "users",
                keyColumn: "Id",
                keyValue: -1L,
                columns: new[] { "Active", "LastSeenAt" },
                values: new object[] { true, null });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Active",
                table: "users");

            migrationBuilder.DropColumn(
                name: "LastSeenAt",
                table: "users");
        }
    }
}
