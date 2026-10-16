import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: false,
    // Until the first module moves in (desktop-app task 2.1 / 3.1).
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', 'src/index.ts'],
      thresholds: { lines: 75, statements: 75, functions: 75, branches: 70 },
      reporter: ['text-summary'],
    },
  },
})
