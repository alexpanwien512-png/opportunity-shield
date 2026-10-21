"use client";

import { useEffect, useState } from "react";
import { CountrySelect, codeFor, flag, useCountries } from "@/components/CountrySelect";
import { IconCheck, IconCoins, IconGlobe, IconPlus, IconUsers, IconX } from "@/components/icons";
import { Button, ErrorBox, Input, cx } from "@/components/ui";
import { DEFAULT_PROFILE } from "@/lib/shield/profile";
import type { Profile } from "@/lib/shield/types";

const SKILL_SUGGESTIONS = ["typescript", "python", "react", "rust", "solidity", "llm agents", "design", "writing", "video", "security"];
const PAYOUTS = ["fiat", "usdc", "usdt", "paypal", "crypto"];

function Step({ n, title, hint, icon, children }: { n: number; title: string; hint: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="surface rise rounded-2xl p-5 sm:p-6" style={{ animationDelay: `${n * 60}ms` }} aria-labelledby={`step-${n}`}>
      <div className="mb-5 flex items-start gap-3">
        <span className="num flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-sm font-semibold text-brand">{n}</span>
        <div>
          <h2 id={`step-${n}`} className="flex items-center gap-2 font-semibold">
            {icon} {title}
          </h2>
          <p className="text-sm text-muted">{hint}</p>
        </div>
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Chips input: Enter or comma adds, ✕ or Backspace removes. */
function ChipsInput({ value, onChange, suggestions, id, label }: { value: string[]; onChange: (v: string[]) => void; suggestions: string[]; id: string; label: string }) {
  const [draft, setDraft] = useState("");
  const add = (s: string) => {
    const t = s.trim().toLowerCase();
    if (t && !value.includes(t)) onChange([...value, t]);
    setDraft("");
  };
  return (
    <div>
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border border-line-strong bg-surface p-1.5 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand-soft">
        {value.map((s) => (
          <span key={s} className="inline-flex items-center gap-1 rounded-lg bg-brand-soft py-1 pl-2.5 pr-1 text-sm text-text">
            {s}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== s))} className="rounded p-0.5 text-muted hover:text-text" aria-label={`Remove ${s}`}>
              <IconX size={12} />
            </button>
          </span>
        ))}
        <input
          id={id}
          aria-label={label}
          value={draft}
          onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value.slice(0, -1)) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => draft && add(draft)}
          placeholder={value.length ? "Add more…" : "Type a skill and press Enter"}
          className="h-8 min-w-[8rem] flex-1 bg-transparent px-1.5 text-sm outline-none placeholder:text-faint"
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {suggestions
          .filter((s) => !value.includes(s))
          .map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-line-strong px-2 py-1 text-xs text-muted hover:border-brand hover:text-text">
              <IconPlus size={11} /> {s}
            </button>
          ))}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  // Start from the demo profile so the form renders immediately (no layout shift), then load the saved one.
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const countries = useCountries();

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => {
        setProfile(d.profile);
        setSaved(d.saved);
      });
  }, []);

  const set = (patch: Partial<Profile>) => {
    setProfile({ ...profile, ...patch });
    setDirty(true);
    setStatus(null);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) });
    const data = await res.json();
    if (!res.ok) return setError("Some fields need another look: " + data.error);
    setProfile(data.profile);
    setSaved(true);
    setDirty(false);
    setError(null);
    setStatus("Saved. Your next analysis and scan use this profile.");
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">Profile</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Eligibility is personal</h1>
        <p className="mt-2 max-w-xl text-muted">
          Where you live decides regional listings, your skills steer scans, and your hourly rate decides whether long odds are worth it.
          {!saved && <span className="text-text"> You&apos;re using the demo profile until you save.</span>}
        </p>
      </div>

      <Step n={1} title="Where you are" hint="Regional listings are checked against your country of residence." icon={<IconGlobe size={16} className="text-muted" />}>
        <Field label="Country of residence" htmlFor="residence">
          <CountrySelect id="residence" label="Country of residence" value={profile.residenceCountry} onChange={(residenceCountry) => set({ residenceCountry })} />
        </Field>
        <Field label="Citizenship" hint="Some hackathons check nationality, not residence." htmlFor="citizenship-add">
          <div className="flex flex-wrap gap-1.5">
            {profile.citizenship.map((c) => {
              const code = codeFor(c, countries);
              return (
                <span key={c} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 py-1 pl-2.5 pr-1 text-sm ring-1 ring-inset ring-line">
                  {code && <span aria-hidden>{flag(code)}</span>} {c}
                  <button type="button" onClick={() => set({ citizenship: profile.citizenship.filter((x) => x !== c) })} className="rounded p-0.5 text-muted hover:text-text" aria-label={`Remove ${c}`}>
                    <IconX size={12} />
                  </button>
                </span>
              );
            })}
          </div>
          <div className="mt-2 max-w-sm">
            <CountrySelect
              id="citizenship-add"
              label="Add a citizenship"
              value=""
              onChange={(c) => c && !profile.citizenship.includes(c) && set({ citizenship: [...profile.citizenship, c] })}
            />
          </div>
        </Field>
      </Step>

      <Step n={2} title="What you do" hint="Scan ranks listings by how well they fit these skills." icon={<IconCheck size={16} className="text-muted" />}>
        <Field label="Skills" htmlFor="skills">
          <ChipsInput id="skills" label="Skills" value={profile.skills} onChange={(skills) => set({ skills })} suggestions={SKILL_SUGGESTIONS} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Your hourly rate" hint="Cautions earning under 25% of this get parked." htmlFor="rate">
            <div className="relative">
              <span className="num pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">$</span>
              <Input id="rate" type="number" min={0} className="num h-11 pl-7" value={profile.hourlyRateUsd} onChange={(e) => set({ hourlyRateUsd: Number(e.target.value) })} />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-muted">per hour</span>
            </div>
          </Field>
          <Field label="How you like to be paid">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Payout preferences">
              {PAYOUTS.map((p) => {
                const on = profile.payoutPreferences.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ payoutPreferences: on ? profile.payoutPreferences.filter((x) => x !== p) : [...profile.payoutPreferences, p] })}
                    className={cx("inline-flex h-9 items-center gap-1 rounded-lg px-3 text-sm ring-1 ring-inset transition", on ? "bg-brand-soft text-text ring-brand/50" : "text-muted ring-line-strong hover:text-text")}
                  >
                    {on && <IconCheck size={13} strokeWidth={2.5} className="text-brand" />} {p.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
      </Step>

      <Step n={3} title="Your reach" hint="Engagement-judged bounties favour big accounts; the verdict weighs your audience." icon={<IconUsers size={16} className="text-muted" />}>
        <div className="space-y-2">
          {profile.audience.map((a, i) => (
            <div key={i} className="flex gap-2">
              <Input aria-label="Platform" placeholder="x, linkedin, youtube…" className="h-11" value={a.platform} onChange={(e) => set({ audience: profile.audience.map((x, j) => (j === i ? { ...x, platform: e.target.value } : x)) })} />
              <Input
                aria-label="Followers"
                type="number"
                min={0}
                className="num h-11 w-32 sm:w-40"
                value={a.followers}
                onChange={(e) => set({ audience: profile.audience.map((x, j) => (j === i ? { ...x, followers: Number(e.target.value) } : x)) })}
              />
              <Button type="button" variant="danger" className="h-11 px-3" onClick={() => set({ audience: profile.audience.filter((_, j) => j !== i) })} aria-label="Remove this account">
                <IconX size={15} />
              </Button>
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => set({ audience: [...profile.audience, { platform: "", followers: 0 }] })}>
            <IconPlus size={14} /> Add an account
          </Button>
        </div>
      </Step>

      {error && <ErrorBox>{error}</ErrorBox>}

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-bg/90 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <p className="min-w-0 truncate text-sm" role="status">
            {status ? (
              <span className="text-apply">✓ {status}</span>
            ) : dirty ? (
              <span className="text-muted">Unsaved changes</span>
            ) : (
              <span className="text-muted">
                <IconCoins size={14} className="mr-1 inline" />
                Analyses use this profile
              </span>
            )}
          </p>
          <Button disabled={!dirty}>Save profile</Button>
        </div>
      </div>
    </form>
  );
}
