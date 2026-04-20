import { Execution, Game, Player } from "../../game/Game";
import { GameImpl } from "../../game/GameImpl";

const DEFAULT_DURATION = 300 * 10;

export type DiplomacyAction =
  | { type: "create_faction"; name: string }
  | { type: "invite_to_faction"; recipientID: string }
  | { type: "join_faction"; leaderID: string }
  | { type: "leave_faction" }
  | { type: "propose_guarantee"; recipientID: string }
  | { type: "revoke_guarantee"; recipientID: string }
  | { type: "propose_non_aggression_pact"; recipientID: string }
  | { type: "cancel_non_aggression_pact"; recipientID: string };

export class DiplomacyIntentExecution implements Execution {
  private mg!: GameImpl;

  constructor(
    private readonly player: Player,
    private readonly action: DiplomacyAction,
  ) {}

  activeDuringSpawnPhase(): boolean {
    return true;
  }

  init(mg: Game): void {
    this.mg = mg as GameImpl;

    switch (this.action.type) {
      case "create_faction":
        this.createFaction(this.action.name);
        break;
      case "invite_to_faction":
        this.inviteToFaction(this.action.recipientID);
        break;
      case "join_faction":
        this.joinFaction(this.action.leaderID);
        break;
      case "leave_faction":
        this.leaveFaction();
        break;
      case "propose_guarantee":
        this.proposeGuarantee(this.action.recipientID);
        break;
      case "revoke_guarantee":
        this.revokeGuarantee(this.action.recipientID);
        break;
      case "propose_non_aggression_pact":
        this.proposePact(this.action.recipientID);
        break;
      case "cancel_non_aggression_pact":
        this.cancelPact(this.action.recipientID);
        break;
    }
  }

  tick(): void {}

  isActive(): boolean {
    return false;
  }

  private factionIdFor(playerID: string): string | null {
    for (const [id, faction] of this.mg.diplomacyFactions.entries()) {
      if (faction.members.has(playerID)) return id;
    }
    return null;
  }

  private createFaction(name: string): void {
    if (this.factionIdFor(this.player.id())) return;
    const id = `f_${this.player.smallID()}_${this.mg.ticks()}`;
    this.mg.diplomacyFactions.set(id, {
      name,
      leaderID: this.player.id(),
      members: new Set([this.player.id()]),
    });
  }

  private inviteToFaction(recipientID: string): void {
    const factionID = this.factionIdFor(this.player.id());
    if (!factionID) return;
    const faction = this.mg.diplomacyFactions.get(factionID);
    if (!faction || faction.leaderID !== this.player.id()) return;

    const inviteSet = this.mg.factionInvites.get(recipientID) ?? new Set();
    inviteSet.add(factionID);
    this.mg.factionInvites.set(recipientID, inviteSet);
  }

  private joinFaction(leaderID: string): void {
    if (this.factionIdFor(this.player.id())) return;
    const factionID = this.factionIdFor(leaderID);
    if (!factionID) return;

    const invites = this.mg.factionInvites.get(this.player.id());
    if (!invites?.has(factionID)) return;

    this.mg.diplomacyFactions.get(factionID)?.members.add(this.player.id());
    invites.delete(factionID);
  }

  private leaveFaction(): void {
    const factionID = this.factionIdFor(this.player.id());
    if (!factionID) return;
    const faction = this.mg.diplomacyFactions.get(factionID);
    if (!faction) return;

    faction.members.delete(this.player.id());
    if (faction.leaderID === this.player.id()) {
      this.mg.diplomacyFactions.delete(factionID);
      for (const invites of this.mg.factionInvites.values()) {
        invites.delete(factionID);
      }
      return;
    }
    if (faction.members.size === 0) {
      this.mg.diplomacyFactions.delete(factionID);
    }
  }

  private proposeGuarantee(recipientID: string): void {
    if (recipientID === this.player.id()) return;
    this.mg.guarantees = this.mg.guarantees.filter(
      (g) =>
        !(
          g.guarantorID === this.player.id() && g.beneficiaryID === recipientID
        ),
    );
    this.mg.guarantees.push({
      guarantorID: this.player.id(),
      beneficiaryID: recipientID,
      expiresAt: this.mg.ticks() + DEFAULT_DURATION,
      condition: "if_attacked",
    });
  }

  private revokeGuarantee(recipientID: string): void {
    this.mg.guarantees = this.mg.guarantees.filter(
      (g) =>
        !(
          g.guarantorID === this.player.id() && g.beneficiaryID === recipientID
        ),
    );
  }

  private proposePact(recipientID: string): void {
    if (recipientID === this.player.id()) return;
    if (
      this.mg.nonAggressionPacts.some(
        (p) =>
          (p.playerA === this.player.id() && p.playerB === recipientID) ||
          (p.playerB === this.player.id() && p.playerA === recipientID),
      )
    ) {
      return;
    }
    this.mg.nonAggressionPacts.push({
      playerA: this.player.id(),
      playerB: recipientID,
      expiresAt: this.mg.ticks() + DEFAULT_DURATION,
    });
  }

  private cancelPact(recipientID: string): void {
    this.mg.nonAggressionPacts = this.mg.nonAggressionPacts.filter(
      (p) =>
        !(
          (p.playerA === this.player.id() && p.playerB === recipientID) ||
          (p.playerB === this.player.id() && p.playerA === recipientID)
        ),
    );
  }
}
