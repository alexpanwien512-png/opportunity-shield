// Replays the recorded fixtures of the 7 real demo cases through the full pipeline.
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { CASES, DEMO_PROFILE } from "../fixtures/cases";
import { analyzeUrl } from "@/lib/shield/analyze";
import { isVerbatim } from "@/lib/shield/rules";
import { loadRecording, replayIO } from "@/lib/shield/io";
import { fetchSource } from "@/lib/shield/sources";

const models = { fast: "fixture-fast", reasoning: "fixture-reasoning" };

describe.each(CASES)("$id", (c) => {
  const file = `fixtures/cases/${c.id}.json`;
  const run = fs.existsSync(file) ? it : it.skip;

  run(`is ${c.expected} with the expected red flags`, async () => {
    const recording = loadRecording(file);
    const result = await analyzeUrl(c.url, { io: replayIO(recording), profile: DEMO_PROFILE, models });
    const ids = result.flags.map((f) => f.id);

    expect(result.verdict, `flags: ${ids.join(", ")}`).toBe(c.expected);
    for (const id of c.mustFlag) expect(ids, `missing ${id}`).toContain(id);
    for (const id of c.mustNotFlag ?? []) expect(ids, `unexpected ${id}`).not.toContain(id);

    // Every page quote must really be on the page; API evidence names its source.
    const { text: pageText } = await fetchSource(c.url, replayIO(recording));
    for (const f of result.flags) {
      expect(f.evidence.length, `${f.id} has no evidence`).toBeGreaterThan(0);
      for (const e of f.evidence.filter((x) => x.source === "page")) {
        expect(isVerbatim(e.quote, pageText), `${f.id}: "${e.quote}"`).toBe(true);
      }
    }
  });
});
