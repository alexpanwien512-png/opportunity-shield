// What the models actually read. Pages can be huge (a GitHub issue with 250 comments is ~86k chars);
// sending all of it is slow and burns Token Factory credit. Keep the platform facts, the top of the
// page, and the paragraphs that talk about money, eligibility, deadlines, judging and payment.
// Everything kept is a verbatim slice of the original text, so quotes stay checkable against it.

const RELEVANT =
  /prize|reward|bount|award|winner|cash|\busdc?\b|\busdt\b|\busdg\b|\$\s?\d|€\s?\d|eligib|resident|citizen|countr|region|located|online|in[- ]person|deadline|due date|closes|submission|submit|judg|criteria|payment|paid|\bpay\b|\bdm\b|telegram|whatsapp|escrow|token|presale|pre-sale|tokenomics|\bstar\b|follow|fork|requirement|must|only|test bounty|credit|voucher|discount|services|sponsor|\/attempt|\/bounty|engagement|likes|reposts|rules|not open|ineligible|excluded|exclude|prohibit|sanction|age of majority|years old/gi;

const SEP = "\n\n---\n\n";

function score(block: string): number {
  return (block.match(RELEVANT) ?? []).length;
}

/**
 * Trims a source bundle's text to `budget` characters: platform facts first (up to 40% of the
 * budget), then the page head, then the most relevant paragraphs in their original order.
 */
export function relevantText(text: string, budget: number): string {
  if (text.length <= budget) return text;
  const sections = text.split(SEP);
  const isApi = (s: string) => s.startsWith("## Live listing");
  const api = sections.filter(isApi).join(SEP).slice(0, Math.floor(budget * 0.4));
  const page = sections.filter((s) => !isApi(s)).join(SEP);

  let remaining = budget - api.length - 200;
  const head = page.slice(0, Math.min(1500, remaining));
  remaining -= head.length;

  const blocks = page
    .slice(head.length)
    .split(/\n{2,}/)
    .map((b, i) => ({ b: b.trim(), i, s: score(b) }))
    .filter((x) => x.b.length > 0 && x.s > 0);
  // Highest density of relevant terms first, short paragraphs favoured over long comment walls.
  blocks.sort((a, c) => c.s / Math.sqrt(c.b.length) - a.s / Math.sqrt(a.b.length));

  const keep: typeof blocks = [];
  for (const x of blocks) {
    const piece = x.b.length > 1200 ? x.b.slice(0, 1200) : x.b;
    if (piece.length + 2 > remaining) continue;
    keep.push({ ...x, b: piece });
    remaining -= piece.length + 2;
    if (remaining < 200) break;
  }
  keep.sort((a, c) => a.i - c.i);

  return [api, `${head}\n\n${keep.map((x) => x.b).join("\n\n")}`].filter(Boolean).join(SEP);
}

export const EXTRACT_BUDGET = 16_000; // ~4k tokens for Nemotron 3.5 Lightning
export const VERDICT_BUDGET = 12_000; // ~3k tokens for Nemotron 3 Ultra (it also gets the extracted facts)
