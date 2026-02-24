#!/usr/bin/env -S npx tsx

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import semanticRelease from "semantic-release";

async function main() {
  // Determine next version using dry-run
  const result = await semanticRelease({
    dryRun: true,
  });

  if (!result || !result.nextRelease) {
    console.error("No release detected. Nothing to update.");
    process.exit(1);
  }

  const nextVersion = result.nextRelease.version;
  console.log("Next version:", nextVersion);

  // Update package.json
  const packageJsonPath = path.resolve(process.cwd(), "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  packageJson.version = nextVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  console.log("Updated package.json");

  // Update packages/tv-plugin/source.yml
  const ymlPath = path.resolve(process.cwd(), "packages/tv-plugin/source.yml");
  const ymlContent = yaml.load(fs.readFileSync(ymlPath, "utf8")) as any;
  ymlContent.version = nextVersion;
  fs.writeFileSync(ymlPath, yaml.dump(ymlContent));
  console.log("Updated source.yml");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
