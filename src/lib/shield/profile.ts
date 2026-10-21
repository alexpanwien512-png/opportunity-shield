import type { Profile } from "./types";

/** Used until the user saves their own profile. */
export const DEFAULT_PROFILE: Profile = {
  residenceCountry: "Austria",
  citizenship: ["Romania"],
  skills: ["typescript", "python", "react", "llm agents"],
  payoutPreferences: ["fiat", "usdc"],
  audience: [{ platform: "x", followers: 300 }],
  hourlyRateUsd: 40,
};
