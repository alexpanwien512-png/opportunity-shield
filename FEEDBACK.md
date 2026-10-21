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

### API
- _To fill in once keys are configured: latency per model, JSON-schema adherence, errors seen._

## NVIDIA Nemotron
- _To fill in after extraction/verdict runs: schema adherence, quote fidelity (verbatim vs. paraphrased), reasoning latency and token cost, failure modes._

## Tavily

### Documentation
- Good: `llms.txt` points to every endpoint's reference page, and the parameter tables are complete. The `failed_results` behaviour on HTTP 200 is called out explicitly, which is helpful.
- **Extract `advanced` is vague about JavaScript-rendered pages.** The docs promise "more data, tables, embedded content" but never say whether client-side-rendered SPAs are supported. That matters for Superteam Earn, which is a Next.js app.
- **Extract with `query` silently changes the output shape.** You get reranked chunks instead of the full page. That's easy to miss when you want both full text and relevance.
- **The rate-limit page doesn't state the monthly free credits.**

### API
- _To fill in once keys are configured: extract success rate per platform, latency, credit usage._

## Platform data notes (not sponsor tools, but relevant to the build)
- Superteam Earn exposes public JSON: `/api/listings/details/<slug>` and `/api/listings/<id>/submission-count`. It includes `isVerified` for the sponsor and `region`. This data is more reliable than scraping.
- The Devpost `api/hackathons?search=` endpoint matches titles only, not subdomains. Searching for `nebiusglobalaihackathon` returns 0 results, while "nebius global ai hackathon" works. So the title comes from the Tavily extraction first.
