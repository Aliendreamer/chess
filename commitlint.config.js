export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Subject stays lower-case (carried from the frontend config).
    "subject-case": [2, "always", "lower-case"],
    // A project scope is REQUIRED, drawn from the allowed set, so Nx Release can
    // attribute each commit to the right project's version and changelog.
    "scope-empty": [2, "never"],
    "scope-enum": [
      2,
      "always",
      ["frontend", "backend", "repo", "deps", "proxy", "ci", "release"],
    ],
  },
};
