// Devpost gallery images: dark mode, 1920×1080 desktop and 390×844 mobile (3× density), plus a 1500×1000 thumbnail.
// Usage: node --import tsx scripts/media/devpost-shots.mts [base-url]   (default http://localhost:3300)
import fs from "node:fs";
import { chromium, type Page } from "playwright";

const BASE = (process.argv[2] ?? "http://localhost:3300").replace(/\/$/, "");
const OUT = "docs/screenshots";
fs.mkdirSync(OUT, { recursive: true });

const URLS = {
  apply: "https://nebiusglobalaihackathon.devpost.com",
  avoid: "https://github.com/SecureBananaLabs/bug-bounty/issues/76",
  caution: "https://superteam.fun/earn/listing/chimp-on-metaplex",
  live: "https://superteam.fun/earn/listing/travel-boost-for-bp26",
};

const browser = await chromium.launch();
const VIEWPORTS = [
  { name: "desktop", viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  { name: "mobile", viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 },
] as const;

async function settle(page: Page, ms = 1600) {
  await page.waitForTimeout(ms); // entrance animations, count-ups, gauge
}

async function verdict(page: Page, url: string) {
  await page.goto(`${BASE}/?url=${encodeURIComponent(url)}`);
  await page.locator("#verdict-title").waitFor({ timeout: 180_000 });
  await settle(page);
}

// Warm-up: the first request after a cold start can be slow.
await fetch(`${BASE}/api/health`).catch(() => {});

for (const vp of process.env.ONLY === "thumbnail" ? [] : VIEWPORTS) {
  const context = await browser.newContext({ viewport: vp.viewport, deviceScaleFactor: vp.deviceScaleFactor, colorScheme: "dark" });
  await context.addInitScript(() => {
    localStorage.setItem("theme", "dark");
    localStorage.setItem("onboarded-v1", "1");
  });
  const page = await context.newPage();
  const shot = async (name: string) => {
    await page.screenshot({ path: `${OUT}/devpost-${name}-${vp.name}.png` });
    console.log("✓", `devpost-${name}-${vp.name}`);
  };

  // Verdicts first: they also fill this visitor's history for the home page.
  await verdict(page, URLS.avoid);
  await shot("verdict-avoid");
  await verdict(page, URLS.caution);
  await shot("verdict-caution");
  await verdict(page, URLS.apply);
  await shot("verdict-apply");

  await page.goto(`${BASE}/`);
  await page.locator("#url").blur();
  await settle(page, 2500); // let the network field start
  await shot("home");

  // Live timeline: force a fresh run and capture while Nemotron Ultra is reasoning.
  await page.route("**/api/analyze", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}");
    await route.continue({ postData: JSON.stringify({ ...body, force: true }) });
  });
  await page.fill("#url", URLS.live);
  await page.press("#url", "Enter");
  await page.locator('ol[aria-label="Analysis progress"] li:has-text("Final verdict") .spin').waitFor({ timeout: 120_000 });
  await page.waitForTimeout(400);
  await shot("timeline-live");
  await page.locator("#verdict-title").waitFor({ timeout: 180_000 });
  await page.unroute("**/api/analyze");

  await page.goto(`${BASE}/profile`);
  await settle(page);
  await shot("profile");

  await page.goto(`${BASE}/scan`);
  await page.getByRole("button", { name: /Run scan/ }).first().click();
  await page.locator("text=/^Done ·/").waitFor({ timeout: 600_000 });
  await settle(page);
  if (vp.name === "desktop") await page.evaluate(() => window.scrollTo(0, 300));
  else await page.locator('[role="tablist"][aria-label="Results"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await shot("scan");

  await context.close();
}

// Thumbnail 1500×1000: name + tagline + a real verdict card cut from the app.
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, colorScheme: "dark" });
  await context.addInitScript(() => {
    localStorage.setItem("theme", "dark");
    localStorage.setItem("onboarded-v1", "1");
  });
  const page = await context.newPage();
  // Only the verdict header row (gauge + badge + plain-language sentence): no model prose on the cover.
  const head = 'section[aria-labelledby="verdict-title"]';
  await verdict(page, URLS.live);
  await page.evaluate((sel) => {
    document.querySelectorAll(`${sel} > :not(:first-child)`).forEach((el) => ((el as HTMLElement).style.display = "none"));
    document.querySelectorAll(`${sel} span`).forEach((el) => el.textContent === "from memory" && ((el as HTMLElement).style.display = "none"));
  }, head);
  const avoidCard = await page.locator(head).screenshot();
  await verdict(page, URLS.apply);
  await page.evaluate((sel) => {
    document.querySelectorAll(`${sel} > :not(:first-child)`).forEach((el) => ((el as HTMLElement).style.display = "none"));
    document.querySelectorAll(`${sel} span`).forEach((el) => el.textContent === "from memory" && ((el as HTMLElement).style.display = "none"));
  }, head);
  const applyCard = await page.locator(head).screenshot();
  await context.close();

  const thumb = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1 });
  await thumb.setContent(`<!doctype html><html><head><style>
    body{margin:0;width:1500px;height:1000px;overflow:hidden;font-family:-apple-system,"Geist","Inter",system-ui,sans-serif;color:#e6eaf2;
      background:linear-gradient(rgba(148,163,184,.06) 1px,transparent 1px) 0 0/40px 40px,linear-gradient(90deg,rgba(148,163,184,.06) 1px,transparent 1px) 0 0/40px 40px,radial-gradient(ellipse at 20% 0%,#0f2a2c 0%,#0a0f1c 55%) ;}
    .wrap{position:absolute;inset:0;padding:84px 90px;display:flex;flex-direction:column}
    .brand{display:flex;align-items:center;gap:22px}
    .name{font-size:76px;font-weight:700;letter-spacing:-2px}
    .tag{margin-top:22px;font-size:36px;color:#9aa5b8;max-width:1100px;line-height:1.3}
    .tag b{color:#2dd4bf;font-weight:600}
    .cards{margin-top:48px;display:flex;flex-direction:column;gap:22px}
    .card{width:1320px;border-radius:28px;box-shadow:0 30px 80px -20px rgba(0,0,0,.7)}
    .foot{margin-top:auto;display:flex;gap:16px;align-items:center;font-size:26px;color:#9aa5b8}
    .pill{padding:8px 18px;border-radius:999px;font-weight:700;font-size:24px;letter-spacing:1px}
  </style></head><body><div class="wrap">
    <div class="brand"><svg width="84" height="84" viewBox="0 0 32 32"><path d="M16 2.5 27 6.5v8.2c0 7-4.6 12.3-11 14.8C9.6 27 5 21.7 5 14.7V6.5L16 2.5Z" fill="none" stroke="#2dd4bf" stroke-width="1.8"/><path d="M16 9.5 21 15l-5 5.5-5-5.5L16 9.5Z" fill="#2dd4bf"/></svg><div class="name">Opportunity Shield</div></div>
    <div class="tag">A personal AI agent that vets bounties &amp; hackathons — <b>every red flag backed by a quote</b>.</div>
    <div class="cards">
      <img class="card" src="data:image/png;base64,${avoidCard.toString("base64")}">
      <img class="card" src="data:image/png;base64,${applyCard.toString("base64")}">
    </div>
    <div class="foot">
      <span class="pill" style="background:rgba(52,211,153,.12);color:#34d399">✓ APPLY</span>
      <span class="pill" style="background:rgba(251,191,36,.12);color:#fbbf24">! CAUTION</span>
      <span class="pill" style="background:rgba(251,113,133,.12);color:#fb7185">⊘ AVOID</span>
      <span style="margin-left:auto">NVIDIA Nemotron on Nebius Token Factory · Tavily</span>
    </div>
  </div></body></html>`);
  await thumb.waitForTimeout(300);
  await thumb.screenshot({ path: `${OUT}/devpost-thumbnail.png` });
  console.log("✓ devpost-thumbnail");
}

await browser.close();
