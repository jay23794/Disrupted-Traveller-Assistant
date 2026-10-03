import { z } from "zod";
import { addDays, todayIsoDate } from "../../../shared/utils/dates.js";
import type { MembershipRepository } from "../lounge.repository.js";
import {
  loungeProgrammeSchema,
  membershipSchema,
  membershipTierSchema,
  type Membership,
} from "../lounge.schema.js";
import memberships from "../data/memberships.json" with { type: "json" };

/**
 * A membership as stored on disk. Expiry is relative (`expiresInDays: -30` expired a month
 * ago) for the same reason flight dates are: the expired card in the demo stays expired and
 * the valid ones stay valid, whenever a reviewer runs this.
 */
const membershipRecordSchema = z.object({
  id: z.string().min(1),
  holderName: z.string().min(1),
  programme: loungeProgrammeSchema,
  tier: membershipTierSchema,
  visitsRemaining: z.int().min(0).nullable(),
  guestsAllowed: z.int().min(0),
  /** Days from today the card expires; negative means it already has. */
  expiresInDays: z.int(),
});

type MembershipRecord = z.infer<typeof membershipRecordSchema>;

function toMembership(record: MembershipRecord, now: Date): Membership {
  const { expiresInDays, ...membership } = record;

  return membershipSchema.parse({
    ...membership,
    expiresAt: addDays(todayIsoDate(now), expiresInDays),
  });
}

/** Stands in for a membership/CRM lookup, reading the JSON fixtures. */
export class MockMembershipProvider implements MembershipRepository {
  private _records: MembershipRecord[];
  private _now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this._records = z.array(membershipRecordSchema).parse(memberships);
    this._now = now;
  }

  async findById(membershipId: string): Promise<Membership | null> {
    const record = this._records.find((candidate) => candidate.id === membershipId);
    return record ? toMembership(record, this._now()) : null;
  }
}
