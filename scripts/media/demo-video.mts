// Records the Devpost demo (1920×1080) following VIDEO_SCRIPT.md: human-paced mouse and typing,
// burned-in captions (rendered as an in-page overlay), title and end cards. Writes the raw WebM and a
// scene log; scripts/media/render.sh turns them into docs/demo.mp4 and docs/demo.gif.
// Usage: node --import tsx scripts/media/demo-video.mts [base-url] [out-dir]   (mode via MODE=video|gif)
import fs from "node:fs";
import path from "node:path";
import { chromium, type Locator, type Page } from "playwright";

const BASE = (process.argv[2] ?? "http://localhost:3300").replace(/\/$/, "");
const OUT = process.argv[3] ?? "media-out";
const MODE = process.env.MODE ?? "video";
const LIVE_URL = "https://opportunity-shield-6zsl.onrender.com";
const REPO_URL = "https://github.com/alexpanwien512-png/opportunity-shield";
fs.mkdirSync(OUT, { recursive: true });

// Video: 1920×1080 frames with the page zoomed 1.5× (body zoom) → a 1280-px-wide layout with readable text.
// Playwright records CSS pixels, so device scale factor would not help; zoom does.
const SIZE = MODE === "gif" ? { width: 1280, height: 800 } : { width: 1920, height: 1080 };
const ZOOM = MODE === "gif" ? 1 : 1.5;
const URLS = {
  poem: "https://github.com/SecureBananaLabs/bug-bounty/issues/76",
  live: "https://superteam.fun/earn/listing/travel-boost-for-bp26",
};

// ---------- overlay: captions + visible cursor (headless video has no OS cursor) ----------
const OVERLAY = `(() => {
  const css = \`
    #__demo-cap{position:fixed;left:50%;bottom:52px;transform:translateX(-50%);z-index:2147483647;max-width:1620px;width:max-content;
      padding:20px 36px;border-radius:20px;background:rgba(8,12,22,.88);border:1px solid rgba(148,163,184,.28);
      color:#f3f6fb;font:600 38px/1.32 -apple-system,"Geist","Inter",system-ui,sans-serif;text-align:center;
      box-shadow:0 18px 50px -12px rgba(0,0,0,.6);transition:opacity .25s;opacity:0;pointer-events:none}
    #__demo-cap b{color:#2dd4bf;font-weight:700}
    #__demo-cap small{display:block;margin-top:6px;font-weight:500;font-size:27px;color:#aab4c5}
    #__demo-cur{position:fixed;z-index:2147483647;width:34px;height:34px;pointer-events:none;transform:translate(-4px,-3px);transition:transform .08s}
    #__demo-cur.down{transform:translate(-4px,-3px) scale(.85)}
    .__demo-ripple{position:fixed;z-index:2147483646;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid #2dd4bf;pointer-events:none;animation:__r .5s ease-out forwards}
    @keyframes __r{from{transform:scale(.3);opacity:.9}to{transform:scale(1.4);opacity:0}}\`;
  const init = () => {
    if (document.getElementById("__demo-cap")) return;
    const st = document.createElement("style"); st.textContent = css; document.documentElement.appendChild(st);
    const cap = document.createElement("div"); cap.id = "__demo-cap"; document.documentElement.appendChild(cap);
    const cur = document.createElement("div"); cur.id = "__demo-cur";
    cur.innerHTML = '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M4 2l15 11-6.5 1.2L16 21l-3 1.4-3.6-6.8L4 20z" fill="#fff" stroke="#0a0f1c" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    const last = JSON.parse(sessionStorage.getItem("__cur") || '{"x":960,"y":540}');
    cur.style.left = last.x + "px"; cur.style.top = last.y + "px";
    document.documentElement.appendChild(cur);
    window.__cursor = (x, y) => { cur.style.left = x + "px"; cur.style.top = y + "px"; sessionStorage.setItem("__cur", JSON.stringify({x, y})); };
    window.__press = (x, y, down) => { cur.classList.toggle("down", down); if (!down) return; const r = document.createElement("div"); r.className = "__demo-ripple"; r.style.left = x + "px"; r.style.top = y + "px"; document.documentElement.appendChild(r); setTimeout(() => r.remove(), 600); };
    window.__caption = (html) => { cap.style.opacity = html ? "1" : "0"; if (html) cap.innerHTML = html; };
  };
  const zoom = () => { if (document.body && ZOOM_VALUE !== 1) document.body.style.zoom = String(ZOOM_VALUE); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { init(); zoom(); }); else { init(); zoom(); }
})();`.replaceAll("ZOOM_VALUE", String(ZOOM));

// ---------- helpers ----------
const t0 = Date.now();
const scenes: { name: string; at: number }[] = [];
const mark = (name: string) => scenes.push({ name, at: (Date.now() - t0) / 1000 });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function caption(page: Page, html: string | null) {
  await page.evaluate((h) => (window as unknown as { __caption?: (h: string | null) => void }).__caption?.(h), html);
}

let cursor = { x: SIZE.width / 2, y: SIZE.height / 2 };
async function moveTo(page: Page, x: number, y: number, ms = 700) {
  const steps = Math.max(12, Math.round(ms / 16));
  const from = { ...cursor };
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // ease in-out
    const px = from.x + (x - from.x) * e;
    const py = from.y + (y - from.y) * e;
    await page.mouse.move(px, py);
    await page.evaluate(([a, b]) => (window as unknown as { __cursor?: (x: number, y: number) => void }).__cursor?.(a, b), [px, py]);
    await wait(ms / steps);
  }
  cursor = { x, y };
}
async function clickOn(page: Page, target: Locator, ms = 700) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error("no box");
  await moveTo(page, box.x + box.width / 2, box.y + box.height / 2, ms);
  await wait(180);
  const press = (down: boolean) => page.evaluate(([a, b, d]) => (window as unknown as { __press?: (x: number, y: number, d: boolean) => void }).__press?.(a as number, b as number, d as boolean), [cursor.x, cursor.y, down]);
  await press(true);
  await page.mouse.down();
  await wait(90);
  await page.mouse.up();
  await press(false);
}
async function smoothScroll(page: Page, to: number, ms = 1200) {
  // "to" is in unzoomed CSS px of the page; the browser's smooth scroll handles easing.
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "smooth" }), to);
  await wait(ms);
}
async function scrollToEl(page: Page, selector: string, offset = 120, ms = 1200) {
  await page.locator(selector).first().evaluate((el, o) => {
    (el as HTMLElement).style.scrollMarginTop = `${o}px`;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, offset);
  await wait(ms);
}

function card(title: string, sub: string, extra = "") {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;height:100%;background:#0a0f1c;color:#e6eaf2;font-family:-apple-system,"Geist","Inter",system-ui,sans-serif}
    body{display:flex;align-items:center;justify-content:center;
      background:linear-gradient(rgba(148,163,184,.06) 1px,transparent 1px) 0 0/40px 40px,linear-gradient(90deg,rgba(148,163,184,.06) 1px,transparent 1px) 0 0/40px 40px,radial-gradient(ellipse at 50% 35%,#0f2a2c 0%,#0a0f1c 60%)}
    .c{text-align:center;max-width:1500px;padding:0 60px}
    h1{margin:28px 0 0;font-size:72px;letter-spacing:-3px;font-weight:700}
    p{margin:26px 0 0;font-size:30px;color:#9aa5b8;line-height:1.35}
    p b{color:#2dd4bf;font-weight:600}
    .x{margin-top:54px;font-size:24px;line-height:1.7;color:#cbd3e1}
    .x span{color:#2dd4bf}
    @keyframes in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
    .c>*{animation:in .7s cubic-bezier(.2,.7,.2,1) both}.c>*:nth-child(2){animation-delay:.12s}.c>*:nth-child(3){animation-delay:.24s}.c>*:nth-child(4){animation-delay:.36s}
  </style></head><body><div class="c">
    <svg width="120" height="120" viewBox="0 0 32 32"><path d="M16 2.5 27 6.5v8.2c0 7-4.6 12.3-11 14.8C9.6 27 5 21.7 5 14.7V6.5L16 2.5Z" fill="none" stroke="#2dd4bf" stroke-width="1.6"/><path d="M16 9.5 21 15l-5 5.5-5-5.5L16 9.5Z" fill="#2dd4bf"/></svg>
    <h1>${title}</h1><p>${sub}</p>${extra}
  </div></body></html>`;
}

// ---------- recording ----------
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: SIZE,
  deviceScaleFactor: 1,
  colorScheme: "dark",
  recordVideo: { dir: OUT, size: SIZE },
});
await context.addInitScript(() => {
  localStorage.setItem("theme", "dark");
  localStorage.setItem("onboarded-v1", "1");
});
await context.addInitScript(OVERLAY);
// tsx/esbuild wraps named functions with __name(); functions shipped to the page need it defined.
await context.addInitScript("window.__name = (f) => f;");
const page = await context.newPage();

async function liveRun(url: string, captions: boolean) {
  // Force a fresh analysis so the timeline actually runs (cached results skip the agent).
  await page.route("**/api/analyze", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}");
    await route.continue({ postData: JSON.stringify({ ...body, force: true }) });
  });
  const input = page.locator("#url");
  await clickOn(page, input);
  await page.keyboard.type(url, { delay: MODE === "gif" ? 14 : 38 });
  await wait(MODE === "gif" ? 250 : 700);
  await page.keyboard.press("Enter");
  mark("analysis-start");
  const step = (label: string) => page.locator(`ol[aria-label="Analysis progress"] li:has-text("${label}")`);
  const reached = (label: string) => step(label).locator(".spin, svg").first().waitFor({ timeout: 120_000 });
  const STEPS: [string, string][] = [
    ["Fetching page", "<b>Step 1 · Tavily Extract</b> reads the page<small>…and the GitHub / Superteam / Devpost APIs add hard facts: repo age, PR count, region, sponsor status</small>"],
    ["Extracting facts", "<b>Step 2 · Nemotron 3.5 Lightning</b> (fast model) extracts the facts<small>prizes per place, region, deadline, preconditions — each with a verbatim quote from the page</small>"],
    ["Hunting red flags", "<b>Step 3 · 18 deterministic red-flag rules</b> run on those facts<small>no verbatim evidence → no flag. The rules set a verdict ceiling.</small>"],
    ["Final verdict", "<b>Step 4 · Nemotron 3 Ultra</b> (reasoning model) makes the final call<small>it can only be stricter than the rules — and only with evidence of the right kind</small>"],
  ];
  for (const [label, text] of STEPS) {
    await reached(label);
    if (captions) await caption(page, text);
    await wait(captions ? 3600 : 0);
  }
  await page.locator("#verdict-title").waitFor({ timeout: 180_000 });
  mark("verdict");
  await page.unroute("**/api/analyze");
}

if (MODE === "gif") {
  await page.goto(`${BASE}/`);
  await page.locator("#url").blur();
  await wait(900);
  mark("start");
  await liveRun(URLS.live, false);
  await wait(2600);
  mark("end");
} else {
  // 0 · Title card
  await page.setContent(card("Opportunity Shield", "A personal AI agent that vets bounties &amp; hackathons — <b>every red flag backed by a quote</b>.", `<div class="x">NVIDIA Nemotron on <span>Nebius Token Factory</span> · web data by <span>Tavily</span></div>`));
  mark("title");
  await wait(5200);

  // 1 · The problem: a real trap
  await page.goto(URLS.poem, { waitUntil: "domcontentloaded" });
  mark("problem");
  await wait(1200);
  await caption(page, "This is a real GitHub bounty: <b>$430</b> to write a poem.");
  await wait(3500);
  await smoothScroll(page, 260, 1500);
  await caption(page, "The catch is one line: <b>“Star the repository.”</b><small>250+ comments claiming it · 8,000+ PRs in a 5-month-old repo. It's a star farm.</small>");
  await wait(5200);
  await caption(page, "Bounty boards are full of these: fake “test bounties” paid by DM, region-locked listings, prizes that turn out to be credits.");
  await wait(4800);
  await caption(page, null);

  // 2 · The app
  await page.goto(`${BASE}/`);
  await page.locator("#url").blur();
  mark("home");
  await wait(800);
  await caption(page, "<b>Opportunity Shield</b> checks a listing for <i>you</i>: are you eligible, is the prize real, is it a trap?");
  await wait(4500);
  await caption(page, "Paste any link — a hackathon, a Superteam bounty, or a GitHub issue.");
  await wait(1500);

  // 3 · Live analysis of the trap, with the agent timeline
  await liveRun(URLS.poem, true);
  await caption(page, "<b>AVOID</b> — star farming, a bounty-farm repo, and dozens of people already claimed it.");
  await wait(4200);
  await scrollToEl(page, "#flags-title", 150, 1600);
  await caption(page, "Every red flag shows its evidence<small>a quote from the page, or a fact from the platform API — with a link to the source</small>");
  await wait(5200);
  await caption(page, null);

  // 4 · CAUTION: the bait-and-switch
  await smoothScroll(page, 0, 900);
  await clickOn(page, page.getByRole("button", { name: /Analyze something else/ }), 900).catch(async () => {
    await page.goto(`${BASE}/`);
  });
  await wait(900);
  mark("caution");
  await clickOn(page, page.getByRole("button", { name: /\$CHIMP thread/ }), 900);
  await page.locator("#verdict-title").waitFor();
  await wait(1200);
  await caption(page, "<b>CAUTION</b> — real USDC, but you'd be promoting a token sale for an unverified sponsor.");
  await wait(4300);
  await scrollToEl(page, 'li:has-text("Listing edited after publication")', 150, 1600);
  await caption(page, "And something nobody spots by eye: the prize pool was cut from <b>2,000 to 500 USDC</b> after publication.<small>Tavily's indexed copy vs. the live listing</small>");
  await wait(5600);
  await caption(page, null);

  // 5 · APPLY
  await smoothScroll(page, 0, 900);
  await clickOn(page, page.getByRole("button", { name: /Analyze something else/ }), 900).catch(async () => {
    await page.goto(`${BASE}/`);
  });
  await wait(700);
  mark("apply");
  await clickOn(page, page.getByRole("button", { name: /Nebius x NVIDIA hackathon/ }), 900);
  await page.locator("#verdict-title").waitFor();
  await wait(1200);
  await caption(page, "And a real one: eligible from Austria, cash per place, no red flags → <b>APPLY</b>.");
  await wait(4300);
  await scrollToEl(page, 'h3:has-text("Prizes & eligibility")', 150, 1400);
  await caption(page, "Real prizes per place — read from the official rules via Tavily.");
  await wait(3800);
  await caption(page, null);

  // 6 · Scan
  await clickOn(page, page.getByRole("link", { name: "Scan" }), 900);
  await page.waitForURL("**/scan");
  mark("scan");
  await wait(800);
  await caption(page, "<b>Scan</b> finds new opportunities on its own.");
  await clickOn(page, page.getByRole("button", { name: /Run scan/ }).first(), 900);
  mark("scan-start");
  await wait(1800);
  await caption(page, "<b>Tavily Search</b> + Devpost &amp; Superteam open feeds → listings<small>expired and region-locked ones are dropped using platform data</small>");
  await page.locator("text=/^Found /").waitFor({ timeout: 300_000 });
  await wait(2500);
  await caption(page, "<b>Nemotron 3.5 Lightning</b> ranks the rest against your skills<small>then each pick gets the full analysis</small>");
  await page.locator("text=/^Done ·/").waitFor({ timeout: 600_000 });
  mark("scan-done");
  await wait(600);
  await smoothScroll(page, 330, 1200);
  await caption(page, "<b>NOW · NEXT · PARK</b> — what to apply for this week, later, or never.");
  await wait(4800);
  await caption(page, null);

  // 7 · Memory
  await clickOn(page, page.getByRole("link", { name: "Memory" }), 900);
  await page.waitForURL("**/memory");
  mark("memory");
  await wait(600);
  await clickOn(page, page.getByRole("tab", { name: "Rules" }), 800);
  await caption(page, "It remembers your verdicts and your blacklist — and every rule is an editable skill.");
  await wait(4600);
  await caption(page, null);

  // 8 · End card
  await page.setContent(
    card(
      "Opportunity Shield",
      "Less time on bait. More time on work that pays.",
      `<div class="x">Live demo&nbsp; <span>${LIVE_URL.replace("https://", "")}</span><br>Code (MIT)&nbsp; <span>${REPO_URL.replace("https://", "")}</span><br><span style="color:#9aa5b8">NVIDIA Nemotron on Nebius Token Factory · Tavily</span></div>`,
    ),
  );
  mark("end");
  await wait(6500);
}

const video = page.video();
await context.close();
const raw = await video!.path();
const target = path.join(OUT, `${MODE}-raw.webm`);
fs.renameSync(raw, target);
fs.writeFileSync(path.join(OUT, `${MODE}-scenes.json`), JSON.stringify(scenes, null, 2));
console.log("raw:", target);
console.log(scenes.map((s) => `${s.at.toFixed(1)}s ${s.name}`).join("\n"));
await browser.close();
