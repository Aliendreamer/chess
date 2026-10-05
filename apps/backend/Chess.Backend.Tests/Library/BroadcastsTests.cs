using System.Buffers.Binary;
using System.Text;
using Chess.Backend.Library;
using ZstdSharp;

namespace Chess.Backend.Tests.Library;

/// <summary>Lichess broadcast files (broadcast-explorer D2): pzstd's layout, a skippable frame then several zstd frames.</summary>
public sealed class BroadcastFileTests
{
    private const string FirstHalf = "[Event \"Synthetic\"]\n[White \"A\"]\n[Black \"B\"]\n[Result \"1-0\"]\n\n1. e4 e5 1-0\n\n";
    private const string SecondHalf = "[Event \"Synthetic\"]\n[White \"C\"]\n[Black \"D\"]\n[Result \"0-1\"]\n\n1. d4 d5 0-1\n";

    /// <summary>A skippable frame (magic 0x184D2A50, size, payload) as pzstd writes ahead of each frame, then a zstd frame.</summary>
    private static byte[] PzstdFrame(string text)
    {
        byte[] skippable = new byte[12];
        BinaryPrimitives.WriteUInt32LittleEndian(skippable, 0x184D2A50);
        BinaryPrimitives.WriteUInt32LittleEndian(skippable.AsSpan(4), 4);
        BinaryPrimitives.WriteUInt32LittleEndian(skippable.AsSpan(8), 1234);
        using Compressor compressor = new(3);
        return [.. skippable, .. compressor.Wrap(Encoding.UTF8.GetBytes(text)).ToArray()];
    }

    [Fact]
    public async Task A_multi_frame_file_decodes_to_the_whole_text()
    {
        using MemoryStream file = new([.. PzstdFrame(FirstHalf), .. PzstdFrame(SecondHalf)]);

        using TextReader reader = BroadcastFile.Open(file);

        Assert.Equal(FirstHalf + SecondHalf, await reader.ReadToEndAsync());
    }
}

/// <summary>Which broadcast games the library keeps (broadcast-explorer D4), at the default settings.</summary>
public sealed class BroadcastFilterTests
{
    private static readonly LibraryBroadcastsOptions Defaults = new();

    private static Dictionary<string, string> Headers(string? whiteElo = "2450", string? blackElo = "2500", string? tc = null, string? variant = "Standard", string result = "1-0", string? fen = null)
    {
        Dictionary<string, string> h = new(StringComparer.Ordinal) { ["White"] = "A", ["Black"] = "B", ["Result"] = result };
        void Set(string key, string? value)
        {
            if (value is not null)
            {
                h[key] = value;
            }
        }

        Set("WhiteElo", whiteElo);
        Set("BlackElo", blackElo);
        Set("TimeControl", tc);
        Set("Variant", variant);
        Set("FEN", fen);
        return h;
    }

    [Theory]
    [InlineData("2450", "2500", true)]
    [InlineData("2450", "2310", false)]
    [InlineData(null, "2500", false)]
    [InlineData("2400", "2400", true)]
    [InlineData("?", "2500", false)]
    public void Both_players_must_be_rated_at_least_the_minimum(string? white, string? black, bool kept) =>
        Assert.Equal(kept, BroadcastFilter.Keeps(Headers(whiteElo: white, blackElo: black), Defaults));

    [Theory]
    [InlineData("3+2", false)]
    [InlineData("5+0", false)]
    [InlineData("1+0", false)]
    [InlineData("180+2", false)] // seconds: 3 minutes
    [InlineData("90+30", true)]
    [InlineData("15+10", true)]
    [InlineData("10'+5", true)]
    [InlineData("90min/40moves + 30min + 30sec/move", true)]
    [InlineData("1:30:30", true)]
    [InlineData("5400+30", true)]
    [InlineData("600", true)]
    [InlineData(null, true)] // unknown is kept
    [InlineData("rapid", true)]
    public void Blitz_and_bullet_are_dropped_and_unknown_time_controls_kept(string? tc, bool kept) =>
        Assert.Equal(kept, BroadcastFilter.Keeps(Headers(tc: tc), Defaults));

    [Fact]
    public void Fast_games_are_kept_when_the_setting_allows()
    {
        Assert.True(BroadcastFilter.Keeps(Headers(tc: "3+2"), new LibraryBroadcastsOptions { ExcludeFast = false }));
    }

    [Fact]
    public void Only_finished_standard_games_from_the_start()
    {
        Assert.False(BroadcastFilter.Keeps(Headers(variant: "Chess960"), Defaults));
        Assert.True(BroadcastFilter.Keeps(Headers(variant: null), Defaults));
        Assert.False(BroadcastFilter.Keeps(Headers(fen: "8/8/8/8/8/8/k7/4K3 w - - 0 1"), Defaults));
        Assert.False(BroadcastFilter.Keeps(Headers(result: "*"), Defaults));
    }

    [Fact]
    public void A_kept_game_is_named_by_its_tournament_and_links_to_lichess()
    {
        Dictionary<string, string> h = Headers();
        h["Event"] = "Round 6: A - B";
        h["BroadcastName"] = "Xtracon Open 2026";
        h["Round"] = "6.12";
        h["Date"] = "2026.08.01";
        h["ECO"] = "B90";
        h["GameURL"] = "https://lichess.org/broadcast/x/round-6/abc/def";

        ImportGame game = BroadcastFilter.ToImport(new PgnGame(1, h, ["e4"]), ["e2e4"]);

        Assert.Equal(
            ("A", "B", "Xtracon Open 2026", "6.12", "2026.08.01", "1-0", "B90", "https://lichess.org/broadcast/x/round-6/abc/def"),
            (game.White, game.Black, game.Event, game.Round, game.Date, game.Result, game.Eco, game.SourceRef));
        Assert.Equal(["e2e4"], game.Moves);
    }
}

public sealed class LichessUrlTests
{
    [Theory]
    [InlineData("https://lichess.org/broadcast/x/r/abc", "https://lichess.org/broadcast/x/r/abc")]
    [InlineData("javascript:alert(1)", null)]
    [InlineData("http://lichess.org/x", null)]
    [InlineData("https://lichess.org.evil.example/x", null)]
    [InlineData(null, null)]
    public void Only_https_lichess_pages_are_kept(string? url, string? kept) =>
        Assert.Equal(kept, BroadcastFilter.LichessUrl(url));
}
