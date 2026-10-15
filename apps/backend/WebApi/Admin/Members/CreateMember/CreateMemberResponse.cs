namespace Chess.Backend.WebApi.Admin;

/// <summary>The new member and their temporary password, shown once (member-admin D3).</summary>
internal sealed record CreateMemberResponse(AdminMemberItem Member, string TemporaryPassword);
