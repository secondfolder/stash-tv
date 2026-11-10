import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { STASH_VERSIONS } from "../../mock-stash/src/stash-versions";

/**
 * CI runs each Stash version's tests in jobs of their own, listing the versions in each job's matrix, so jobs can start
 * at once rather than waiting for a job to work them out. Those lists must keep up with
 * packages/stash-ui/stash-versions.json.
 *
 * @see docs/stash-compatibility.md § "Tests"
 */

const repoRoot = path.resolve(__dirname, "../../..");
const workflow = fs.readFileSync(path.join(repoRoot, ".github/workflows/verify-and-publish-if-needed.yml"), "utf-8");

/** Each job's matrix of Stash versions, by job */
const versionMatrices = new Map(
  [...workflow.matchAll(/^ {2}([a-z0-9-]+):\n(?:(?! {2}[a-z0-9-]+:\n).*\n)*? {8}version: \[([^\]]*)\]/gm)]
    .map((match) => [match[1], match[2].split(",").map((version) => version.trim())]),
);

describe("CI's jobs for each Stash version", () => {
  it("are found", () => {
    expect([...versionMatrices.keys()].sort()).toEqual(["conformance", "e2e", "integration", "plugin"]);
  });

  it("cover every version in stash-versions.json", () => {
    for (const job of ["integration", "conformance", "plugin"]) {
      expect(versionMatrices.get(job), job).toEqual([...STASH_VERSIONS]);
    }
  });

  it("run the E2E tests against every release, and not develop", () => {
    expect(versionMatrices.get("e2e")).toEqual(STASH_VERSIONS.filter((version) => version !== "develop"));
  });
});
