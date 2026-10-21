import type { Verdict } from "../src/lib/shield/types";
import { DEFAULT_PROFILE } from "../src/lib/shield/profile";

export interface Case {
  id: string;
  url: string;
  expected: Verdict;
  mustFlag: string[]; // rule ids that must fire
  mustNotFlag?: string[];
}

/** The profile the demo and the tests run with. */
export const DEMO_PROFILE = DEFAULT_PROFILE;

export const CASES: Case[] = [
  { id: "gh-star-farm-poem", url: "https://github.com/SecureBananaLabs/bug-bounty/issues/76", expected: "AVOID",
    mustFlag: ["engagement-farming", "non-technical-in-code-repo", "attempt-flood", "pr-flood"] },
  { id: "gh-recursive-farm", url: "https://github.com/SecureBananaLabs/bug-bounty/issues/743", expected: "AVOID",
    mustFlag: ["engagement-farming", "pr-flood"] },
  { id: "gh-test-bounty-dm", url: "https://github.com/jomaaabbe78-spec/bookningsapp/issues/1", expected: "AVOID",
    mustFlag: ["test-bounty", "offplatform-payment", "absurd-reward"] },
  { id: "st-regional-de", url: "https://superteam.fun/earn/listing/travel-boost-for-bp26", expected: "AVOID",
    mustFlag: ["region-mismatch"] },
  { id: "st-non-cash-audit", url: "https://superteam.fun/earn/listing/vaultline-security-audit-grants-for-colosseum-projects-up-to-4000-usdc-each", expected: "AVOID",
    mustFlag: ["non-cash-prize", "precondition-existing-project", "unverified-sponsor"] },
  { id: "st-token-promo", url: "https://superteam.fun/earn/listing/chimp-on-metaplex", expected: "CAUTION",
    mustFlag: ["token-promotion", "unverified-sponsor", "competition-ratio"],
    mustNotFlag: ["region-mismatch", "non-cash-prize"] },
  { id: "dp-nebius", url: "https://nebiusglobalaihackathon.devpost.com", expected: "APPLY",
    mustFlag: [], mustNotFlag: ["region-mismatch", "non-cash-prize", "token-promotion", "precondition-existing-project"] },
];
