// All network I/O goes through this interface so the pipeline can run live,
// record its calls into a fixture, or replay a fixture offline in tests.
import fs from "node:fs";
import path from "node:path";
import type { SearchHit } from "./types";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmRequest {
  model: string;
  messages: ChatMessage[];
  schema: Record<string, unknown>;
  schemaName: string;
  reasoning?: boolean;
  maxTokens?: number;
}

export interface TavilySearchOptions {
  includeDomains?: string[];
  timeRange?: "day" | "week" | "month" | "year";
  maxResults?: number;
  depth?: "basic" | "advanced";
}

export interface IO {
  httpJson(url: string): Promise<unknown>;
  tavilyExtract(url: string, query?: string): Promise<string | null>;
  tavilySearch(query: string, opts?: TavilySearchOptions): Promise<SearchHit[]>;
  llmJson(req: LlmRequest): Promise<unknown>;
}

export type Recording = Record<string, unknown>;

export function llmKey(req: LlmRequest): string {
  return `llm:${req.schemaName}`;
}
export function searchKey(query: string, opts?: TavilySearchOptions): string {
  return `tavily:search:${query}|${(opts?.includeDomains ?? []).join(",")}|${opts?.timeRange ?? ""}`;
}

/** Wraps a live IO and stores every response under a stable key. */
export function recordingIO(inner: IO, recording: Recording): IO {
  const rec = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const value = await fn();
    recording[key] = value;
    return value;
  };
  return {
    httpJson: (url) => rec(`http:${url}`, () => inner.httpJson(url)),
    tavilyExtract: (url, query) => rec(`tavily:extract:${url}`, () => inner.tavilyExtract(url, query)),
    tavilySearch: (q, o) => rec(searchKey(q, o), () => inner.tavilySearch(q, o)),
    llmJson: (req) => rec(llmKey(req), () => inner.llmJson(req)),
  };
}

export class MissingFixtureError extends Error {}

/** Replays a recording; any call that was not recorded fails loudly. */
export function replayIO(recording: Recording): IO {
  const get = (key: string) => {
    if (!(key in recording)) throw new MissingFixtureError(`No fixture for ${key}`);
    return structuredClone(recording[key]);
  };
  return {
    httpJson: async (url) => get(`http:${url}`),
    tavilyExtract: async (url) => get(`tavily:extract:${url}`) as string | null,
    tavilySearch: async (q, o) => get(searchKey(q, o)) as SearchHit[],
    llmJson: async (req) => get(llmKey(req)),
  };
}

export function loadRecording(file: string): Recording {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function saveRecording(file: string, recording: Recording) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(recording, null, 2) + "\n");
}
