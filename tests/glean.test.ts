import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * All Glean API requests must target the configured instance backend host
 * (serverURL in the Glean developer docs), never a shared api.glean.com domain.
 */
describe("gleanApiUrl", () => {
  const ORIGINAL = process.env.GLEAN_BE_URL;

  beforeEach(() => vi.resetModules());
  afterEach(() => {
    process.env.GLEAN_BE_URL = ORIGINAL;
    vi.resetModules();
  });

  async function load(beUrl: string | undefined) {
    if (beUrl === undefined) delete process.env.GLEAN_BE_URL;
    else process.env.GLEAN_BE_URL = beUrl;
    vi.resetModules();
    return import("@/lib/glean");
  }

  it("builds URLs against the configured backend host", async () => {
    const { gleanApiUrl } = await load("https://glean-partner-sandbox-2-be.glean.com");
    expect(gleanApiUrl("/rest/api/v1/agents/runs/wait")).toBe(
      "https://glean-partner-sandbox-2-be.glean.com/rest/api/v1/agents/runs/wait"
    );
  });

  it("tolerates a trailing slash on the host and a missing leading slash on the path", async () => {
    const { gleanApiUrl } = await load("https://acme-be.glean.com/");
    expect(gleanApiUrl("rest/api/v1/agents/runs/wait")).toBe(
      "https://acme-be.glean.com/rest/api/v1/agents/runs/wait"
    );
  });

  it("fails with an actionable message when GLEAN_BE_URL is unset", async () => {
    const { gleanApiUrl } = await load(undefined);
    expect(() => gleanApiUrl("/rest/api/v1/agents/runs/wait")).toThrowError(/GLEAN_BE_URL is not set/);
  });

  it("never falls back to a shared api.glean.com host", async () => {
    const { gleanApiUrl } = await load("https://acme-be.glean.com");
    expect(gleanApiUrl("/rest/api/v1/agents/runs/wait")).not.toContain("api.glean.com");
  });
});
