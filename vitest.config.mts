import { defineConfig } from "vitest/config";
import path from "node:path";

const alias = { "@": path.resolve(__dirname, "src") };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: "unit", include: ["src/tests/unit/**/*.test.ts"], environment: "node" },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["src/tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["src/tests/integration/global-setup.ts"],
          setupFiles: ["src/tests/integration/setup-env.ts"],
          fileParallelism: false,
          testTimeout: 30000,
        },
      },
    ],
  },
});
