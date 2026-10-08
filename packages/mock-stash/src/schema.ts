import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeExecutableSchema } from "@graphql-tools/schema";
import type { GraphQLSchema } from "graphql";
import { resolvers } from "./resolvers";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The mock server deliberately serves Stash's *own* GraphQL schema rather than a hand-written subset, so that it
 * stays structurally faithful to the real API. `test/conformance` compares responses against a real Stash instance to
 * keep the resolver *behaviour* faithful too.
 *
 * Stash TV supports two Stash versions (see docs/stash-compatibility.md), so it can serve either's schema:
 * - `"pinned"`: the one from the `stash` git submodule pinned in stash-ui, which Stash TV is built against
 * - `"latest-stable-release"`: the latest Stash release's, which stash-ui's setup.sh extracts to `release-schema/`
 */
export type MockStashVersion = "pinned" | "latest-stable-release";

const SCHEMA_DIRS: Record<MockStashVersion, string> = {
  pinned: path.resolve(here, "../../stash-ui/stash/graphql/schema"),
  "latest-stable-release": path.resolve(here, "../../stash-ui/release-schema"),
};

function readGraphqlFiles(dir: string): string {
  let contents = "";
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      contents += readGraphqlFiles(fullPath);
    } else if (entry.endsWith(".graphql")) {
      contents += `\n${readFileSync(fullPath, "utf-8")}`;
    }
  }
  return contents;
}

const typeDefs = new Map<MockStashVersion, string>();
export function loadStashTypeDefinitions(version: MockStashVersion = "pinned"): string {
  let versionTypeDefs = typeDefs.get(version);
  if (versionTypeDefs === undefined) {
    versionTypeDefs = readGraphqlFiles(SCHEMA_DIRS[version]);
    typeDefs.set(version, versionTypeDefs);
  }
  return versionTypeDefs;
}

const schemas = new Map<MockStashVersion, GraphQLSchema>();
/** The schema is context-driven (resolvers read everything from the per-server context),
 * so a single schema instance per version can safely be shared by every server. */
export function getStashSchema(version: MockStashVersion = "pinned"): GraphQLSchema {
  let schema = schemas.get(version);
  if (!schema) {
    schema = makeExecutableSchema({
      typeDefs: loadStashTypeDefinitions(version),
      resolvers,
      // The resolvers are written for the pinned version, so some are for fields an older release doesn't have
      resolverValidationOptions: { requireResolversToMatchSchema: version === "pinned" ? "error" : "ignore" },
    });
    schemas.set(version, schema);
  }
  return schema;
}
