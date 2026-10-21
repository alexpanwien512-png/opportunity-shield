"use client";

import { useEffect, useState } from "react";
import { Button, Card, ErrorBox, Input } from "@/components/ui";
import type { Profile } from "@/lib/shield/types";

const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile").then((r) => r.json()).then((d) => {
      setProfile(d.profile);
      setSaved(d.saved);
    });
  }, []);

  if (!profile) return null;
  const set = (patch: Partial<Profile>) => {
    setProfile({ ...profile, ...patch });
    setStatus(null);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setProfile(data.profile);
    setSaved(true);
    setError(null);
    setStatus("Saved. New analyses and scans use this profile.");
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Your profile</h1>
        <p className="mt-2 max-w-xl text-zinc-600 dark:text-zinc-400">
          Eligibility is personal: where you live decides regional listings, your skills steer scans, and your hourly rate decides whether long odds are worth it.
          {!saved && " You are using the demo profile until you save."}
        </p>
      </div>

      <Card title="Eligibility">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Country of residence" hint="Regional listings are checked against this.">
            <Input value={profile.residenceCountry} onChange={(e) => set({ residenceCountry: e.target.value })} required />
          </Field>
          <Field label="Citizenship" hint="Comma-separated.">
            <ListInput value={profile.citizenship} onChange={(v) => set({ citizenship: v })} />
          </Field>
        </div>
      </Card>

      <Card title="Work">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Skills" hint="Comma-separated; used by Scan to pick fits.">
            <ListInput value={profile.skills} onChange={(v) => set({ skills: v })} />
          </Field>
          <Field label="Hourly rate (USD)" hint="Caution items below 25% of this get parked.">
            <Input type="number" min={0} value={profile.hourlyRateUsd} onChange={(e) => set({ hourlyRateUsd: Number(e.target.value) })} />
          </Field>
          <Field label="Payout preferences" hint="e.g. fiat, usdc, paypal">
            <ListInput value={profile.payoutPreferences} onChange={(v) => set({ payoutPreferences: v })} />
          </Field>
        </div>
      </Card>

      <Card title="Audience" action={<Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={() => set({ audience: [...profile.audience, { platform: "", followers: 0 }] })}>+ Add</Button>}>
        <p className="mb-3 text-xs text-zinc-500">Engagement-judged bounties favor big accounts; the verdict weighs your reach.</p>
        <div className="space-y-2">
          {profile.audience.map((a, i) => (
            <div key={i} className="flex gap-2">
              <Input placeholder="x, linkedin, youtube…" value={a.platform} onChange={(e) => set({ audience: profile.audience.map((x, j) => (j === i ? { ...x, platform: e.target.value } : x)) })} />
              <Input type="number" min={0} className="w-36" value={a.followers} onChange={(e) => set({ audience: profile.audience.map((x, j) => (j === i ? { ...x, followers: Number(e.target.value) } : x)) })} aria-label="Followers" />
              <Button type="button" variant="danger" className="px-2" onClick={() => set({ audience: profile.audience.filter((_, j) => j !== i) })} aria-label="Remove">✕</Button>
            </div>
          ))}
        </div>
      </Card>

      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="flex items-center gap-3">
        <Button>Save profile</Button>
        {status && <span className="text-sm text-emerald-700 dark:text-emerald-400">{status}</span>}
      </div>
    </form>
  );
}

/** Comma-separated list input that keeps what you type (including a trailing comma) until you leave the field. */
function ListInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(value.join(", "));
  return <Input value={text} onChange={(e) => { setText(e.target.value); onChange(list(e.target.value)); }} onBlur={() => setText(value.join(", "))} />;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}
