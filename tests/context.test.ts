import { describe, expect, it } from "vitest";
import { CASES } from "../fixtures/cases";
import { EXTRACT_BUDGET, VERDICT_BUDGET, relevantText } from "@/lib/shield/context";
import { isVerbatim } from "@/lib/shield/rules";
import { loadRecording, replayIO } from "@/lib/shield/io";
import { fetchSource } from "@/lib/shield/sources";
import { modelFailureReason } from "@/lib/shield/live";

async function bundle(id: string) {
  const c = CASES.find((x) => x.id === id)!;
  return fetchSource(c.url, replayIO(loadRecording(`fixtures/cases/${id}.json`)));
}

describe("relevantText (what the models read)", () => {
  it("cuts the 86k-char GitHub issue to budget but keeps the trap", async () => {
    const b = await bundle("gh-star-farm-poem");
    expect(b.text.length).toBeGreaterThan(40_000);
    const t = relevantText(b.text, EXTRACT_BUDGET);
    expect(t.length).toBeLessThanOrEqual(EXTRACT_BUDGET);
    expect(t).toContain("Star the repository");
    expect(t).toMatch(/\/bounty \$430/);
  });

  it("keeps the Devpost prize table and eligibility exclusions", async () => {
    const b = await bundle("dp-nebius");
    const t = relevantText(b.text, EXTRACT_BUDGET);
    expect(t.length).toBeLessThanOrEqual(EXTRACT_BUDGET);
    expect(t).toMatch(/Grand Prize/);
    expect(t).toMatch(/residents of, or Organizations domiciled/);
  });

  it("keeps region and token-sale facts for Superteam listings", async () => {
    const de = relevantText((await bundle("st-regional-de")).text, VERDICT_BUDGET);
    expect(de).toContain("Region: Germany");
    const chimp = relevantText((await bundle("st-token-promo")).text, VERDICT_BUDGET);
    expect(chimp).toMatch(/\$CHIMP/);
  });

  it("only ever returns verbatim slices of the original text", async () => {
    const b = await bundle("gh-star-farm-poem");
    for (const chunk of relevantText(b.text, EXTRACT_BUDGET).split(/\n{2,}|\n\n---\n\n/).filter((c) => c.trim().length > 20)) {
      expect(isVerbatim(chunk.slice(0, 200), b.text), chunk.slice(0, 80)).toBe(true);
    }
  });

  it("leaves short texts untouched", () => {
    expect(relevantText("short page", 1000)).toBe("short page");
  });
});

describe("model failure reasons", () => {
  it.each([
    [{ status: 402 }, "Token Factory credits exhausted"],
    [{ status: 429 }, "rate-limited"],
    [{ status: 503 }, "provider error"],
    [{ name: "APIConnectionTimeoutError", message: "Request timed out." }, "timed out"],
    [new SyntaxError("Unexpected token"), "malformed JSON"],
  ])("%o → %s", (err, reason) => expect(modelFailureReason(err)).toBe(reason));
});
