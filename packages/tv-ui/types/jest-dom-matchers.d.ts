/**
 * Bridge jest-dom v5's matcher declarations onto vitest's `Assertion`.
 *
 * Background: jest-dom 5.x only ships Jest-style type declarations (via
 * @types/testing-library__jest-dom). Vitest's `Assertion` extends
 * `jest.Matchers`, so the matchers typecheck — but only when the @types
 * package's global `jest` namespace augmentation is loaded, which tsc's CLI
 * auto-includes but the editor's TS server does not reliably pick up. Declaring
 * the matchers directly on `vitest`'s Assertion makes CLI and editor agree.
 */

/// <reference types="testing-library__jest-dom" />

import type { TestingLibraryMatchers } from "testing-library__jest-dom/matchers";

declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion<T> extends TestingLibraryMatchers<unknown, T> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining
    extends TestingLibraryMatchers<unknown, unknown> {}
}
