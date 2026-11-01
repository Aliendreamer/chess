// https://docs.expo.dev/guides/using-eslint/ — formatting is Prettier's (`pnpm check`); eslint-config-prettier only
// turns off the rules that would fight it.
const { defineConfig } = require('eslint/config')
const expoConfig = require('eslint-config-expo/flat')
const eslintConfigPrettier = require('eslint-config-prettier/flat')
const globals = require('globals')

module.exports = defineConfig([
  expoConfig,
  eslintConfigPrettier,
  {
    ignores: [
      'dist/*',
      '.expo/*',
      'coverage/*',
      'android/*',
      'ios/*',
      'modules/stockfish/vendor/*',
    ],
  },
  // Repo scripts and config plugins run in Node (CommonJS), not the app.
  {
    files: ['scripts/**/*.js', 'plugins/**/*.js', 'metro.config.js', 'jest.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['scripts/**/*.test.js'],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
  },
])
