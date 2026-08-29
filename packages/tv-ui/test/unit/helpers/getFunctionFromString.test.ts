import { describe, expect, it } from "vitest";
import { getFunctionFromString } from "../../../src/helpers/getFunctionFromString";

/**
 * Unit tests for getFunctionFromString helper.
 *
 * These tests cover:
 * - Parsing valid function strings
 * - Handling invalid/undefined input
 * - Error cases (syntax errors, non-function results)
 * - Different function formats (arrow functions, named functions, etc.)
 */

describe("getFunctionFromString", () => {
  describe("valid function strings", () => {
    it("parses arrow function", () => {
      const result = getFunctionFromString("(x) => x * 2");
      expect(result).toBeInstanceOf(Function);

      const func = result as Function;
      expect(func(5)).toBe(10);
    });

    it("parses regular function", () => {
      const result = getFunctionFromString("function(x) { return x + 1; }");
      expect(result).toBeInstanceOf(Function);

      const func = result as Function;
      expect(func(4)).toBe(5);
    });

    it("parses function with multiple parameters", () => {
      const result = getFunctionFromString("(a, b) => a + b");
      expect(result).toBeInstanceOf(Function);

      const func = result as Function;
      expect(func(3, 7)).toBe(10);
    });

    it("parses complex function logic", () => {
      const result = getFunctionFromString("(x) => { if (x > 5) return 'big'; else return 'small'; }");
      expect(result).toBeInstanceOf(Function);

      const func = result as Function;
      expect(func(10)).toBe("big");
      expect(func(2)).toBe("small");
    });

    it("parses function with object destructuring", () => {
      const result = getFunctionFromString("({name, age}) => `${name} is ${age}`");
      expect(result).toBeInstanceOf(Function);

      const func = result as Function;
      expect(func({name: "Alice", age: 30})).toBe("Alice is 30");
    });

    it("parses function without parentheses (arrow function)", () => {
      const result = getFunctionFromString("x => x * 3");
      expect(result).toBeInstanceOf(Function);

      const func = result as Function;
      expect(func(4)).toBe(12);
    });
  });

  describe("invalid/undefined input", () => {
    it("returns null for undefined", () => {
      const result = getFunctionFromString(undefined);
      expect(result).toBeNull();
    });

    it("returns null for empty string", () => {
      const result = getFunctionFromString("");
      expect(result).toBeNull();
    });

    it("returns null for whitespace-only string", () => {
      const result = getFunctionFromString("   ");
      expect(result).toBeNull();
    });

    it("returns null for string with only newlines", () => {
      const result = getFunctionFromString("\n\n");
      expect(result).toBeNull();
    });
  });

  describe("error cases", () => {
    it("returns error for syntax error", () => {
      const result = getFunctionFromString("(x => x * 2"); // Missing closing paren
      expect(result).toBeInstanceOf(Error);

      const error = result as Error;
      expect(error.message).toContain("Not a valid function");
    });

    it("returns error for non-function result", () => {
      const result = getFunctionFromString("42"); // Just a number
      expect(result).toBeInstanceOf(Error);

      const error = result as Error;
      expect(error.message).toContain("Type is a number, not a function");
    });

    it("returns error for string result", () => {
      const result = getFunctionFromString("'hello'");
      expect(result).toBeInstanceOf(Error);

      const error = result as Error;
      expect(error.message).toContain("Type is a string, not a function");
    });

    it("returns error for object result", () => {
      const result = getFunctionFromString("{ a: 1 }");
      expect(result).toBeInstanceOf(Error);

      const error = result as Error;
      expect(error.message).toContain("Type is a object, not a function");
    });

    it("returns error for array result", () => {
      const result = getFunctionFromString("[1, 2, 3]");
      expect(result).toBeInstanceOf(Error);

      const error = result as Error;
      expect(error.message).toContain("Type is a object, not a function");
    });
  });

  describe("real-world use cases", () => {
    it("handles media filtering function", () => {
      const mediaFilterFunc = "(items) => items.filter(item => item.rating > 4)";
      const result = getFunctionFromString(mediaFilterFunc);
      expect(result).toBeInstanceOf(Function);

      const func = result as Function;
      const testItems = [
        { id: 1, rating: 5 },
        { id: 2, rating: 3 },
        { id: 3, rating: 4.5 }
      ];
      expect(func(testItems)).toHaveLength(2);
    });

    it("handles transformation function", () => {
      const transformFunc = "(items) => items.map(item => ({ ...item, processed: true }))";
      const result = getFunctionFromString(transformFunc);
      expect(result).toBeInstanceOf(Function);

      const func = result as Function;
      const testItems = [{ id: 1, name: "test" }];
      const resultItems = func(testItems);
      expect(resultItems[0]).toHaveProperty("processed", true);
    });

    it("handles sorting function", () => {
      const sortFunc = "(items) => [...items].sort((a, b) => a.title.localeCompare(b.title))";
      const result = getFunctionFromString(sortFunc);
      expect(result).toBeInstanceOf(Function);

      const func = result as Function;
      const testItems = [
        { title: "Zebra" },
        { title: "Apple" },
        { title: "Mango" }
      ];
      const sorted = func(testItems);
      expect(sorted[0].title).toBe("Apple");
      expect(sorted[2].title).toBe("Zebra");
    });
  });

  describe("edge cases", () => {
    it("handles function with try-catch", () => {
      const result = getFunctionFromString("(x) => { try { return JSON.parse(x); } catch { return null; } }");
      expect(result).toBeInstanceOf(Function);

      const func = result as Function;
      expect(func('{"a":1}')).toEqual({a:1});
      expect(func('invalid')).toBeNull();
    });

    it("handles async function", () => {
      const result = getFunctionFromString("async (x) => x * 2");
      expect(result).toBeInstanceOf(Function);

      const func = result as Function;
      const promise = func(5) as Promise<number>;
      expect(promise).toBeInstanceOf(Promise);
    });

    it("handles function with default parameters", () => {
      const result = getFunctionFromString("(x = 10) => x * 2");
      expect(result).toBeInstanceOf(Function);

      const func = result as Function;
      expect(func()).toBe(20);
      expect(func(5)).toBe(10);
    });

    it("handles function with rest parameters", () => {
      const result = getFunctionFromString("(...args) => args.reduce((sum, x) => sum + x, 0)");
      expect(result).toBeInstanceOf(Function);

      const func = result as Function;
      expect(func(1, 2, 3, 4)).toBe(10);
    });
  });
});
