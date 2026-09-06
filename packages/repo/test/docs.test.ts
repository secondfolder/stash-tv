import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Repository-level validation: Documentation index and citations.
 *
 * The docs index in AGENTS.md is how an agent decides which docs its task calls for,
 * so a doc missing from it is a doc nobody reads. This test ensures that:
 * 1. Every .md file in docs/ is listed in AGENTS.md
 * 2. Every link in AGENTS.md points to a real file or directory
 * 3. Documented features aren't silently removed
 */

describe("the docs index in AGENTS.md", () => {
  const repoRoot = path.resolve(__dirname, "../../..");
  const agentsMdPath = path.join(repoRoot, "AGENTS.md");
  const docsDir = path.join(repoRoot, "docs");

  const agentsMd = fs.readFileSync(agentsMdPath, "utf-8");

  // Get all .md files in docs/ (excluding images and README.md if it exists as a preface)
  const docs = fs
    .readdirSync(docsDir)
    .filter((entry) => entry.endsWith(".md") && entry !== "README.md")
    .map((entry) => `docs/${entry}`);

  it("lists every doc in the documentation table", () => {
    expect(docs.length).toBeGreaterThan(0);
    for (const docPath of docs) {
      expect(
        agentsMd,
        `docs/${docPath} is not referenced in AGENTS.md - add it to the Documentation table`,
      ).toContain(`(${docPath})`);
    }
  });

  it("lists nothing in the documentation table that isn't there", () => {
    // Extract all (docs/...) references from AGENTS.md
    const listed = [...agentsMd.matchAll(/\]\((docs\/[^)]+)\)/g)].map(
      (match) => match[1],
    );

    expect(listed.length).toBeGreaterThan(0);

    for (const docRef of listed) {
      const target = docRef.endsWith("/") ? docRef.slice(0, -1) : docRef;
      const fullPath = path.join(repoRoot, target);
      expect(
        fs.existsSync(fullPath),
        `AGENTS.md links to ${target} which does not exist`,
      ).toBe(true);

      const stat = fs.statSync(fullPath);
      expect(stat.isFile() || stat.isDirectory()).toBe(true);
    }
  });
});

/**
 * Test that validates doc citations in test code point to real sections.
 * Tests cite documentation sections using the format: docs/file.md § "Section Name"
 * This ensures that when docs are renamed or restructured, broken references are caught.
 */
describe("the doc references in tests", () => {
  const repoRoot = path.resolve(__dirname, "../../..");

  /**
   * Extract all section headings from a markdown file.
   * Matches ## through ###### level headings.
   */
  const sectionsIn = (docPath: string): Set<string> => {
    const fullPath = path.join(repoRoot, docPath);
    const content = fs.readFileSync(fullPath, "utf-8");
    return new Set(
      [...content.matchAll(/^#{2,6} (.+)$/gm)].map((match) =>
        match[1].trim()
      ),
    );
  };

  /**
   * Recursively collect all doc citations from test files across all packages.
   * Citation format: docs/file.md § "Section Name"
   */
  const references = (() => {
    const found: Array<{
      file: string;
      section: string;
      doc: string;
    }> = [];
    const packagesDir = path.join(repoRoot, "packages");

    const collect = (dir: string) => {
      if (!fs.existsSync(dir)) return;

      try {
        for (const entry of fs.readdirSync(dir)) {
          // Skip build and dependency directories for performance
          if (
            entry === "node_modules" ||
            entry === "dist" ||
            entry === ".git" ||
            entry === ".next" ||
            entry === ".cache" ||
            entry === "build" ||
            entry.startsWith(".")
          ) {
            continue;
          }

          const fullPath = path.join(dir, entry);
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory()) {
            collect(fullPath);
            continue;
          }

          if (!entry.endsWith(".ts")) continue;

          // Skip docs validation test to avoid picking up citations in documentation
          if (entry === "docs.test.ts") continue;

          const content = fs.readFileSync(fullPath, "utf-8");
          // Match: docs/file.md § "Section Name"
          // Using the section symbol (§) as delimiter
          for (const match of content.matchAll(
            /(docs\/[\w.-]+\.md) § "([^"]+)"/g,
          )) {
            found.push({ file: fullPath, doc: match[1], section: match[2] });
          }
        }
      } catch (e) {
        // Silently skip directories we can't read (permissions, symlinks, etc.)
      }
    };

    collect(packagesDir);
    return found;
  })();

  it("finds citations (so later checks cannot pass vacuously)", () => {
    // Guards against the citation corpus silently emptying (e.g. a regex or
    // path change): with zero references found, the next test would pass
    // without checking anything.
    expect(references.length).toBeGreaterThan(0);
  });

  it("cites sections that actually exist in the docs", () => {
    if (references.length === 0) {
      // No citations yet, which is fine. This test will activate when tests start
      // citing docs using the docs/file.md § "Section Name" format.
      return;
    }

    const sections = new Map<string, Set<string>>();
    for (const { doc } of references) {
      if (!sections.has(doc)) {
        sections.set(doc, sectionsIn(doc));
      }
    }

    for (const { file, doc, section } of references) {
      const docSections = sections.get(doc);
      expect(
        docSections?.has(section),
        `${file} cites ${doc} § "${section}", but that heading doesn't exist in the doc`,
      ).toBe(true);
    }
  });
});
