import { defineConfig } from "vitest/config";

// Checks an operations log has a conformance case for each operation (see check-operations.test.ts)
export default defineConfig({
  test: {
    include: ["check-operations.test.ts"],
    environment: "node",
  },
});
