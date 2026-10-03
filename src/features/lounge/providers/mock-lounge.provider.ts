import { z } from "zod";
import type { LoungeRepository } from "../lounge.repository.js";
import { loungeSchema, type Lounge } from "../lounge.schema.js";
import lounges from "../data/lounges.json" with { type: "json" };

/**
 * Stands in for a lounge directory API, reading the JSON fixtures.
 *
 * Records are validated once at construction, so a malformed fixture fails at boot rather
 * than mid-conversation. Parsing also normalises: whatever the file says, every lounge
 * leaves here with an uppercase airport code and a bare terminal label.
 */
export class MockLoungeProvider implements LoungeRepository {
  private _lounges: Lounge[];

  constructor() {
    this._lounges = z.array(loungeSchema).parse(lounges);
  }

  async search(airport: string, terminal?: string): Promise<Lounge[]> {
    return this._lounges.filter(
      (lounge) =>
        lounge.airport === airport && (terminal === undefined || lounge.terminal === terminal),
    );
  }

  async findById(loungeId: string): Promise<Lounge | null> {
    return this._lounges.find((lounge) => lounge.id === loungeId) ?? null;
  }
}
