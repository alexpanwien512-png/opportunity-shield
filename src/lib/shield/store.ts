// Local persistent memory (SQLite). Each visitor ("owner", an anonymous cookie id) has their own
// profile, history, blacklist and rule overrides. Analyses are cached globally by URL + the inputs
// that shape a verdict (profile, rules, blacklist, pipeline version), so identical requests are free.
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
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

const SCHEMA_VERSION = 2;
const SCHEMA = `
CREATE TABLE IF NOT EXISTS profiles (owner TEXT PRIMARY KEY, profile TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS analyses (
  key TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  result TEXT NOT NULL,
  analyzed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS history (
  owner TEXT NOT NULL,
  url TEXT NOT NULL,
  analysis_key TEXT NOT NULL,
  title TEXT NOT NULL,
  platform TEXT NOT NULL,
  sponsor TEXT,
  verdict TEXT NOT NULL,
  ev_per_hour REAL,
  deadline TEXT,
  analyzed_at TEXT NOT NULL,
  PRIMARY KEY (owner, url)
);
CREATE TABLE IF NOT EXISTS blacklist (
  owner TEXT NOT NULL,
  value TEXT NOT NULL,
  kind TEXT NOT NULL,
  reason TEXT NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (owner, value)
);
CREATE TABLE IF NOT EXISTS rule_overrides (owner TEXT NOT NULL, id TEXT NOT NULL, override TEXT NOT NULL, PRIMARY KEY (owner, id));
`;

/** Hash of everything besides the page that changes a verdict. */
export function inputsKey(url: string, inputs: { profile: Profile; rules: RuleSpec[]; blacklist: string[]; pipelineVersion: number }): string {
  const rules = inputs.rules.map((r) => [r.id, r.enabled, r.severity, r.params]);
  const blob = JSON.stringify([url, inputs.profile, rules, [...inputs.blacklist].sort(), inputs.pipelineVersion]);
  return createHash("sha256").update(blob).digest("hex").slice(0, 32);
}

export class Store {
  readonly db: Database.Database;

  constructor(file = config.dbPath) {
    if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new Database(file);
    // WAL is fastest on a local disk; use SHIELD_DB_JOURNAL=DELETE on network/shared filesystems.
    this.db.pragma(`journal_mode = ${process.env.SHIELD_DB_JOURNAL === "DELETE" ? "DELETE" : "WAL"}`);
    // v1 had no owners; its rows are a cache we can drop.
    if ((this.db.pragma("user_version", { simple: true }) as number) < SCHEMA_VERSION) {
      this.db.exec("DROP TABLE IF EXISTS kv; DROP TABLE IF EXISTS analyses; DROP TABLE IF EXISTS blacklist; DROP TABLE IF EXISTS rule_overrides;");
      this.db.exec(SCHEMA);
      this.db.pragma(`user_version = ${SCHEMA_VERSION}`);
    }
    this.db.exec(SCHEMA);
  }

  // ---------- profile ----------

  getProfile(owner: string): Profile {
    const row = this.db.prepare("SELECT profile FROM profiles WHERE owner = ?").get(owner) as { profile: string } | undefined;
    return row ? { ...DEFAULT_PROFILE, ...JSON.parse(row.profile) } : DEFAULT_PROFILE;
  }

  hasProfile(owner: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM profiles WHERE owner = ?").get(owner);
  }

  saveProfile(owner: string, profile: Profile): Profile {
    this.db.prepare("INSERT INTO profiles (owner, profile) VALUES (?, ?) ON CONFLICT(owner) DO UPDATE SET profile = excluded.profile").run(owner, JSON.stringify(profile));
    return profile;
  }

  // ---------- analysis cache (global) ----------

  cachedAnalysis(key: string): AnalysisResult | null {
    const row = this.db.prepare("SELECT result FROM analyses WHERE key = ?").get(key) as { result: string } | undefined;
    return row ? JSON.parse(row.result) : null;
  }

  saveAnalysis(key: string, r: AnalysisResult) {
    this.db
      .prepare("INSERT INTO analyses (key, url, result, analyzed_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET result = excluded.result, analyzed_at = excluded.analyzed_at")
      .run(key, r.url, JSON.stringify(r), r.analyzedAt);
  }

  // ---------- history (per owner) ----------

  recordHistory(owner: string, key: string, r: AnalysisResult) {
    this.db
      .prepare(
        `INSERT INTO history (owner, url, analysis_key, title, platform, sponsor, verdict, ev_per_hour, deadline, analyzed_at)
         VALUES (@owner, @url, @key, @title, @platform, @sponsor, @verdict, @ev, @deadline, @analyzedAt)
         ON CONFLICT(owner, url) DO UPDATE SET analysis_key=excluded.analysis_key, title=excluded.title, platform=excluded.platform,
           sponsor=excluded.sponsor, verdict=excluded.verdict, ev_per_hour=excluded.ev_per_hour, deadline=excluded.deadline, analyzed_at=excluded.analyzed_at`,
      )
      .run({ owner, url: r.url, key, title: r.title, platform: r.platform, sponsor: r.sponsor, verdict: r.verdict, ev: r.ev.evPerHourUsd, deadline: r.deadline, analyzedAt: r.analyzedAt });
  }

  /** The analysis this owner last saw for a URL. */
  getAnalysis(owner: string, url: string): AnalysisResult | null {
    const row = this.db.prepare("SELECT a.result FROM history h JOIN analyses a ON a.key = h.analysis_key WHERE h.owner = ? AND h.url = ?").get(owner, url) as
      | { result: string }
      | undefined;
    return row ? JSON.parse(row.result) : null;
  }

  listHistory(owner: string, limit = 100): HistoryItem[] {
    return (
      this.db
        .prepare("SELECT url, title, platform, sponsor, verdict, ev_per_hour, deadline, analyzed_at FROM history WHERE owner = ? ORDER BY analyzed_at DESC LIMIT ?")
        .all(owner, limit) as { url: string; title: string; platform: string; sponsor: string | null; verdict: Verdict; ev_per_hour: number | null; deadline: string | null; analyzed_at: string }[]
    ).map((r) => ({ url: r.url, title: r.title, platform: r.platform, sponsor: r.sponsor, verdict: r.verdict, evPerHourUsd: r.ev_per_hour, deadline: r.deadline, analyzedAt: r.analyzed_at }));
  }

  deleteHistory(owner: string, url: string) {
    this.db.prepare("DELETE FROM history WHERE owner = ? AND url = ?").run(owner, url);
  }

  // ---------- blacklist (per owner) ----------

  listBlacklist(owner: string): BlacklistEntry[] {
    return (this.db.prepare("SELECT value, kind, reason, added_at FROM blacklist WHERE owner = ? ORDER BY added_at DESC").all(owner) as {
      value: string; kind: BlacklistEntry["kind"]; reason: string; added_at: string;
    }[]).map((r) => ({ value: r.value, kind: r.kind, reason: r.reason, addedAt: r.added_at }));
  }

  addBlacklist(owner: string, value: string, kind: BlacklistEntry["kind"], reason = "") {
    this.db
      .prepare("INSERT INTO blacklist (owner, value, kind, reason, added_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(owner, value) DO UPDATE SET kind=excluded.kind, reason=excluded.reason")
      .run(owner, value.trim().toLowerCase(), kind, reason, new Date().toISOString());
  }

  removeBlacklist(owner: string, value: string) {
    this.db.prepare("DELETE FROM blacklist WHERE owner = ? AND value = ?").run(owner, value.trim().toLowerCase());
  }

  blacklistValues(owner: string): string[] {
    return this.listBlacklist(owner).map((b) => b.value);
  }

  // ---------- rules (editable "skills", per owner) ----------

  getRules(owner: string): RuleSpec[] {
    const rows = this.db.prepare("SELECT id, override FROM rule_overrides WHERE owner = ?").all(owner) as { id: string; override: string }[];
    const overrides = new Map(rows.map((r) => [r.id, JSON.parse(r.override) as RuleOverride]));
    return DEFAULT_RULES.map((rule) => {
      const o = overrides.get(rule.id);
      return o ? { ...rule, ...o, params: { ...rule.params, ...(o.params ?? {}) } } : rule;
    });
  }

  saveRuleOverride(owner: string, id: string, override: RuleOverride) {
    const rule = DEFAULT_RULES.find((r) => r.id === id);
    if (!rule) throw new Error(`Unknown rule ${id}`);
    if (override.severity && !(["critical", "high", "medium", "low"] as Severity[]).includes(override.severity)) throw new Error("Invalid severity");
    for (const [k, v] of Object.entries(override.params ?? {})) {
      if (!(k in rule.params)) throw new Error(`Unknown param ${k}`);
      if (typeof rule.params[k] === "string") {
        if (String(v).length > 500) throw new Error(`${k} is too long`);
        new RegExp(String(v), "i"); // throws on an invalid pattern
      }
    }
    this.db
      .prepare("INSERT INTO rule_overrides (owner, id, override) VALUES (?, ?, ?) ON CONFLICT(owner, id) DO UPDATE SET override = excluded.override")
      .run(owner, id, JSON.stringify(override));
  }

  resetRule(owner: string, id: string) {
    this.db.prepare("DELETE FROM rule_overrides WHERE owner = ? AND id = ?").run(owner, id);
  }
}

let shared: Store | null = null;
/** One connection per server process. */
export function store(): Store {
  shared ??= new Store();
  return shared;
}
