import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

/**
 * Playwright global set-up: fails the run if the E2E tests sent mock-stash an operation with no conformance case
 * (mock-stash logs them to `MOCK_STASH_OPERATIONS_LOG`, which playwright.config.ts sets). The check runs in mock-stash
 * (`yarn check-operations`), as Playwright can't load the app's GraphQL documents into these CommonJS-compiled files.
 *
 * @see docs/testing-mock-stash.md § "Coverage"
 */
export default function setup() {
  const file = process.env.MOCK_STASH_OPERATIONS_LOG;
  if (!file) return;
  rmSync(file, { force: true });
  return () => {
    try {
      execFileSync("yarn", ["--silent", "--cwd", path.resolve(__dirname, "../../../mock-stash"), "check-operations"], {
        env: { ...process.env, MOCK_STASH_OPERATIONS_LOG: file },
        stdio: "inherit",
      });
    } finally {
      rmSync(file, { force: true });
    }
  };
}
