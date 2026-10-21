// Live IO: GitHub/Superteam/Devpost JSON APIs, Tavily, and Nebius Token Factory.
import OpenAI from "openai";
import { tavily } from "@tavily/core";
import type { IO, LlmRequest, TavilySearchOptions } from "./io";
import type { SearchHit } from "./types";
import { config } from "./config";

const UA = "opportunity-shield/0.1 (+https://github.com/)";

export async function httpJson(url: string): Promise<unknown> {
  const headers: Record<string, string> = { "User-Agent": UA, Accept: "application/json" };
  if (url.startsWith("https://api.github.com/") && config.githubToken) {
    headers.Authorization = `Bearer ${config.githubToken}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

let tavilyClient: ReturnType<typeof tavily> | null = null;
function tv() {
  if (!config.tavilyApiKey) throw new Error("TAVILY_API_KEY is not set");
  tavilyClient ??= tavily({ apiKey: config.tavilyApiKey });
  return tavilyClient;
}

export async function tavilyExtract(url: string): Promise<string | null> {
  // Advanced depth: listing pages hide prizes/eligibility in tables and embeds.
  const res = await tv().extract([url], { extractDepth: "advanced", format: "markdown", timeout: 45 });
  if (res.failedResults?.length) console.warn("tavily extract failed", res.failedResults);
  return res.results?.[0]?.rawContent ?? null;
}

export async function tavilySearch(query: string, opts: TavilySearchOptions = {}): Promise<SearchHit[]> {
  const res = await tv().search(query, {
    searchDepth: opts.depth ?? "basic",
    maxResults: opts.maxResults ?? 5,
    ...(opts.includeDomains?.length ? { includeDomains: opts.includeDomains } : {}),
    ...(opts.timeRange ? { timeRange: opts.timeRange } : {}),
  });
  return res.results.map((r) => ({ title: r.title, url: r.url, content: r.content, score: r.score }));
}

let nebius: OpenAI | null = null;
function llm() {
  if (!config.nebiusApiKey) throw new Error("NEBIUS_API_KEY is not set");
  nebius ??= new OpenAI({ baseURL: config.nebiusBaseUrl, apiKey: config.nebiusApiKey, maxRetries: 3 });
  return nebius;
}

/** Strips reasoning traces and code fences that some models emit around JSON. */
export function parseModelJson(content: string): unknown {
  let text = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const start = text.search(/[{[]/);
  if (start > 0) text = text.slice(start);
  return JSON.parse(text);
}

export async function llmJson(req: LlmRequest): Promise<unknown> {
  const body = {
    model: req.model,
    messages: req.messages,
    temperature: req.reasoning ? 0.6 : 0.1,
    max_tokens: req.maxTokens ?? (req.reasoning ? 8000 : 3000),
    response_format: {
      type: "json_schema",
      json_schema: { name: req.schemaName, schema: req.schema, strict: true },
    },
    // Nemotron 3 toggles reasoning through its chat template.
    chat_template_kwargs: { enable_thinking: !!req.reasoning },
  };
  const completion = await llm().chat.completions.create(
    body as unknown as OpenAI.ChatCompletionCreateParamsNonStreaming,
  );
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error(`Empty completion from ${req.model}`);
  return parseModelJson(content);
}

export const liveIO: IO = { httpJson, tavilyExtract, tavilySearch, llmJson };
