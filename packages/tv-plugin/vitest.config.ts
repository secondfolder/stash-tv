import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    // Suppress console logs unless the test fails
    silent: 'passed-only',
    include: ['test/unit/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'dist'],
  },
});
