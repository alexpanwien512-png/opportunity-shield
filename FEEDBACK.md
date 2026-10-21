# Feedback: Nebius Token Factory, NVIDIA Nemotron, Tavily

These are notes I kept while building Opportunity Shield, written as they happened. Each one says what was hard or unclear and what I would change.

## Nebius Token Factory

### Documentation
- **The model catalog is hard to pin down.** The quickstart has no link to a models page. The "List of models" example only shows Llama 3.1 IDs, none of them NVIDIA. The Nemotron landing page (nebius.com/services/token-factory/nemotron) gives an exact ID only for Super (`nvidia/nemotron-3-super-120b-a12b`). I found the Ultra ID only on third-party price aggregators.
  - *Suggestion:* publish a static, versioned table of model IDs in the docs, with context length, JSON-mode and tool-call support, and reasoning toggle. Link it from the quickstart.
- **Deprecation notices are the best source of new model names.** `nvidia/Nemotron-3_5-Lightning` appears only as a replacement in the August 2026 deprecation notice, and I could not find a model card for it in the docs.
- **The JSON mode page has broken examples.** The Python snippet is missing a comma after `"type": "json_schema"`. One cURL example writes `"response format"` with a space. Two examples wrap the schema differently: a raw schema in one, `{name, schema, strict}` in the other. It's unclear which shape the API expects.
  - *Suggestion:* pick one shape (the OpenAI-compatible `{name, schema, strict}`) and test the snippets in CI.
- **No reasoning page.** Nemotron 3 models switch thinking on and off through the chat template (`enable_thinking`). The docs don't say whether Token Factory accepts `chat_template_kwargs` or returns `reasoning_content`.
  - *Suggestion:* add a "Reasoning models" page covering the toggle, the response field and how reasoning tokens are billed.
- **The rate-limit page is clear about dynamic scaling** (15-minute windows, +20% at 80% usage) but lists no per-tier numbers. The 60 RPM / 400k TPM figure is only an example.

### API (observed 2026-10-21)
- **`GET /v1/models?verbose=true` is excellent.** It returns context length, quantization, price, per-model RPM/TPM, region and `supported_features`. It answered every question the docs left open. *Suggestion:* link it from the quickstart and from every model page.
- **`supported_features` lists only `tools` and `reasoning`** for all Nemotron models, yet `response_format: json_schema` with `strict: true` worked on both Lightning and Ultra. *Suggestion:* add `json_schema` to `supported_features` so clients can detect it.
- **Per-model limits differ a lot and appear only in that endpoint:** Lightning 600 RPM / 400k TPM, Ultra 300 RPM / 200k TPM, Nano 30B 100 RPM.
- **Ultra latency varies widely.** For the same small request (a GitHub issue), the verdict call took 4.5 s in one run and 70–130 s in others. With 9 Ultra calls in flight it took 120–160 s per call, and one call failed, so our pipeline fell back to the rules-only verdict. No rate-limit headers or 429s explained the slowdown. *Suggestion:* expose queue time (e.g. `x-queue-time-ms`) so clients can tell queuing from generation.
- Ultra is served from `us-central1` and Lightning from `eu-north1`. From Europe that adds round-trip time to the reasoning call.

## NVIDIA Nemotron
- **Nemotron-3.5-Lightning (extraction)** returned schema-valid JSON on all 7 cases. It took 2–4 s on short pages and 7–16 s on a 50k-char hackathon rulebook.
  - **String `"null"` instead of JSON null.** In one run `regionRestriction` came back as the string `"null"` despite the `["string","null"]` schema. Our code read it as a region literally named "null" and flagged the Nebius hackathon as region-restricted. We now normalize `"null"`, `"N/A"` and `"none"`. *Suggestion:* constrained decoding should prefer the JSON `null` token when the schema allows it.
  - **Classifying a README typo fix as `content`** is defensible but too broad for our rule, so we only trust the `social` category.
- **Nemotron-3-Ultra (verdict)** reasoned well. Unprompted, it spotted that a listing's prize pool had been cut from 2,000 to 500 USDC.
  - **Unstable at temperature 0.6** (the usual reasoning default): the same inputs gave CAUTION / AVOID / APPLY across runs. At 0.3, and with an explicit rubric, it was stable in every repeat we ran.
  - **No notion of today's date.** It worried that "the hackathon starts August 26, 2026; terms could change" two months after that date. Injecting today's date fixed it.
  - **Treats standard legal boilerplate as risk** (rule amendments, prize substitution, arbitration) once it sees a full rulebook. A one-line rubric note fixed it.
  - **It reads the product name "Token Factory" as a token sale.** In one run it downgraded the Nebius hackathon itself to CAUTION, citing "Nebius Token Factory" as evidence of "token promotion". A verbatim-quote check doesn't catch this, so we now require evidence that matches the kind of claim (e.g. the token-promotion pattern). Ironically, the product name works against Nebius in LLM-based risk classifiers.
  - **Lightning triage over-filters from search snippets alone.** Given only Tavily snippets, it dropped every Superteam candidate and invented reasons ("closed past event"). Feeding it platform facts (status, region, deadline) and saying "when unsure, keep" fixed it.
  - **Quotes are not always verbatim.** It paraphrased or merged sentences in several `additionalFlags` (e.g. `"242 submissions, 14 prizes"`, which never appears on the page). Our verbatim check drops these. *Suggestion:* a documented "quote-only" or citation mode would make Nemotron much easier to use for evidence-based agents.

## Tavily

### Documentation
- Good: `llms.txt` points to every endpoint's reference page, and the parameter tables are complete. The `failed_results` behaviour on HTTP 200 is called out explicitly, which is helpful.
- **Extract `advanced` is vague about JavaScript-rendered pages.** The docs promise "more data, tables, embedded content" but never say whether client-side-rendered SPAs are supported. That matters for Superteam Earn, which is a Next.js app.
- **Extract with `query` silently changes the output shape.** You get reranked chunks instead of the full page. That's easy to miss when you want both full text and relevance.
- **The rate-limit page doesn't state the monthly free credits.**

### API (observed 2026-10-21)
- **Extract returned a stale snapshot.** For the Superteam listing `chimp-on-metaplex`, Extract (`advanced`) returned an older version: a different title ("Launching on Metaplex" instead of "Fair Launch") and a prize pool of 2,000 USDC instead of the live 500 USDC. Search returned the same stale text. Extract has no `fetched_at` / cache-age field and no "bypass cache" option. *Suggestion:* return the snapshot timestamp and offer `fresh: true`. We turned the mismatch into a feature: a "listing edited after publication" red flag.
- **Extract drops prize amounts on Devpost.** The main page renders amounts as `$<span data-currency-value>20,000</span> in cash`. In both `markdown` and `text` formats, at both `basic` and `advanced` depth, the output kept "Grand Prize / 2nd Place" but lost every amount. The same amounts survive in the `/rules` table, so we parse that instead.
- **Search `advanced` with `include_domains` is very good for targeted facts.** One query restricted to the hackathon subdomain returned the exact prize table as its top chunk.
- **Search results vary a lot between identical calls.** The same `include_domains: ["devpost.com"]`, `time_range: "month"` query returned 2 project pages in one run and 10 hackathon microsites in another (with different wording). Phrasing also matters: "open for submissions" surfaces `devpost.com/software/*` project pages instead of hackathons. *Suggestion:* a `url_pattern` or path filter (e.g. `*.devpost.com/` but not `/software/`) would make domain-scoped discovery much more reliable. We complement Search with the platforms' open-listing feeds.
- Latency: Extract 0.9–2.2 s per URL. Search ~1 s.

## Platform data notes (not sponsor tools, but relevant to the build)
- Devpost subdomain pages return HTTP 403 to non-browser user agents, so Tavily is the sanctioned way to read them.
- Superteam Earn exposes public JSON: `/api/listings/details/<slug>` and `/api/listings/<id>/submission-count`. It includes `isVerified` for the sponsor and `region`. This data is more reliable than scraping.
- The Devpost `api/hackathons?search=` endpoint matches titles only, not subdomains. Searching for `nebiusglobalaihackathon` returns 0 results, while "nebius global ai hackathon" works. So the title comes from the Tavily extraction first.
