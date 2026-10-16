// @ts-check
import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
  { ignores: ['coverage/**', 'eslint.config.js'] },
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@tanstack/react-router',
                '@tanstack/react-start',
                '@tanstack/react-start/*',
                '@tauri-apps/*',
              ],
              message:
                '@chess/ui is presentational: navigation comes from LinkContext, data from props; no router, server function or Tauri (shared-chess-libraries).',
            },
          ],
        },
      ],
    },
  },
]
