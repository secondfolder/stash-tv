import { rmSync } from "node:fs";
import { checkOperationsLog } from "../../mock-stash/test/conformance/operations-coverage";

/**
 * Vitest global set-up: fails the run if the integration tests sent mock-stash an operation with no conformance case
 * (mock-stash logs them to `MOCK_STASH_OPERATIONS_LOG`, which vitest.config.ts sets), so nothing would check the mock
 * answers it as Stash does.
 *
 * @see docs/testing-mock-stash.md § "Coverage"
 */
export default function setup() {
  const file = process.env.MOCK_STASH_OPERATIONS_LOG;
  if (!file) return;
  rmSync(file, { force: true });
  return () => {
    try {
      checkOperationsLog(file);
    } finally {
      rmSync(file, { force: true });
    }
  };
}
