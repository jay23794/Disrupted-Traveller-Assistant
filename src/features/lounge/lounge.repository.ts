import type { Lounge, Membership } from "./lounge.schema.js";

/**
 * How the lounge feature reads lounge data. Filtering lives behind the interface because a
 * real implementation would push it to the API or database rather than fetching every
 * lounge in the world and narrowing in memory.
 */
export interface LoungeRepository {
  /** Lounges at an airport, optionally narrowed to one terminal. Empty is a valid answer. */
  search(airport: string, terminal?: string): Promise<Lounge[]>;
  findById(loungeId: string): Promise<Lounge | null>;
}

export interface MembershipRepository {
  findById(membershipId: string): Promise<Membership | null>;
}
