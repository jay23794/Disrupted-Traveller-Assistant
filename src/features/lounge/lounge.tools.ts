import { z } from "zod";
import type { AnyTool, Tool } from "../../core/tool.js";
import type { LoungeService } from "./lounge.service.js";

/**
 * As in the flight feature, formats are described rather than enforced here: LoungeService
 * owns the rules, and its ValidationError comes back to the model as a message it can
 * correct from.
 */
const searchLoungesArgs = z.object({
  airport: z.string().min(3).describe('Three-letter IATA airport code, e.g. "LHR".'),
  terminal: z
    .string()
    .min(1)
    .optional()
    .describe('Terminal to narrow to, e.g. "5" or "T5". Omit to list every terminal.'),
});

const checkEntitlementArgs = z.object({
  membershipId: z
    .string()
    .min(3)
    .describe('The traveller\'s membership id, e.g. "PP-1001". Ask for it if not given.'),
  loungeId: z
    .string()
    .min(3)
    .describe('The lounge id from search_lounges, e.g. "lhr-t5-aspire-spa". Not the name.'),
});

/** The lounge agent's tools: find lounges, then check whether this traveller gets in. */
export function createLoungeTools(loungeService: LoungeService): AnyTool[] {
  const searchLounges: Tool<z.infer<typeof searchLoungesArgs>> = {
    name: "search_lounges",
    description:
      "List the lounges at an airport, optionally for one terminal, with their id, " +
      "opening hours, whether they are airside or landside, which membership programmes " +
      "they accept and what facilities they have. Use this whenever the traveller asks " +
      "what lounges are available or where they can wait. An empty list is a real answer " +
      "and means there are none — never fill the gap with a lounge you remember.",
    schema: searchLoungesArgs,
    execute: ({ airport, terminal }) => loungeService.searchLounges(airport, terminal),
  };

  const checkEntitlement: Tool<z.infer<typeof checkEntitlementArgs>> = {
    name: "check_membership_entitlement",
    description:
      "Check whether a specific membership admits its holder to a specific lounge, and " +
      "why. Returns eligibility, the reason, how many guests are included and how many " +
      "visits are left. Call this before telling anyone they can get into a lounge: a " +
      "lounge accepting their programme is not the same as their card being valid and " +
      "having visits left.",
    schema: checkEntitlementArgs,
    execute: ({ membershipId, loungeId }) =>
      loungeService.checkEntitlement(membershipId, loungeId),
  };

  return [searchLounges, checkEntitlement];
}
