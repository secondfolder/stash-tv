import { describe, expect, it } from "vitest";
import { getFunctionFromString } from "../../../src/helpers/getFunctionFromString";

/**
 * Unit tests for getFunctionFromString — the parser behind user-supplied
 * media-items modifier functions.
 *
 * These tests cover:
 * - Parsing valid function strings (invoked, not just type-checked)
 * - Handling invalid/undefined input
 * - Error cases (syntax errors, non-function results)
 * - Formats users actually paste, including multi-line functions
 */

/** Parse and narrow to a callable in one step — the sanctioned single cast spot. */
function parseFunction<T = unknown>(source: string): (...args: unknown[]) => T {
  const result = getFunctionFromString(source);
  expect(result).toBeInstanceOf(Function);
  if (typeof result !== "function") throw new Error("expected a function");
  return result as (...args: unknown[]) => T;
}

/** Parse and narrow to an Error in one step. */
function parseError(source: string): Error {
  const result = getFunctionFromString(source);
  expect(result).toBeInstanceOf(Error);
  if (!(result instanceof Error)) throw new Error("expected an error");
  return result;
}

describe("getFunctionFromString", () => {
  describe("valid function strings", () => {
    it("parses and invokes arrow functions", () => {
      expect(parseFunction("(x) => x * 2")(5)).toBe(10);
    });

    it("parses regular and multi-parameter functions", () => {
      expect(parseFunction("function(x) { return x + 1; }")(4)).toBe(5);
      expect(parseFunction("(a, b) => a + b")(3, 7)).toBe(10);
    });

    it("parses functions with bodies, destructuring and no parens", () => {
      expect(parseFunction("(x) => { if (x > 5) return 'big'; else return 'small'; }")(10)).toBe("big");
      expect(parseFunction("({name, age}) => `${name} is ${age}`")({ name: "Alice", age: 30 })).toBe(
        "Alice is 30"
      );
      expect(parseFunction("x => x * 3")(4)).toBe(12);
    });

    it("parses multi-line functions — the format users paste from editors", () => {
      const source = `
(items) => {
  const result = items.filter(item => item.id.endsWith('1'))
  return result
}`;
      expect(parseFunction(source)([{ id: "scene-1" }, { id: "scene-2" }])).toEqual([{ id: "scene-1" }]);
    });
  });

  describe("invalid/undefined input", () => {
    it("returns null for missing or blank strings", () => {
      expect(getFunctionFromString(undefined)).toBeNull();
      expect(getFunctionFromString("")).toBeNull();
      expect(getFunctionFromString("   ")).toBeNull();
      expect(getFunctionFromString("\n\n")).toBeNull();
    });
  });

  describe("error cases", () => {
    it("returns an error for syntax errors", () => {
      expect(parseError("(x => x * 2").message).toContain("Not a valid function");
    });

    it("returns an error naming the actual type for non-function results", () => {
      expect(parseError("42").message).toContain("Type is a number, not a function");
      expect(parseError("'hello'").message).toContain("Type is a string, not a function");
      expect(parseError("[1, 2, 3]").message).toContain("Type is a object, not a function");
    });
  });

  describe("real-world use cases", () => {
    it("filters media items", () => {
      const filter = parseFunction("(items) => items.filter(item => item.rating > 4)");
      const testItems = [
        { id: 1, rating: 5 },
        { id: 2, rating: 3 },
        { id: 3, rating: 4.5 },
      ];
      expect(filter(testItems)).toHaveLength(2);
    });

    it("transforms media items", () => {
      const transform = parseFunction<{ id: number; processed: boolean }[]>(
        "(items) => items.map(item => ({ ...item, processed: true }))"
      );
      const transformed = transform([{ id: 1, name: "test" }]);
      expect(transformed[0].processed).toBe(true);
    });

    it("sorts media items", () => {
      const sort = parseFunction<{ title: string }[]>(
        "(items) => [...items].sort((a, b) => a.title.localeCompare(b.title))"
      );
      const sorted = sort([{ title: "Zebra" }, { title: "Apple" }, { title: "Mango" }]);
      expect(sorted.map((item) => item.title)).toEqual(["Apple", "Mango", "Zebra"]);
    });
  });

  describe("edge cases", () => {
    it("handles functions with try-catch, defaults and rest params", () => {
      expect(parseFunction('(x) => { try { return JSON.parse(x); } catch { return null; } }')('{"a":1}')).toEqual({ a: 1 });
      expect(parseFunction("(x = 10) => x * 2")()).toBe(20);
      expect(parseFunction("(...args) => args.reduce((sum, x) => sum + x, 0)")(1, 2, 3, 4)).toBe(10);
    });

    it("handles async functions and awaits their result", async () => {
      const asyncFn = parseFunction<Promise<number>>("async (x) => x * 2");
      await expect(asyncFn(5)).resolves.toBe(10);
    });
  });
});
