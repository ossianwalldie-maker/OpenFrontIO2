import { Execution, Game } from "../../game/Game";
import { GameImpl } from "../../game/GameImpl";

const JUSTIFICATIONS = [
  "border_incidents",
  "trade_disruption",
  "ally_protection",
  "resource_security",
] as const;

export class DiplomacyTickExecution implements Execution {
  private mg!: GameImpl;
  private readonly warGoalGenerationTicks = 20 * 10;
  private readonly warGoalJustificationTicks = 60 * 10;

  activeDuringSpawnPhase(): boolean {
    return true;
  }

  init(mg: Game): void {
    this.mg = mg as GameImpl;
  }

  tick(): void {
    this.mg.globalTension = Math.max(0, this.mg.globalTension - 0.002);

    for (const p of this.mg.players()) {
      if (p.outgoingAttacks().length > 0 || p.incomingAttacks().length > 0) {
        this.mg.globalTension = Math.min(100, this.mg.globalTension + 0.01);
      }
    }

    this.tickWarGoals();
    this.enforceGuarantees();

    const now = this.mg.ticks();
    this.mg.guarantees = this.mg.guarantees.filter((g) => g.expiresAt > now);
    this.mg.nonAggressionPacts = this.mg.nonAggressionPacts.filter(
      (p) => p.expiresAt > now,
    );
  }

  isActive(): boolean {
    return true;
  }

  private tickWarGoals(): void {
    for (const player of this.mg.players()) {
      const goals = this.mg.warGoals.get(player.id()) ?? [];
      const goalsByTarget = new Map(goals.map((g) => [g.targetID, g]));

      for (const target of player.targets()) {
        if (target === player || player.isFriendly(target)) continue;
        const goal = goalsByTarget.get(target.id());
        if (!goal) {
          goals.push({
            targetID: target.id(),
            progressTicks: 1,
            generatedAt: this.mg.ticks(),
            justification:
              JUSTIFICATIONS[
                (player.smallID() + target.smallID() + this.mg.ticks()) %
                  JUSTIFICATIONS.length
              ] ?? JUSTIFICATIONS[0],
          });
          continue;
        }

        goal.progressTicks += 1;
        if (
          goal.progressTicks >= this.warGoalGenerationTicks &&
          goal.justifiedAt === undefined
        ) {
          goal.justifiedAt = this.mg.ticks() + this.warGoalJustificationTicks;
          this.mg.globalTension = Math.min(100, this.mg.globalTension + 0.5);
        }
      }

      const targetSet = new Set(player.targets().map((t) => t.id()));
      this.mg.warGoals.set(
        player.id(),
        goals.filter((g) => targetSet.has(g.targetID)),
      );
    }
  }

  private enforceGuarantees(): void {
    for (const guarantee of this.mg.guarantees) {
      const guarantor = this.mg.player(guarantee.guarantorID);
      const beneficiary = this.mg.player(guarantee.beneficiaryID);
      if (!guarantor || !beneficiary || !beneficiary.isAlive()) continue;

      if (beneficiary.incomingAttacks().length === 0) continue;
      const attacker = beneficiary.incomingAttacks()[0]?.attacker();
      if (!attacker || !attacker.isPlayer()) continue;
      if (guarantor.canTarget(attacker)) {
        guarantor.target(attacker);
        this.mg.globalTension = Math.min(100, this.mg.globalTension + 0.1);
      }
    }
  }
}
