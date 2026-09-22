using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Chess.Backend.Data.Migrations
{
    /// <summary>
    /// The journal publisher's resume point. Seeded at the journal's current head so the first rollout does not
    /// re-publish events the actor already sent; on a fresh database the journal does not exist yet (Akka
    /// creates it after migrations run) and the seed is 0. The publisher refuses to start without a row.
    /// </summary>
    public partial class AddOutboxOffsets : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "outbox_offsets",
                columns: table => new
                {
                    StreamId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    LastOrdering = table.Column<long>(type: "bigint", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_outbox_offsets", x => x.StreamId);
                });

            // One row per topic tag. Frozen literal on purpose: a migration must not follow later renames.
            // Dynamic SQL because Postgres resolves relations at parse time: a plain subquery on akka.journal
            // fails on a fresh database even inside a CASE branch that is never taken.
            migrationBuilder.Sql("""
                DO $$
                DECLARE head bigint := 0;
                BEGIN
                  IF to_regclass('akka.journal') IS NOT NULL THEN
                    EXECUTE 'SELECT COALESCE(max(ordering), 0) FROM akka.journal' INTO head;
                  END IF;
                  INSERT INTO outbox_offsets ("StreamId", "LastOrdering", "UpdatedAt")
                  VALUES ('game.events', head, now());
                END $$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "outbox_offsets");
        }
    }
}
