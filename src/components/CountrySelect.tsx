"use client";

import { useMemo, useSyncExternalStore } from "react";

// ISO 3166-1 alpha-2 codes; names come from Intl.DisplayNames, flags from regional-indicator emoji.
const CODES =
  "AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PS PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VN VU WS XK YE ZA ZM ZW".split(
    " ",
  );

export const flag = (code: string) => String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));

const noop = () => () => {};
/** False during SSR and hydration, true after: Intl region names differ between Node and browsers. */
function useMounted() {
  return useSyncExternalStore(noop, () => true, () => false);
}

export function useCountries() {
  const mounted = useMounted();
  return useMemo(() => {
    if (!mounted) return [];
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    return CODES.map((code) => ({ code, name: names.of(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name));
  }, [mounted]);
}

export function codeFor(name: string, countries: { code: string; name: string }[]) {
  return countries.find((c) => c.name.toLowerCase() === name.trim().toLowerCase())?.code ?? null;
}

/** Native <select> (accessible, keyboard-friendly) with flags; stores the English country name. */
export function CountrySelect({ value, onChange, id, label }: { value: string; onChange: (name: string) => void; id: string; label: string }) {
  const countries = useCountries();
  if (countries.length === 0) {
    // Server render / hydration: just the current value, same markup on both sides.
    return (
      <select id={id} aria-label={label} value={value} onChange={() => {}} className="h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm text-text">
        <option value={value}>{value || "Choose a country…"}</option>
      </select>
    );
  }
  const known = countries.some((c) => c.name === value);
  return (
    <select
      id={id}
      aria-label={label}
      value={known ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      className="h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm text-text outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft"
    >
      {!known && <option value="">{value ? `${value} (not in list)` : "Choose a country…"}</option>}
      {countries.map((c) => (
        <option key={c.code} value={c.name}>
          {flag(c.code)} {c.name}
        </option>
      ))}
    </select>
  );
}
