import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    testTimeout: 60000,
    hookTimeout: 60000,
  },
})
