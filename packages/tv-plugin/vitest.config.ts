import { defineConfig, type Plugin } from 'vitest/config';
import svgr from 'vite-plugin-svgr';

export default defineConfig({
  // Match the plugin build: `*.svg?react` imports are React components. The
  // assertion is only for types: vite-plugin-svgr is typed against its own
  // nested copy of `vite`, whose plugin types don't match vitest's copy.
  plugins: [svgr() as Plugin],
  test: {
    globals: false,
    environment: 'node',
    // Suppress console logs unless the test fails
    silent: 'passed-only',
    include: ['test/unit/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'dist'],
  },
});
