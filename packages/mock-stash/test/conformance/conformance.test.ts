import { afterAll, beforeAll, describe, it } from "vitest";
import { startMockStash, type MockStashServer } from "../../src/server";
import { stashVersionFromEnv } from "../../src/stash-versions";
import { canRunRealStash, startRealStash, type RealStash } from "../../src/real-stash";
import { seedRealStash } from "../../src/seed-real-stash";
import { Session } from "./session";
import { CASES } from "./cases";

/**
 * Conformance: the mock Stash API must behave like the real one for everything it implements. A real Stash of the
 * project's version (`vitest.conformance.config.ts`) is seeded with the mock's fixtures, then each case in `cases.ts`
 * runs on both, in order, and their responses must match (see `session.ts` for what's normalised first).
 *
 * If these fail after a Stash upgrade, the mock's resolvers have drifted from real behaviour and must be updated.
 *
 * @see docs/testing-mock-stash.md § "Conformance"
 */

const dockerAvailable = await canRunRealStash();
const stashVersion = stashVersionFromEnv();

let mock: MockStashServer;
let real: RealStash;
let session: Session;

beforeAll(async () => {
  if (!dockerAvailable) return;
  [mock, real] = await Promise.all([startMockStash({ stashVersion }), startRealStash(stashVersion)]);
  const ids = await seedRealStash(real);
  session = new Session(
    stashVersion,
    { side: "mock", httpUrl: mock.httpUrl, wsUrl: mock.wsUrl, baseUrl: mock.url },
    { side: "real", httpUrl: real.graphqlUrl, wsUrl: real.graphqlUrl.replace(/^http/, "ws"), baseUrl: real.url },
    ids,
  );
}, 300_000);

afterAll(async () => {
  await real?.stop();
  await mock?.stop();
});

// In order: later cases rely on what earlier ones leave
describe.skipIf(!dockerAvailable).sequential("conformance", () => {
  for (const testCase of CASES) {
    it(`${testCase.group} › ${testCase.name}`, async () => {
      await session.run(testCase);
    });
  }
});
