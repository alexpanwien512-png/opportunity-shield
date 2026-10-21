# Opportunity Shield

**A personal AI agent that vets paid opportunities and exposes the traps.** You paste a hackathon, bounty or GitHub issue. Opportunity Shield reads it and checks whether *you* are actually eligible: region, format, preconditions. It works out the real prize per place and your expected value per hour. It also flags bait, with each flag backed by a quote from the page:

- star, follow or fork farms
- fake "test bounties" that pay "by DM"
- listings restricted to one region
- prizes paid in credits or services instead of money
- token-presale shilling
- 241 submissions competing for 14 prizes

Built for the **Nebius x NVIDIA Global AI Hackathon** (track: Personal AI).

> Status: MVP. "Analyze URL" works end-to-end on the 7 real demo cases, and the tests pass. Scan (NOW / NEXT / PARK), persistent memory and the profile page come next.

## How it works

```
URL ─▶ Tavily Extract ──────────┐   page text: every quote must be found here
    ├▶ platform JSON APIs ──────┤   GitHub / Superteam Earn / Devpost: counts, region, sponsor status
    └▶ Tavily Search (sponsor) ─┤   scam / presale / complaint reports
                                ▼
              Nemotron (fast) ─ structured extraction (JSON schema): prizes, region, preconditions, quotes
                                ▼
              Rule engine ───── 17 deterministic red-flag "skills" (editable params + severity)
                                │  a flag without verbatim evidence is dropped
                                ▼
              EV model ──────── P(win) = prizes / (competitors + 1); EV/hour vs. your rate
                                ▼
              Nemotron (reasoning) ─ final APPLY / CAUTION / AVOID + summary
                                     • can only be *stricter* than the rule ceiling
                                     • extra flags kept only if their quote is on the page
```

### Where Nemotron, Token Factory and Tavily are used

| Component | Used for | Code |
|---|---|---|
| **Nebius Token Factory** | OpenAI-compatible endpoint `https://api.tokenfactory.nebius.com/v1/`, structured output via `response_format: json_schema` | [`src/lib/shield/live.ts`](src/lib/shield/live.ts) |
| **Nemotron (fast)** | Extracts prizes per place, cash vs. non-cash, region, preconditions, judging, effort estimate and verbatim quotes. Thinking is disabled. | [`src/lib/shield/llm.ts`](src/lib/shield/llm.ts) `extractFacts` |
| **Nemotron (reasoning, Ultra)** | Final verdict over profile + facts + flags + EV, with thinking enabled. Capped by the deterministic rule ceiling. | [`src/lib/shield/llm.ts`](src/lib/shield/llm.ts) `judge` |
| **Tavily Extract** (`advanced`) | The page text every piece of evidence is checked against. Devpost listings also extract `/rules`. | [`src/lib/shield/sources.ts`](src/lib/shield/sources.ts) `fetchSource` |
| **Tavily Search** | Sponsor reputation checks (scam / rug / presale reports) and, next, discovery for Scan | [`src/lib/shield/sources.ts`](src/lib/shield/sources.ts) `researchSponsor` |

Model IDs are set in `.env` (`NEMOTRON_FAST_MODEL`, `NEMOTRON_REASONING_MODEL`). `npm run models` checks them against `GET /v1/models`.

### Why hybrid (rules + LLM)?

A bounty scanner that can hallucinate an accusation is useless. In Opportunity Shield the deterministic rules set a verdict ceiling, and the model can only be stricter than that ceiling. A flag shows up only when its quote is actually on the fetched page or comes from a platform API. If Token Factory or Tavily is down, the analysis still returns a rules-only verdict and says so.

## Red-flag rules

| Rule | Severity |
|---|---|
| Blacklisted repo / sponsor | critical |
| Asks you to star / follow / fork | critical |
| "Test bounty" | critical |
| Payment via DM / Telegram / crypto without escrow | critical |
| PR / issue volume out of proportion to repo age (bounty farm) | critical |
| Region outside your country | critical |
| Prize in credits / services / discount | critical |
| Absurd reward for a trivial task | high |
| Non-technical task in a code repo | high |
| More than 20 `/attempt` claims | high |
| Sponsor linked to scam reports (Tavily Search) | high |
| Token / presale promotion | high |
| Requires an existing project | high |
| Bounty only as a `/bounty $X` line, no escrow bot | medium |
| Unverified sponsor | medium |
| Judged on engagement (likes / reposts) | medium |
| Disproportionate competition (> 15 entries per prize) | medium |

The ceiling works like this:

- any critical flag, or three or more high flags → **AVOID**
- any high flag, or two or more medium flags → **CAUTION**
- otherwise → **APPLY**

Patterns and thresholds live in [`src/lib/shield/rules.ts`](src/lib/shield/rules.ts) as data, so they can be edited.

## Setup

Requires Node.js 22+.

```bash
git clone <this repo> && cd opportunity-shield
npm install
cp .env.example .env   # then fill NEBIUS_API_KEY and TAVILY_API_KEY
npm run models         # verifies the configured Nemotron model IDs exist on Token Factory
npm run dev -- -p 3100 # http://localhost:3100
```

### Tests

```bash
npm test               # offline: replays recorded fixtures of the 7 real cases + rule unit tests
npm run capture        # live: re-runs all cases against GitHub/Superteam/Devpost, Tavily and Nemotron, re-records fixtures
```

| Demo case | Expected |
|---|---|
| [SecureBananaLabs #76](https://github.com/SecureBananaLabs/bug-bounty/issues/76): $430 to write a poem, "Star the repository", 8k PRs in 5 months | AVOID |
| [SecureBananaLabs #743](https://github.com/SecureBananaLabs/bug-bounty/issues/743): recursive "create more issues" farm | AVOID |
| [bookningsapp #1](https://github.com/jomaaabbe78-spec/bookningsapp/issues/1): "[TEST BOUNTY]", $50 for a typo, "DM for payment details" | AVOID |
| [Superteam travel boost](https://superteam.fun/earn/listing/travel-boost-for-bp26): Germany only (profile: Austria) | AVOID |
| [Vaultline audit grants](https://superteam.fun/earn/listing/vaultline-security-audit-grants-for-colosseum-projects-up-to-4000-usdc-each): "not paid out as cash" | AVOID |
| [$CHIMP thread](https://superteam.fun/earn/listing/chimp-on-metaplex): token sale promo, unverified sponsor, 241 submissions for 14 prizes | CAUTION |
| [Nebius x NVIDIA Global AI Hackathon](https://nebiusglobalaihackathon.devpost.com) | APPLY |

## License

[MIT](LICENSE)
