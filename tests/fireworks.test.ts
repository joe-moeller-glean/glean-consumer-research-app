import { describe, it, expect } from "vitest";
import {
  buildJsonlLines,
  extractSentiment,
  parseResultsJsonl,
  datasetIdForBatch,
  mockClassify,
} from "@/lib/fireworks";

describe("buildJsonlLines", () => {
  it("emits one request per row keyed by custom_id", () => {
    const lines = buildJsonlLines([
      { id: "r1", feedbackText: "I love it" },
      { id: "r2", feedbackText: "I hate it" },
    ]);
    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0]);
    expect(first.custom_id).toBe("r1");
    expect(first.body.messages[0]).toEqual({ role: "user", content: "I love it" });
    expect(first.body.temperature).toBe(0);
  });

  it("deduplicates identical verbatims to save tokens", () => {
    const lines = buildJsonlLines([
      { id: "r1", feedbackText: "Tastes great" },
      { id: "r2", feedbackText: "tastes great" },
      { id: "r3", feedbackText: "  Tastes great  " },
      { id: "r4", feedbackText: "Something else" },
    ]);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).custom_id).toBe("r1");
  });

  it("skips blank feedback", () => {
    expect(buildJsonlLines([{ id: "r1", feedbackText: "   " }])).toHaveLength(0);
  });

  it("truncates very long feedback", () => {
    const lines = buildJsonlLines([{ id: "r1", feedbackText: "x".repeat(9000) }]);
    expect(JSON.parse(lines[0]).body.messages[0].content).toHaveLength(8000);
  });
});

describe("extractSentiment", () => {
  it("parses clean JSON output", () => {
    expect(extractSentiment('{"sentiment":"like","confidence":0.9}')).toEqual({
      sentiment: "LIKE",
      confidence: 0.9,
    });
  });

  it("handles code fences and surrounding prose", () => {
    expect(extractSentiment('```json\n{"sentiment":"dislike","confidence":0.7}\n```')).toEqual({
      sentiment: "DISLIKE",
      confidence: 0.7,
    });
    expect(
      extractSentiment('Here you go: {"sentiment":"indifferent","confidence":0.5} — hope that helps')
    ).toEqual({ sentiment: "INDIFFERENT", confidence: 0.5 });
  });

  it("uppercases sentiment regardless of model casing", () => {
    expect(extractSentiment('{"sentiment":"LiKe"}')?.sentiment).toBe("LIKE");
  });

  it("defaults confidence when the model omits it", () => {
    expect(extractSentiment('{"sentiment":"like"}')).toEqual({ sentiment: "LIKE", confidence: 0.5 });
  });

  it("returns null for unusable output", () => {
    expect(extractSentiment("I am not sure")).toBeNull();
    expect(extractSentiment('{"sentiment":"maybe"}')).toBeNull();
    expect(extractSentiment('{"sentiment":')).toBeNull();
    expect(extractSentiment("")).toBeNull();
  });
});

describe("parseResultsJsonl", () => {
  const line = (id: string, content: string) =>
    JSON.stringify({ custom_id: id, response: { body: { choices: [{ message: { content } }] } } });

  it("maps custom_ids to parsed sentiments", () => {
    const map = parseResultsJsonl(
      [line("r1", '{"sentiment":"like","confidence":0.9}'), line("r2", '{"sentiment":"dislike","confidence":0.8}')].join("\n")
    );
    expect(map.get("r1")).toEqual({ sentiment: "LIKE", confidence: 0.9 });
    expect(map.get("r2")).toEqual({ sentiment: "DISLIKE", confidence: 0.8 });
  });

  it("marks rows with unparseable content as errors", () => {
    const map = parseResultsJsonl(line("r1", "no json at all"));
    expect(map.get("r1")).toEqual({ error: true });
  });

  it("marks rows with no choices as errors", () => {
    const map = parseResultsJsonl(JSON.stringify({ custom_id: "r1", response: { body: {} } }));
    expect(map.get("r1")).toEqual({ error: true });
  });

  it("skips malformed and blank lines without throwing", () => {
    const map = parseResultsJsonl(["not json", "", "   ", line("r1", '{"sentiment":"like"}')].join("\n"));
    expect(map.size).toBe(1);
    expect(map.get("r1")).toBeTruthy();
  });
});

describe("datasetIdForBatch", () => {
  it("produces a lowercase alphanumeric id within length limits", () => {
    const id = datasetIdForBatch("0FA1B2C3-4D5E-6F70-8901-234567890ABC");
    expect(id).toMatch(/^cr-[a-z0-9]+$/);
    expect(id.length).toBeLessThanOrEqual(60);
  });
});

describe("mockClassify", () => {
  it("classifies obvious positive and negative feedback", () => {
    expect(mockClassify("I love this, it is great").sentiment).toBe("LIKE");
    expect(mockClassify("This is terrible and bland").sentiment).toBe("DISLIKE");
    expect(mockClassify("It is a beverage").sentiment).toBe("INDIFFERENT");
  });
});
