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
                'react-native',
                'react-native/*',
                'expo',
                'expo-*',
                '@chess/ui',
                '@chess/view',
                '*?raw',
                '*?url',
              ],
              message:
                '@chess/local reaches the platform only through its interfaces: no React, DOM, router, Tauri, React Native, Expo or bundler-only imports (shared-chess-libraries).',
            },
          ],
        },
      ],
    },
  },
]
