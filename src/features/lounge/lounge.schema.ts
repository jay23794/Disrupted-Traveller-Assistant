import { z } from "zod";

/**
 * Three-letter IATA airport code. Deliberately redeclared here rather than imported from
 * the flight feature: features stay independent, and the day one needs a rule the other
 * does not, neither has to change. Worth extracting to a shared schema if a third copy
 * appears.
 */
export const airportCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "must be a 3-letter IATA airport code, e.g. LHR");

/**
 * Terminal as the airport labels it: "5", "3", "A". Travellers and models say "T5" or
 * "Terminal 5", so those are normalised to the bare label the data uses. The `T` is only
 * stripped before a digit, so a terminal genuinely called "T" survives.
 */
export const terminalSchema = z
  .string()
  .trim()
  .toUpperCase()
  .transform((value) => value.replace(/^(?:TERMINAL\s*|T(?=\d))/, ""))
  .pipe(z.string().min(1, "must name a terminal, e.g. 5 or T5"));

/**
 * Lookup inputs, normalised to the casing the fixtures use, so "pp-1001" finds PP-1001 and
 * "LHR-T2-ASPIRE" finds lhr-t2-aspire.
 */
export const membershipIdSchema = z.string().trim().toUpperCase().min(3);
export const loungeIdSchema = z.string().trim().toLowerCase().min(3);

/** The lounge access programmes this assistant knows about. */
export const loungeProgrammeSchema = z.enum(["priority_pass", "loungekey", "dragonpass"]);
export type LoungeProgramme = z.infer<typeof loungeProgrammeSchema>;

/** How each programme is written when talking to a traveller. */
export const PROGRAMME_LABELS: Record<LoungeProgramme, string> = {
  priority_pass: "Priority Pass",
  loungekey: "LoungeKey",
  dragonpass: "DragonPass",
};

/**
 * One lounge. `airside` matters more than it looks: a traveller who has not cleared
 * security cannot reach an airside lounge, and an arrivals lounge is landside, so the agent
 * has to be able to say which.
 */
export const loungeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  airport: airportCodeSchema,
  terminal: terminalSchema,
  airside: z.boolean(),
  /** Local opening hours as a lounge publishes them, e.g. "05:00-22:00" or "24 hours". */
  openingHours: z.string().min(1),
  /** Which programmes this lounge accepts. A lounge accepting none would be unreachable. */
  programmes: z.array(loungeProgrammeSchema).nonempty(),
  amenities: z.array(z.string().min(1)),
});

export type Lounge = z.infer<typeof loungeSchema>;

/** Membership level, as printed on the card. Descriptive only — see `visitsRemaining`. */
export const membershipTierSchema = z.enum(["standard", "plus", "prestige"]);
export type MembershipTier = z.infer<typeof membershipTierSchema>;

/**
 * A traveller's lounge membership.
 *
 * `visitsRemaining: null` means an unlimited allowance. Unlimited is stored as data rather
 * than inferred from the tier so the two can never disagree — a tier label is marketing,
 * an allowance is a rule.
 */
export const membershipSchema = z.object({
  id: z.string().min(1),
  holderName: z.string().min(1),
  programme: loungeProgrammeSchema,
  tier: membershipTierSchema,
  /** Prepaid visits left, or null for unlimited. */
  visitsRemaining: z.int().min(0).nullable(),
  guestsAllowed: z.int().min(0),
  /** Last day the card is valid, as `YYYY-MM-DD`. */
  expiresAt: z.iso.date(),
});

export type Membership = z.infer<typeof membershipSchema>;

/**
 * The answer to "can this person actually get in?".
 *
 * `reason` is always populated, including when eligible, because it is the sentence the
 * agent relays to the traveller. `visitsRemaining` and `guestsAllowed` are echoed so the
 * agent can say what is left without a second lookup.
 */
export const entitlementSchema = z.object({
  eligible: z.boolean(),
  reason: z.string().min(1),
  guestsAllowed: z.int().min(0),
  visitsRemaining: z.int().min(0).nullable(),
});

export type Entitlement = z.infer<typeof entitlementSchema>;
