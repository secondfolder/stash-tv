import stashVersions from "../../stash-ui/stash-versions.json" with { type: "json" };

/**
 * The Stash versions Stash TV is tested against, from `packages/stash-ui/stash-versions.json`
 * (see docs/stash-compatibility.md):
 * - `develop`: the commit on Stash's develop branch that stash-ui is built from. Supported on a best-effort basis.
 * - `latest-release` and `previous-release`: the two latest Stash releases, which are supported.
 *
 * Named by role rather than by tag, so test projects and CI jobs keep their names from one release to the next.
 *
 * Kept free of the server's code: test configs import it to work out which versions to test.
 */
export type StashVersion = keyof typeof stashVersions;

export type StashVersionDetails = {
  /** The commit the version is built from */
  commit: string;
  /** What Stash reports as its version (its `version` query): the release's tag, or `git describe` for develop */
  version: string;
  /** The Docker image of this version, for the tests against a real Stash */
  image: string;
  /** The release's git tag (releases only) */
  tag?: string;
};

/** Every version in the file, in its order (develop first) */
export const STASH_VERSIONS = Object.keys(stashVersions) as readonly StashVersion[];

export function stashVersionDetails(version: StashVersion): StashVersionDetails {
  const details: { commit: string, image: string, tag?: string, version?: string } = stashVersions[version];
  const reported = details.version ?? details.tag;
  if (!reported) throw new Error(`stash-versions.json gives ${version} neither a version nor a tag`);
  return { ...details, version: reported };
}

/**
 * The versions to test: the releases, and develop unless its commit is one of theirs (then a release's tests cover it)
 */
export function testedStashVersions(versions: Record<StashVersion, { commit: string }> = stashVersions): StashVersion[] {
  const releases = STASH_VERSIONS.filter((version) => version !== "develop");
  const developIsARelease = releases.some((release) => versions[release].commit === versions.develop.commit);
  return developIsARelease ? releases : [...STASH_VERSIONS];
}

function isStashVersion(value: string): value is StashVersion {
  return (STASH_VERSIONS as readonly string[]).includes(value);
}

/**
 * The version a test run is for, from `MOCK_STASH_VERSION` (which the test projects set). Without it, the first tested
 * version: develop, or the latest release when develop is one of the releases. An unknown value throws rather than
 * quietly testing another version.
 */
export function stashVersionFromEnv(env: Record<string, string | undefined> = process.env): StashVersion {
  const value = env.MOCK_STASH_VERSION;
  if (value === undefined || value === "") return testedStashVersions()[0];
  if (!isStashVersion(value)) {
    throw new Error(`Unknown MOCK_STASH_VERSION "${value}": expected one of ${STASH_VERSIONS.join(", ")}`);
  }
  return value;
}
