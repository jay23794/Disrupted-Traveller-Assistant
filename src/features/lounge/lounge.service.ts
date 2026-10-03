import { NotFoundError } from "../../shared/errors/app-error.js";
import { todayIsoDate } from "../../shared/utils/dates.js";
import { parseOrThrow } from "../../shared/utils/parse.js";
import type { LoungeRepository, MembershipRepository } from "./lounge.repository.js";
import {
  airportCodeSchema,
  loungeIdSchema,
  membershipIdSchema,
  terminalSchema,
  PROGRAMME_LABELS,
  type Entitlement,
  type Lounge,
  type LoungeProgramme,
  type Membership,
} from "./lounge.schema.js";

const listProgrammes = (programmes: LoungeProgramme[]): string =>
  programmes.map((programme) => PROGRAMME_LABELS[programme]).join(" or ");

const describeVisits = (visitsRemaining: number | null): string =>
  visitsRemaining === null ? "unlimited visits" : `${visitsRemaining} prepaid visit(s) left`;

const describeGuests = (guestsAllowed: number): string =>
  guestsAllowed === 0 ? "no free guests" : `${guestsAllowed} free guest(s)`;

/**
 * The lounge feature's business logic: find lounges, and decide whether a membership
 * actually gets its holder through the door.
 *
 * Entitlement is pure deterministic rule evaluation — no model involved. The agent decides
 * what to say; this decides what is true, so the same membership and lounge always produce
 * the same verdict and it can be tested exhaustively.
 */
export class LoungeService {
  constructor(
    private _loungeRepo: LoungeRepository,
    private _membershipRepo: MembershipRepository,
  ) {}

  /**
   * Lounges at an airport, optionally narrowed to a terminal ("T5", "Terminal 5" and "5"
   * are the same place).
   *
   * An empty list is a legitimate answer, not an error: a terminal can simply have no
   * lounge, and the agent needs to be able to say so rather than apologise for a failure.
   */
  async searchLounges(airport: string, terminal?: string): Promise<Lounge[]> {
    const airportCode = parseOrThrow(airportCodeSchema, airport, "airport code");
    const where =
      terminal === undefined ? undefined : parseOrThrow(terminalSchema, terminal, "terminal");

    return this._loungeRepo.search(airportCode, where);
  }

  /**
   * Whether one membership admits its holder to one lounge, and why.
   *
   * The three rules are checked in a fixed order — programme, then expiry, then visits — so
   * a membership that fails more than one always reports the same reason.
   */
  async checkEntitlement(membershipId: string, loungeId: string): Promise<Entitlement> {
    const memberId = parseOrThrow(membershipIdSchema, membershipId, "membership id");
    const lounge = await this._findLounge(loungeId);
    const membership = await this._findMembership(memberId);

    // Echoed on every answer, eligible or not: a traveller refused for an expired card
    // still wants to know what the card carried.
    const allowance = {
      guestsAllowed: membership.guestsAllowed,
      visitsRemaining: membership.visitsRemaining,
    };
    const programme = PROGRAMME_LABELS[membership.programme];

    if (!lounge.programmes.includes(membership.programme)) {
      return {
        eligible: false,
        reason: `${lounge.name} does not accept ${programme}. It accepts ${listProgrammes(lounge.programmes)}.`,
        ...allowance,
      };
    }

    // The expiry date itself is still a valid day, so only a date before today fails.
    if (membership.expiresAt < todayIsoDate()) {
      return {
        eligible: false,
        reason: `This ${programme} membership expired on ${membership.expiresAt}.`,
        ...allowance,
      };
    }

    if (membership.visitsRemaining !== null && membership.visitsRemaining <= 0) {
      return {
        eligible: false,
        reason: `This ${programme} ${membership.tier} membership has no prepaid visits left. Entry would be chargeable at the door.`,
        ...allowance,
      };
    }

    return {
      eligible: true,
      reason: `${membership.holderName} may enter ${lounge.name} on ${programme} ${membership.tier}: ${describeVisits(membership.visitsRemaining)}, ${describeGuests(membership.guestsAllowed)}.`,
      ...allowance,
    };
  }

  private async _findLounge(loungeId: string): Promise<Lounge> {
    const id = parseOrThrow(loungeIdSchema, loungeId, "lounge id");
    const lounge = await this._loungeRepo.findById(id);

    if (!lounge) {
      throw new NotFoundError(`No lounge found with id "${id}". Search for lounges first to get valid ids.`);
    }
    return lounge;
  }

  private async _findMembership(membershipId: string): Promise<Membership> {
    const membership = await this._membershipRepo.findById(membershipId);

    if (!membership) {
      throw new NotFoundError(`No membership found with id "${membershipId}".`);
    }
    return membership;
  }
}
