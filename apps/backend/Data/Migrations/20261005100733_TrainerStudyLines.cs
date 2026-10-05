using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Chess.Backend.Data.Migrations
{
    /// <inheritdoc />
    public partial class TrainerStudyLines : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "StudyId",
                table: "trainer_progress",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_trainer_progress_StudyId",
                table: "trainer_progress",
                column: "StudyId");

            migrationBuilder.CreateIndex(
                name: "IX_trainer_progress_UserId_StudyId_Color",
                table: "trainer_progress",
                columns: new[] { "UserId", "StudyId", "Color" });

            migrationBuilder.AddForeignKey(
                name: "FK_trainer_progress_studies_StudyId",
                table: "trainer_progress",
                column: "StudyId",
                principalTable: "studies",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_trainer_progress_studies_StudyId",
                table: "trainer_progress");

            migrationBuilder.DropIndex(
                name: "IX_trainer_progress_StudyId",
                table: "trainer_progress");

            migrationBuilder.DropIndex(
                name: "IX_trainer_progress_UserId_StudyId_Color",
                table: "trainer_progress");

            migrationBuilder.DropColumn(
                name: "StudyId",
                table: "trainer_progress");
        }
    }
}
