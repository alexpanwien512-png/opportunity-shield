"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Card, Empty, ErrorBox, Input, PLATFORM_LABEL, SEVERITY_STYLE, VerdictPill, cx, daysLeft, usd } from "@/components/ui";
import type { RuleSpec } from "@/lib/shield/rules";
import type { BlacklistEntry, HistoryItem } from "@/lib/shield/store";
import type { Severity } from "@/lib/shield/types";

const TABS = ["History", "Blacklist", "Rules"] as const;
type Tab = (typeof TABS)[number];

export default function MemoryPage() {
  const [tab, setTab] = useState<Tab>("History");
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Memory</h1>
      <p className="mt-2 max-w-xl text-zinc-600 dark:text-zinc-400">Everything the agent remembers lives in a local SQLite file: past verdicts, sponsors and repos you never want to see again, and the red-flag rules it applies.</p>
      <div className="mt-6 inline-flex rounded-xl border border-zinc-200 bg-white p-1 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cx("rounded-lg px-3 py-1.5 transition", tab === t ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100")}>
            {t}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {tab === "History" && <History />}
        {tab === "Blacklist" && <Blacklist />}
        {tab === "Rules" && <Rules />}
      </div>
    </div>
  );
}

function History() {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const load = () => fetch("/api/history").then((r) => r.json()).then(setItems);
  useEffect(() => {
    load();
  }, []);
  if (!items) return null;
  if (!items.length) return <Empty>No analyses yet. Paste a link on the Analyze page or run a scan.</Empty>;
  return (
    <ul className="divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900/60">
      {items.map((h) => (
        <li key={h.url} className="flex items-center gap-3 px-4 py-3 text-sm">
          <VerdictPill verdict={h.verdict} />
          <Link href={`/?url=${encodeURIComponent(h.url)}`} className="min-w-0 flex-1 truncate hover:underline">
            {h.title}
          </Link>
          <span className="hidden shrink-0 text-xs text-zinc-500 md:inline">{PLATFORM_LABEL[h.platform] ?? h.platform}</span>
          <span className="hidden shrink-0 text-xs text-zinc-500 sm:inline">{daysLeft(h.deadline)}</span>
          <span className="hidden w-20 shrink-0 text-right text-xs text-zinc-500 sm:inline">{h.evPerHourUsd != null ? `${usd(h.evPerHourUsd, h.evPerHourUsd < 10 ? 2 : 0)}/h` : ""}</span>
          <button
            aria-label="Forget"
            title="Forget"
            className="shrink-0 rounded px-1.5 text-zinc-400 hover:text-rose-600"
            onClick={() => fetch(`/api/history?url=${encodeURIComponent(h.url)}`, { method: "DELETE" }).then(load)}
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}

function Blacklist() {
  const [items, setItems] = useState<BlacklistEntry[]>([]);
  const [value, setValue] = useState("");
  const [kind, setKind] = useState<BlacklistEntry["kind"]>("repo");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/blacklist").then((r) => r.json()).then(setItems);
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/blacklist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value, kind, reason }) });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setItems(data);
    setValue("");
    setReason("");
    setError(null);
  }

  return (
    <div className="space-y-4">
      <Card title="Add to blacklist">
        <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
          <select value={kind} onChange={(e) => setKind(e.target.value as BlacklistEntry["kind"])} className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">
            <option value="repo">Repo (owner/name)</option>
            <option value="sponsor">Sponsor name</option>
            <option value="domain">Domain</option>
          </select>
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === "repo" ? "SecureBananaLabs/bug-bounty" : kind === "domain" ? "example.com" : "Sponsor name"} />
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why (optional)" />
          <Button disabled={!value.trim()}>Add</Button>
        </form>
        {error && <div className="mt-2"><ErrorBox>{error}</ErrorBox></div>}
      </Card>
      {items.length === 0 ? (
        <Empty>Nothing blacklisted. Blacklisted repos, sponsors and domains are flagged critical and skipped by scans.</Empty>
      ) : (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900/60">
          {items.map((b) => (
            <li key={b.value} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className="w-16 shrink-0 text-xs uppercase tracking-wide text-zinc-500">{b.kind}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{b.value}</span>
              <span className="hidden min-w-0 truncate text-xs text-zinc-500 sm:block">{b.reason}</span>
              <Button variant="danger" className="px-2 py-1" onClick={() => fetch(`/api/blacklist?value=${encodeURIComponent(b.value)}`, { method: "DELETE" }).then((r) => r.json()).then(setItems)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];

function Rules() {
  const [rules, setRules] = useState<RuleSpec[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/rules").then((r) => r.json()).then(setRules);
  }, []);

  async function save(rule: RuleSpec) {
    const res = await fetch("/api/rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rule.id, override: { enabled: rule.enabled, severity: rule.severity, params: rule.params } }),
    });
    const data = await res.json();
    if (!res.ok) return setError(`${rule.label}: ${data.error}`);
    setRules(data);
    setError(null);
  }

  async function reset(id: string) {
    setRules(await fetch(`/api/rules?id=${id}`, { method: "DELETE" }).then((r) => r.json()));
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-500">
        Each rule is a reusable skill. Change its severity, switch it off, or edit its pattern/threshold — the next analysis uses it. Critical → Avoid; high or two mediums → Caution.
      </p>
      {error && <ErrorBox>{error}</ErrorBox>}
      {rules.map((r, idx) => (
        <RuleRow key={r.id} rule={r} onChange={(nr) => setRules(rules.map((x, i) => (i === idx ? nr : x)))} onSave={save} onReset={reset} />
      ))}
    </div>
  );
}

function RuleRow({ rule, onChange, onSave, onReset }: { rule: RuleSpec; onChange: (r: RuleSpec) => void; onSave: (r: RuleSpec) => void; onReset: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const params = Object.entries(rule.params);
  return (
    <div className={cx("rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/60", !rule.enabled && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative inline-flex cursor-pointer items-center">
          <input type="checkbox" className="peer sr-only" checked={rule.enabled} onChange={(e) => onSave({ ...rule, enabled: e.target.checked })} aria-label={`Enable ${rule.label}`} />
          <span className="h-5 w-9 rounded-full bg-zinc-300 transition peer-checked:bg-emerald-500 dark:bg-zinc-700" />
          <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
        </label>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{rule.label}</div>
          <div className="text-xs text-zinc-500">{rule.description}</div>
        </div>
        <select
          value={rule.severity}
          onChange={(e) => onSave({ ...rule, severity: e.target.value as Severity })}
          className={cx("rounded-lg px-2 py-1 text-xs font-semibold uppercase", SEVERITY_STYLE[rule.severity])}
          aria-label={`Severity of ${rule.label}`}
        >
          {SEVERITIES.map((s) => (
            <option key={s} value={s} className="bg-white text-zinc-900">
              {s}
            </option>
          ))}
        </select>
        {params.length > 0 && (
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setOpen(!open)}>
            {open ? "Hide" : "Edit"}
          </Button>
        )}
      </div>
      {open && (
        <div className="mt-3 space-y-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          {params.map(([k, v]) => (
            <label key={k} className="block text-xs text-zinc-500">
              {k}
              <Input
                className="mt-1 font-mono text-xs"
                value={String(v)}
                onChange={(e) => onChange({ ...rule, params: { ...rule.params, [k]: typeof v === "number" ? Number(e.target.value) : e.target.value } })}
              />
            </label>
          ))}
          <div className="flex gap-2 pt-1">
            <Button className="px-3 py-1.5" onClick={() => onSave(rule)}>Save</Button>
            <Button variant="ghost" className="px-3 py-1.5" onClick={() => onReset(rule.id)}>Reset to default</Button>
          </div>
        </div>
      )}
    </div>
  );
}
