// @ts-check
import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
  {
    ignores: ['dist/**', 'coverage/**', 'src-tauri/**', 'src/routeTree.gen.ts', 'eslint.config.js'],
  },
]
