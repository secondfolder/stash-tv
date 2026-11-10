import { it } from "vitest";
import { checkOperationsLog } from "./test/conformance/operations-coverage";

/**
 * Fails if any operation in an operations log (`MOCK_STASH_OPERATIONS_LOG`) has no conformance case. For test runners
 * that can't load the app's GraphQL documents themselves (Playwright compiles tv-ui's E2E tests as CommonJS):
 *
 *   MOCK_STASH_OPERATIONS_LOG=<log> yarn --cwd packages/mock-stash check-operations
 *
 * Runs through Vitest, which loads them as the other tests do (see vitest.check-operations.config.ts).
 *
 * @see docs/testing-mock-stash.md § "Coverage"
 */
it("has a conformance case for every operation the tests sent mock-stash", () => {
  const file = process.env.MOCK_STASH_OPERATIONS_LOG;
  if (!file) throw new Error("MOCK_STASH_OPERATIONS_LOG should name the operations log to check");
  checkOperationsLog(file);
});
