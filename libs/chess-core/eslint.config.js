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
                'react',
                'react-dom',
                'react/*',
                'react-dom/*',
                '@tauri-apps/*',
                '@tanstack/*',
                'react-chessboard',
                'lucide-react',
              ],
              message:
                '@chess/core is pure TypeScript: no React, DOM, router, Tauri or server code (shared-chess-libraries).',
            },
          ],
        },
      ],
    },
  },
]
