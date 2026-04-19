import { describe, expect, it } from "vitest";

import nextConfig from "../../../next.config";

describe("nextConfig", () => {
  it("raises the proxy body size cap for larger video uploads", () => {
    expect(nextConfig.experimental?.proxyClientMaxBodySize).toBe("50mb");
  });
});
