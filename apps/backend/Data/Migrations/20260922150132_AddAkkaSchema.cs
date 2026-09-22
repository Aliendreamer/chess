using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Chess.Backend.Data.Migrations
{
    /// <summary>
    /// Creates the schema Akka.Persistence.Sql journals into. Its <c>autoInitialize</c> creates the tables
    /// but NOT the schema, so on a fresh database every node failed with
    /// <c>3F000: schema "akka" does not exist</c> and the ActorSystem never came up. No EF entity lives
    /// here — the schema is owned by Akka; this migration only guarantees it exists first, which works
    /// because Program.cs migrates before the host (and therefore the Akka hosted service) starts.
    /// </summary>
    public partial class AddAkkaSchema : Migration
    {
        private const string Schema = "akka";

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(name: Schema);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Left in place on purpose: dropping it would take Akka's journal and snapshots with it.
        }
    }
}
