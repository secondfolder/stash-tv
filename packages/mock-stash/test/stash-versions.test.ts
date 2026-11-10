import { describe, expect, it } from "vitest";
import { STASH_VERSIONS, stashVersionDetails, stashVersionFromEnv, testedStashVersions } from "../src/stash-versions";

/**
 * Which Stash versions the tests run against, from packages/stash-ui/stash-versions.json.
 *
 * @see docs/stash-compatibility.md § "Supported versions"
 */

const commits = (develop: string) => ({
  develop: { commit: develop },
  "latest-release": { commit: "latest" },
  "previous-release": { commit: "previous" },
});

describe("testedStashVersions", () => {
  it("tests develop as well as the releases while its commit isn't one of theirs", () => {
    expect(testedStashVersions(commits("develop-head"))).toEqual(["develop", "latest-release", "previous-release"]);
  });

  it("leaves develop out when its commit is a release's, which that release's tests cover", () => {
    expect(testedStashVersions(commits("latest"))).toEqual(["latest-release", "previous-release"]);
    expect(testedStashVersions(commits("previous"))).toEqual(["latest-release", "previous-release"]);
  });
});

describe("stashVersionFromEnv", () => {
  it("takes the version a test project names", () => {
    expect(stashVersionFromEnv({ MOCK_STASH_VERSION: "previous-release" })).toBe("previous-release");
  });

  it("defaults to the first version tested", () => {
    expect(stashVersionFromEnv({})).toBe(testedStashVersions()[0]);
  });

  it("rejects a version it doesn't know, rather than testing another", () => {
    expect(() => stashVersionFromEnv({ MOCK_STASH_VERSION: "latest-stable-release" })).toThrow(/Unknown MOCK_STASH_VERSION/);
  });
});

describe("stash-versions.json", () => {
  it("gives every version a commit, an image and the version that Stash reports", () => {
    for (const version of STASH_VERSIONS) {
      const details = stashVersionDetails(version);
      expect(details.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(details.image).toMatch(/^stashapp\/stash:/);
      expect(details.version).toMatch(/^v\d+\.\d+\.\d+/);
    }
  });

  it("pins develop's image by digest, as its tag moves", () => {
    expect(stashVersionDetails("develop").image).toMatch(/@sha256:[0-9a-f]{64}$/);
  });
});
