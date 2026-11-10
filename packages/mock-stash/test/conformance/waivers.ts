/**
 * Root fields mock-stash implements that have no conformance case, each with why. `conformance-coverage.test.ts` fails
 * on a resolver neither covered nor waived, and on a waiver that's no longer needed.
 *
 * @see docs/testing-mock-stash.md § "Coverage"
 */
export const WAIVERS: Record<string, string> = {};
