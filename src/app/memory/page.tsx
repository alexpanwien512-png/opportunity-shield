"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconBan, IconBook, IconEdit, IconGavel, IconSearch, IconTrash } from "@/components/icons";
import { Button, Card, Empty, ErrorBox, Input, PLATFORM_LABEL, SEVERITY, Segmented, VerdictPill, cx, daysLeft, usd } from "@/components/ui";
import type { RuleSpec } from "@/lib/shield/rules";
import type { BlacklistEntry, HistoryItem } from "@/lib/shield/store";
import type { Severity } from "@/lib/shield/types";

type Tab = "history" | "blacklist" | "rules";

export default function MemoryPage() {
  const [tab, setTab] = useState<Tab>("history");
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">Memory</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">What the shield remembers</h1>
      <p className="mt-2 max-w-xl text-muted">Your past verdicts, the repos and sponsors you never want to see again, and the red-flag rules it applies — all private to this browser.</p>
      <div className="mt-6">
        <Segmented
          label="Memory sections"
          value={tab}
          onChange={setTab}
          options={[
            { id: "history", label: "History" },
            { id: "blacklist", label: "Blacklist" },
            { id: "rules", label: "Rules" },
          ]}
        />
      </div>
      <div className="mt-6">
        {tab === "history" && <History />}
        {tab === "blacklist" && <Blacklist />}
        {tab === "rules" && <Rules />}
      </div>
    </div>
  );
}

function History() {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const load = () =>
    fetch("/api/history")
      .then((r) => r.json())
      .then(setItems);
  useEffect(() => {
    load();
  }, []);
  if (!items) return <div className="surface shimmer h-40 rounded-2xl" />;
  if (!items.length)
    return (
      <Empty
        icon={<IconBook size={22} />}
        title="No verdicts yet"
        action={
          <Link href="/" className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-text px-4 text-sm font-medium text-bg">
            <IconSearch size={15} /> Analyze a link
          </Link>
        }
      >
        Every link you analyze lands here, so you can come back to it without spending another credit.
      </Empty>
    );
  return (
    <ul className="surface divide-y divide-line overflow-hidden rounded-2xl">
      {items.map((h) => (
        <li key={h.url} className="flex items-center gap-3 px-4 py-3 text-sm">
          <VerdictPill verdict={h.verdict} />
          <Link href={`/?url=${encodeURIComponent(h.url)}`} className="min-w-0 flex-1 truncate rounded hover:underline">
            {h.title}
          </Link>
          <span className="hidden shrink-0 text-xs text-muted md:inline">{PLATFORM_LABEL[h.platform] ?? h.platform}</span>
          <span className="hidden shrink-0 text-xs text-muted sm:inline">{daysLeft(h.deadline)}</span>
          <span className="num hidden w-20 shrink-0 text-right text-xs text-muted sm:inline">{h.evPerHourUsd != null ? `${usd(h.evPerHourUsd, h.evPerHourUsd < 10 ? 2 : 0)}/h` : ""}</span>
          <button
            aria-label={`Forget ${h.title}`}
            title="Forget"
            className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-avoid-soft hover:text-avoid"
            onClick={() => fetch(`/api/history?url=${encodeURIComponent(h.url)}`, { method: "DELETE" }).then(load)}
          >
            <IconTrash size={15} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function Blacklist() {
  const [items, setItems] = useState<BlacklistEntry[] | null>(null);
  const [value, setValue] = useState("");
  const [kind, setKind] = useState<BlacklistEntry["kind"]>("repo");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/blacklist")
      .then((r) => r.json())
      .then(setItems);
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
      <Card title="Block a repo, sponsor or domain" icon={<IconBan size={14} />}>
        <form onSubmit={add} className="grid gap-2 sm:grid-cols-[auto_1fr_1fr_auto]">
          <label className="sr-only" htmlFor="bl-kind">
            Type
          </label>
          <select id="bl-kind" value={kind} onChange={(e) => setKind(e.target.value as BlacklistEntry["kind"])} className="h-10 rounded-xl border border-line-strong bg-surface px-3 text-sm text-text">
            <option value="repo">Repo</option>
            <option value="sponsor">Sponsor</option>
            <option value="domain">Domain</option>
          </select>
          <Input aria-label="Value" value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === "repo" ? "owner/name, e.g. SecureBananaLabs/bug-bounty" : kind === "domain" ? "example.com" : "Sponsor name"} />
          <Input aria-label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why? (optional)" />
          <Button disabled={!value.trim()}>Block</Button>
        </form>
        {error && (
          <div className="mt-3">
            <ErrorBox>{error}</ErrorBox>
          </div>
        )}
      </Card>
      {items && items.length === 0 ? (
        <Empty icon={<IconBan size={22} />} title="Nothing blocked">
          Blocked repos, sponsors and domains are flagged as critical in every analysis and skipped by scans. You can also block straight from a verdict.
        </Empty>
      ) : (
        <ul className="surface divide-y divide-line overflow-hidden rounded-2xl">
          {(items ?? []).map((b) => (
            <li key={b.value} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted">{b.kind}</span>
              <span className="num min-w-0 flex-1 truncate text-[13px]">{b.value}</span>
              <span className="hidden min-w-0 truncate text-xs text-muted sm:block">{b.reason}</span>
              <Button
                variant="danger"
                size="sm"
                onClick={() =>
                  fetch(`/api/blacklist?value=${encodeURIComponent(b.value)}`, { method: "DELETE" })
                    .then((r) => r.json())
                    .then(setItems)
                }
              >
                Unblock
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
    fetch("/api/rules")
      .then((r) => r.json())
      .then(setRules);
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
      <div className="surface flex items-start gap-3 rounded-2xl p-4 text-sm">
        <IconGavel size={18} className="mt-0.5 shrink-0 text-brand" />
        <p className="text-muted">
          Each rule is a reusable skill. Switch it off, change how serious it is, or edit its pattern — your next analysis uses it.{" "}
          <span className="text-text">Any critical flag → Avoid. A high flag or two mediums → Caution.</span>
        </p>
      </div>
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
    <div className={cx("surface rounded-2xl p-4 transition", !rule.enabled && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative inline-flex cursor-pointer items-center">
          <input type="checkbox" className="peer sr-only" checked={rule.enabled} onChange={(e) => onSave({ ...rule, enabled: e.target.checked })} aria-label={`${rule.enabled ? "Disable" : "Enable"} ${rule.label}`} />
          <span className="h-5 w-9 rounded-full bg-line-strong transition peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand" />
          <span className="absolute left-0.5 h-4 w-4 rounded-full bg-surface shadow transition peer-checked:translate-x-4" />
        </label>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{rule.label}</div>
          <div className="text-xs text-muted">{rule.description}</div>
        </div>
        <select
          value={rule.severity}
          onChange={(e) => onSave({ ...rule, severity: e.target.value as Severity })}
          className={cx("h-8 rounded-lg border-0 px-2 text-[11px] font-bold uppercase tracking-wider", SEVERITY[rule.severity].cls)}
          aria-label={`Severity of ${rule.label}`}
        >
          {SEVERITIES.map((s) => (
            <option key={s} value={s} className="bg-surface text-text">
              {s}
            </option>
          ))}
        </select>
        {params.length > 0 ? (
          <Button variant="ghost" size="sm" className="w-[4.5rem]" onClick={() => setOpen(!open)} aria-expanded={open}>
            <IconEdit size={14} /> {open ? "Close" : "Edit"}
          </Button>
        ) : (
          <span className="w-[4.5rem]" aria-hidden />
        )}
      </div>
      {open && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          {params.map(([k, v]) => (
            <label key={k} className="block text-xs text-muted">
              {k}
              <Input
                className="num mt-1 text-xs"
                value={String(v)}
                onChange={(e) => onChange({ ...rule, params: { ...rule.params, [k]: typeof v === "number" ? Number(e.target.value) : e.target.value } })}
              />
            </label>
          ))}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onSave(rule)}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onReset(rule.id)}>
              Reset to default
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
