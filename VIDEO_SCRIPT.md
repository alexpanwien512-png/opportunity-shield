# Video script: Opportunity Shield (max 3:00)

**Format:** a screen recording of the live demo URL, with your voice over it. The voiceover is in English, because the judges are international. Read it at a calm pace: about 400 words for 3 minutes.

**Prep before recording:**
- Run `npm run warm -- <demo-url>` so the three demo links answer instantly.
- Then do one "Re-analyze fresh" on camera, so viewers see a live run.

---

## 0:00–0:25 · The problem (a real trap)

**Screen:** GitHub issue `SecureBananaLabs/bug-bounty#76`. Scroll slowly past "/bounty $430", "Add a poem…", "Important: Star the repository", then the comment flood.

> "This is a real GitHub bounty: $430 to write a poem. The catch is one line: 'Star the repository.' It has over 250 comments, mostly people claiming it. The repo is five months old and has over eight thousand pull requests. It's a star farm. Bounty boards are full of these now: fake 'test bounties' paid 'by DM', region-locked listings, prizes that turn out to be credits. Developers, and now AI agents, waste days on them."

## 0:25–0:40 · What it is

**Screen:** the Opportunity Shield home page.

> "Opportunity Shield is a personal AI agent that vets an opportunity *for you*. It checks whether you're actually eligible, what the prize really is, and whether it's a trap. Every accusation is backed by a quote from the page."

## 0:40–1:10 · Demo 1: AVOID

**Screen:** paste the #76 URL, then Analyze. The progress steps appear, then the red verdict card. Hover over the evidence quotes.

> "Paste the link. Tavily extracts the page, and GitHub's API adds the repo's age and PR count. Nemotron Lightning pulls out the facts. Then eighteen deterministic red-flag rules run. **Avoid**: star farming, a non-technical task in a code repo, sixty-plus /attempt claims, and a PR volume no real project has. Each flag shows its evidence."

## 1:10–1:45 · Demo 2: CAUTION (the bait-and-switch)

**Screen:** the `$CHIMP` Superteam listing, then its report. Zoom in on the "Listing edited after publication" flag.

> "This one pays real USDC. It's a writing bounty for a token sale, from an unverified sponsor, with 242 submissions for 14 prizes. And there's something no one would spot by eye. The Tavily snapshot says 2,000 USDC in prizes, but the live listing says 500. The prize pool was cut by 75% after people started working. **Caution**, with an expected value of about thirty cents an hour."

## 1:45–2:10 · Demo 3: APPLY and Scan

**Screen:** the Nebius x NVIDIA hackathon, which comes up green. Point at the per-place prizes, including "Best Use of Tavily $3,000". Then the Scan tab: click Run scan and show the NOW / NEXT / PARK board filling in, plus the "filtered out" list.

> "And a real one: this hackathon is open to you, pays cash per place, and has no red flags. **Apply.** The Scan tab does this on its own. It finds open listings with Tavily Search and drops expired or region-locked ones using platform data. Nemotron then ranks the rest against your skills, and each one gets the full analysis."

## 2:10–2:40 · Where Nemotron and Tavily work

**Screen:** the README "How it works" diagram, or a simple slide.

> "Everything runs on Nebius Token Factory. Nemotron 3.5 Lightning handles fast structured extraction and scan triage. Nemotron 3 Ultra makes the final call. Ultra can only be *stricter* than the rules, and only with evidence of the right kind. Here it caught a 'hackathon' that was secretly for high-schoolers only. It was also stopped from flagging 'Token Factory' as a crypto token. Tavily is how the agent sees the web: Extract for every page, Search for discovery and sponsor checks."

## 2:40–3:00 · Impact

**Screen:** the Memory tab (history, blacklist, editable rules), then back to the home page.

> "It remembers your profile, your verdicts and your blacklist, and the rules are editable skills. The result is less time on bait and more time on work that pays. Opportunity Shield: open source, MIT, running live on Nebius."

---

### Shot checklist
- [ ] Browser zoomed to 125%, light theme, no bookmarks bar
- [ ] Demo profile: Austria, typescript/python/react/llm agents, $40/h
- [ ] Three links ready to paste: #76, chimp-on-metaplex, nebiusglobalaihackathon
- [ ] A scan run ahead of time with a limit of 6, so the board fills quickly on camera
- [ ] End card: repo URL + demo URL
