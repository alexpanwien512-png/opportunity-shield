// Captures every page (desktop + mobile, dark + light) and a verdict for each demo example.
// Usage: npm run screenshots [-- <base-url>]   (default http://localhost:3100)
// Writes PNGs to docs/screenshots/. The first run of each example is a live analysis; later runs hit the cache.
import fs from "node:fs";
import { chromium, type Browser, type Page } from "playwright";

const BASE = (process.argv[2] ?? "http://localhost:3100").replace(/\/$/, "");
const OUT = "docs/screenshots";
const only = process.env.ONLY; // e.g. ONLY=pages or ONLY=verdicts
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } } as const;
type Theme = "dark" | "light";

const EXAMPLES = [
  ["poem-star-farm", "https://github.com/SecureBananaLabs/bug-bounty/issues/76"],
  ["test-bounty-dm", "https://github.com/jomaaabbe78-spec/bookningsapp/issues/1"],
  ["germany-only", "https://superteam.fun/earn/listing/travel-boost-for-bp26"],
  ["audit-not-cash", "https://superteam.fun/earn/listing/vaultline-security-audit-grants-for-colosseum-projects-up-to-4000-usdc-each"],
  ["chimp-token-promo", "https://superteam.fun/earn/listing/chimp-on-metaplex"],
  ["nebius-hackathon", "https://nebiusglobalaihackathon.devpost.com"],
] as const;

async function newPage(browser: Browser, vp: keyof typeof VIEWPORTS, theme: Theme, opts: { onboarded?: boolean; storage?: string } = {}) {
  const context = await browser.newContext({ viewport: VIEWPORTS[vp], deviceScaleFactor: 2, colorScheme: theme, storageState: opts.storage });
  await context.addInitScript(
    ([t, onboarded]) => {
      localStorage.setItem("theme", t as string);
      if (onboarded) localStorage.setItem("onboarded-v1", "1");
    },
    [theme, !!opts.onboarded] as const,
  );
  return { context, page: await context.newPage() };
}

async function shot(page: Page, name: string, fullPage = true) {
  await page.waitForTimeout(1400); // let entrance animations and count-ups settle
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
  console.log("✓", name);
}

async function waitForVerdict(page: Page) {
  await page.locator("#verdict-title").waitFor({ timeout: 180_000 });
}

const browser = await chromium.launch();
const storage = `${OUT}/.storage.json`;

// 1) Verdicts for the six examples (desktop dark first: does the live runs and fills this visitor's history).
if (!only || only === "verdicts") {
  const { context, page } = await newPage(browser, "desktop", "dark", { onboarded: true });
  for (const [name, url] of EXAMPLES) {
    await page.goto(`${BASE}/?url=${encodeURIComponent(url)}`);
    await waitForVerdict(page);
    await shot(page, `verdict-${name}-desktop-dark`);
  }
  await context.storageState({ path: storage });
  await context.close();
  for (const [vp, theme] of [["desktop", "light"], ["mobile", "dark"], ["mobile", "light"]] as const) {
    const { context: c, page: p } = await newPage(browser, vp, theme, { onboarded: true, storage });
    for (const [name, url] of EXAMPLES) {
      await p.goto(`${BASE}/?url=${encodeURIComponent(url)}`);
      await waitForVerdict(p);
      await shot(p, `verdict-${name}-${vp}-${theme}`);
    }
    await c.close();
  }
}

// 2) Live agent timeline, mid-analysis (forces a fresh run of one example).
if (!only || only === "timeline") {
  const { context, page } = await newPage(browser, "desktop", "dark", { onboarded: true });
  await page.goto(`${BASE}/`);
  await page.fill("#url", EXAMPLES[2][1]);
  await page.evaluate(async (url) => {
    // Bypass the cache so the timeline actually runs.
    await fetch("/api/history?url=" + encodeURIComponent(url), { method: "DELETE" });
  }, EXAMPLES[2][1]);
  await page.route("**/api/analyze", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}");
    await route.continue({ postData: JSON.stringify({ ...body, force: true }) });
  });
  await page.press("#url", "Enter");
  await page.locator("text=Final verdict · Nemotron 3 Ultra").waitFor();
  await page.waitForFunction(() => document.querySelectorAll('ol[aria-label="Analysis progress"] .spin').length > 0 && !!document.body.innerText.match(/Hunting red flags[\s\S]*red flag/), null, { timeout: 120_000 });
  await page.screenshot({ path: `${OUT}/timeline-live-desktop-dark.png` });
  console.log("✓ timeline-live-desktop-dark");
  await waitForVerdict(page);
  await context.close();
}

// 3) Every page, desktop + mobile, dark + light.
if (!only || only === "pages") {
  for (const vp of ["desktop", "mobile"] as const) {
    for (const theme of ["dark", "light"] as const) {
      // Home as a first-time visitor (onboarding visible).
      {
        const { context, page } = await newPage(browser, vp, theme);
        await page.goto(`${BASE}/`);
        await shot(page, `home-${vp}-${theme}`, false);
        await page.goto(`${BASE}/scan`);
        await shot(page, `scan-empty-${vp}-${theme}`);
        await page.goto(`${BASE}/memory`);
        await shot(page, `memory-empty-${vp}-${theme}`);
        await context.close();
      }
      // Returning visitor (has history from the verdict runs).
      {
        const { context, page } = await newPage(browser, vp, theme, { onboarded: true, storage: fs.existsSync(storage) ? storage : undefined });
        await page.goto(`${BASE}/`);
        await shot(page, `home-returning-${vp}-${theme}`);
        await page.goto(`${BASE}/memory`);
        await shot(page, `memory-history-${vp}-${theme}`);
        await page.getByRole("tab", { name: "Rules" }).click();
        await shot(page, `memory-rules-${vp}-${theme}`);
        await page.goto(`${BASE}/profile`);
        await shot(page, `profile-${vp}-${theme}`);
        await context.close();
      }
    }
  }
}

// 4) A real scan (desktop dark), then the same results re-themed and on mobile.
if (!only || only === "scan") {
  const { context, page } = await newPage(browser, "desktop", "dark", { onboarded: true, storage: fs.existsSync(storage) ? storage : undefined });
  await page.goto(`${BASE}/scan`);
  await page.selectOption("select", "6");
  await page.getByRole("button", { name: /Run scan/ }).first().click();
  await page.locator("text=/^Done ·/").waitFor({ timeout: 600_000 });
  await shot(page, "scan-results-desktop-dark");
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  await shot(page, "scan-results-desktop-light");
  await page.setViewportSize(VIEWPORTS.mobile);
  await shot(page, "scan-results-mobile-light");
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await shot(page, "scan-results-mobile-dark");
  await context.close();
}

await browser.close();
// Partial runs (ONLY=…) keep the visitor session so a later "pages" run shows a real history.
if (!only) fs.rmSync(storage, { force: true });
