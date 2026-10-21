// Local persistent memory (SQLite): profile, analysis history, blacklist, rule overrides, scan runs.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { DEFAULT_PROFILE } from "./profile";
import { DEFAULT_RULES, type RuleSpec } from "./rules";
import type { AnalysisResult, Profile, Severity, Verdict } from "./types";

export interface HistoryItem {
  url: string;
  title: string;
  platform: string;
  sponsor: string | null;
  verdict: Verdict;
  evPerHourUsd: number | null;
  deadline: string | null;
  analyzedAt: string;
}

export interface BlacklistEntry {
  value: string;
  kind: "repo" | "sponsor" | "domain";
  reason: string;
  addedAt: string;
}

export type RuleOverride = Partial<Pick<RuleSpec, "enabled" | "severity" | "params">>;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS analyses (
  url TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  platform TEXT NOT NULL,
  sponsor TEXT,
  verdict TEXT NOT NULL,
  ev_per_hour REAL,
  deadline TEXT,
  result TEXT NOT NULL,
  analyzed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS blacklist (
  value TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  reason TEXT NOT NULL,
  added_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rule_overrides (id TEXT PRIMARY KEY, override TEXT NOT NULL);
`;

export class Store {
  readonly db: Database.Database;

  constructor(file = config.dbPath) {
    if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
  }

  // ---------- profile ----------

  getProfile(): Profile {
    const row = this.db.prepare("SELECT value FROM kv WHERE key = 'profile'").get() as { value: string } | undefined;
    return row ? { ...DEFAULT_PROFILE, ...JSON.parse(row.value) } : DEFAULT_PROFILE;
  }

  hasProfile(): boolean {
    return !!this.db.prepare("SELECT 1 FROM kv WHERE key = 'profile'").get();
  }

  saveProfile(profile: Profile): Profile {
    this.db.prepare("INSERT INTO kv (key, value) VALUES ('profile', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(profile));
    return profile;
  }

  // ---------- history ----------

  saveAnalysis(r: AnalysisResult) {
    this.db
      .prepare(
        `INSERT INTO analyses (url, title, platform, sponsor, verdict, ev_per_hour, deadline, result, analyzed_at)
         VALUES (@url, @title, @platform, @sponsor, @verdict, @ev, @deadline, @result, @analyzedAt)
         ON CONFLICT(url) DO UPDATE SET title=excluded.title, platform=excluded.platform, sponsor=excluded.sponsor,
           verdict=excluded.verdict, ev_per_hour=excluded.ev_per_hour, deadline=excluded.deadline,
           result=excluded.result, analyzed_at=excluded.analyzed_at`,
      )
      .run({
        url: r.url,
        title: r.title,
        platform: r.platform,
        sponsor: r.sponsor,
        verdict: r.verdict,
        ev: r.ev.evPerHourUsd,
        deadline: r.deadline,
        result: JSON.stringify(r),
        analyzedAt: r.analyzedAt,
      });
  }

  getAnalysis(url: string): AnalysisResult | null {
    const row = this.db.prepare("SELECT result FROM analyses WHERE url = ?").get(url) as { result: string } | undefined;
    return row ? JSON.parse(row.result) : null;
  }

  listHistory(limit = 100): HistoryItem[] {
    return (
      this.db
        .prepare("SELECT url, title, platform, sponsor, verdict, ev_per_hour, deadline, analyzed_at FROM analyses ORDER BY analyzed_at DESC LIMIT ?")
        .all(limit) as { url: string; title: string; platform: string; sponsor: string | null; verdict: Verdict; ev_per_hour: number | null; deadline: string | null; analyzed_at: string }[]
    ).map((r) => ({ url: r.url, title: r.title, platform: r.platform, sponsor: r.sponsor, verdict: r.verdict, evPerHourUsd: r.ev_per_hour, deadline: r.deadline, analyzedAt: r.analyzed_at }));
  }

  deleteAnalysis(url: string) {
    this.db.prepare("DELETE FROM analyses WHERE url = ?").run(url);
  }

  // ---------- blacklist ----------

  listBlacklist(): BlacklistEntry[] {
    return (this.db.prepare("SELECT value, kind, reason, added_at FROM blacklist ORDER BY added_at DESC").all() as {
      value: string; kind: BlacklistEntry["kind"]; reason: string; added_at: string;
    }[]).map((r) => ({ value: r.value, kind: r.kind, reason: r.reason, addedAt: r.added_at }));
  }

  addBlacklist(value: string, kind: BlacklistEntry["kind"], reason = "") {
    this.db
      .prepare("INSERT INTO blacklist (value, kind, reason, added_at) VALUES (?, ?, ?, ?) ON CONFLICT(value) DO UPDATE SET kind=excluded.kind, reason=excluded.reason")
      .run(value.trim().toLowerCase(), kind, reason, new Date().toISOString());
  }

  removeBlacklist(value: string) {
    this.db.prepare("DELETE FROM blacklist WHERE value = ?").run(value.trim().toLowerCase());
  }

  blacklistValues(): string[] {
    return this.listBlacklist().map((b) => b.value);
  }

  // ---------- rules (editable "skills") ----------

  getRules(): RuleSpec[] {
    const rows = this.db.prepare("SELECT id, override FROM rule_overrides").all() as { id: string; override: string }[];
    const overrides = new Map(rows.map((r) => [r.id, JSON.parse(r.override) as RuleOverride]));
    return DEFAULT_RULES.map((rule) => {
      const o = overrides.get(rule.id);
      return o ? { ...rule, ...o, params: { ...rule.params, ...(o.params ?? {}) } } : rule;
    });
  }

  saveRuleOverride(id: string, override: RuleOverride) {
    const rule = DEFAULT_RULES.find((r) => r.id === id);
    if (!rule) throw new Error(`Unknown rule ${id}`);
    if (override.severity && !(["critical", "high", "medium", "low"] as Severity[]).includes(override.severity)) throw new Error("Invalid severity");
    for (const [k, v] of Object.entries(override.params ?? {})) {
      if (!(k in rule.params)) throw new Error(`Unknown param ${k}`);
      if (typeof rule.params[k] === "string") new RegExp(String(v), "i"); // throws on an invalid pattern
    }
    this.db
      .prepare("INSERT INTO rule_overrides (id, override) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET override = excluded.override")
      .run(id, JSON.stringify(override));
  }

  resetRule(id: string) {
    this.db.prepare("DELETE FROM rule_overrides WHERE id = ?").run(id);
  }
}

let shared: Store | null = null;
/** One connection per server process. */
export function store(): Store {
  shared ??= new Store();
  return shared;
}
