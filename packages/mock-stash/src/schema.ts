import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeExecutableSchema } from "@graphql-tools/schema";
import type { GraphQLSchema } from "graphql";
import { resolvers } from "./resolvers";
import type { StashVersion } from "./stash-versions";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The mock server deliberately serves Stash's *own* GraphQL schema rather than a hand-written subset, so that it
 * stays structurally faithful to the real API. `test/conformance` compares responses against a real Stash instance to
 * keep the resolver *behaviour* faithful too.
 *
 * It serves the schema of any Stash version Stash TV is tested against (see `stash-versions.ts`):
 * - `develop`: the one in the `stash` git submodule in stash-ui, which Stash TV is built against
 * - a release (`latest-release`, `previous-release`): its schema, which stash-ui's setup.sh copies out of the release's
 *   git tag into `release-schemas/<version>/` for the tests
 */
function schemaDir(version: StashVersion): string {
  return version === "develop"
    ? path.resolve(here, "../../stash-ui/stash/graphql/schema")
    : path.resolve(here, "../../stash-ui/release-schemas", version);
}

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

const typeDefs = new Map<StashVersion, string>();
export function loadStashTypeDefinitions(version: StashVersion = "develop"): string {
  let versionTypeDefs = typeDefs.get(version);
  if (versionTypeDefs === undefined) {
    versionTypeDefs = readGraphqlFiles(schemaDir(version));
    typeDefs.set(version, versionTypeDefs);
  }
  return versionTypeDefs;
}

const schemas = new Map<StashVersion, GraphQLSchema>();
/** The schema is context-driven (resolvers read everything from the per-server context),
 * so a single schema instance per version can safely be shared by every server. */
export function getStashSchema(version: StashVersion = "develop"): GraphQLSchema {
  let schema = schemas.get(version);
  if (!schema) {
    schema = makeExecutableSchema({
      typeDefs: loadStashTypeDefinitions(version),
      resolvers,
      // The resolvers are written for develop, so some are for fields a release doesn't have
      resolverValidationOptions: { requireResolversToMatchSchema: version === "develop" ? "error" : "ignore" },
    });
    schemas.set(version, schema);
  }
  return schema;
}
