namespace Chess.Backend.WebApi.Admin;

/// <summary>A new temporary password, shown once; the member must change it at their next sign-in.</summary>
internal sealed record ResetMemberPasswordResponse(string TemporaryPassword);
