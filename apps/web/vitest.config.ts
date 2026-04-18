import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "next/link": path.resolve(__dirname, "./src/test/mocks/next-link.tsx"),
      "next/navigation": path.resolve(__dirname, "./src/test/mocks/next-navigation.ts"),
    },
  },
});
