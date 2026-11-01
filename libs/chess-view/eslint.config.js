// @ts-check
import { tanstackConfig } from "@tanstack/eslint-config";

export default [
  ...tanstackConfig,
  { ignores: ["coverage/**", "eslint.config.js"] },
  // The main tsconfig leaves the tests out (it has no DOM lib); the test one covers every file.
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.test.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react-dom",
                "react-dom/*",
                "react-native",
                "react-native/*",
                "expo",
                "expo-*",
                "@tauri-apps/*",
                "@tanstack/*",
                "react-chessboard",
                "lucide-react",
                "@chess/ui",
              ],
              message:
                "@chess/view is React state with no DOM: no react-dom, React Native, router, Tauri or markup (shared-chess-libraries).",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        "window",
        "document",
        "navigator",
        "localStorage",
        "sessionStorage",
      ],
    },
  },
];
