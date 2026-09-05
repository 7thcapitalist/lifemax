import path from "node:path";
import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(import.meta.dirname, "src") };
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
        resolve: { alias },
      },
      {
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          pool: "forks",
          fileParallelism: false,
        },
        resolve: { alias },
      },
      {
        test: {
          name: "architecture",
          include: ["tests/architecture/**/*.test.ts"],
          environment: "node",
        },
        resolve: { alias },
      },
    ],
  },
});
