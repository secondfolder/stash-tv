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

  const nextVersion = result ? result.nextRelease.version : undefined;
  setStepOutput("release", nextVersion ? "true" : "false");

  if (!nextVersion) {
    console.log("No release detected. Nothing to update.");
    return;
  }

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

/** Lets later steps of the GitHub Actions job know the outcome (does nothing outside GitHub Actions) */
function setStepOutput(name: string, value: string) {
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
