import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['test/unit/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'dist'],
  },
});
