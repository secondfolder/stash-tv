/**
 * Prints the Stash versions the tests run against (`testedStashVersions()`) as JSON, for CI to tell whether a job's
 * version is tested before setting anything up. Runs on Node alone, which strips its types, so needs no install:
 *
 *   node packages/mock-stash/scripts/tested-stash-versions.ts
 */
// With its extension, as Node needs to run it without a bundler
import { testedStashVersions } from "../src/stash-versions.ts";

console.log(JSON.stringify(testedStashVersions()));
