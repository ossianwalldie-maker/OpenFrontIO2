import { Game, UnitType } from "../game/Game";
import { TileRef } from "../game/GameMap";
import {
  ClientID,
  CreateBattlePlanIntent,
  Intent,
  StampedIntent,
  Stance,
} from "../Schemas";

interface BattlePlanState {
  planId: string;
  clientID: ClientID;
  frontline: TileRef[];
  armyGroupIds: string[];
  stance: Stance;
  isExecuting: boolean;
  generatedIntentCount: number;
  lastTick: number;
}

const stanceBudget: Record<Stance, { targets: number; ratio: number }> = {
  aggressive: { targets: 3, ratio: 0.35 },
  balanced: { targets: 2, ratio: 0.22 },
  cautious: { targets: 1, ratio: 0.12 },
};

export class BattlePlannerService {
  private plans = new Map<string, BattlePlanState>();

  private key(clientID: ClientID, planId: string): string {
    return `${clientID}:${planId}`;
  }

  public updateFromIntent(intent: StampedIntent): void {
    switch (intent.type) {
      case "create_battle_plan":
        this.upsert(intent.clientID, intent);
        return;
      case "update_battle_plan": {
        const existing = this.plans.get(
          this.key(intent.clientID, intent.planId),
        );
        if (!existing) {
          return;
        }
        this.plans.set(this.key(intent.clientID, intent.planId), {
          ...existing,
          frontline: intent.frontline,
          armyGroupIds: intent.armyGroupIds,
          stance: intent.stance,
        });
        return;
      }
      case "execute_battle_plan": {
        const existing = this.plans.get(
          this.key(intent.clientID, intent.planId),
        );
        if (!existing) {
          return;
        }
        this.plans.set(this.key(intent.clientID, intent.planId), {
          ...existing,
          isExecuting: intent.action === "execute",
        });
        return;
      }
      default:
        return;
    }
  }

  private upsert(clientID: ClientID, intent: CreateBattlePlanIntent): void {
    this.plans.set(this.key(clientID, intent.planId), {
      planId: intent.planId,
      clientID,
      frontline: intent.frontline,
      armyGroupIds: intent.armyGroupIds,
      stance: intent.stance,
      isExecuting: false,
      generatedIntentCount: 0,
      lastTick: 0,
    });
  }

  public generateIntents(game: Game): StampedIntent[] {
    const output: StampedIntent[] = [];

    for (const plan of this.plans.values()) {
      if (!plan.isExecuting || plan.frontline.length === 0) {
        continue;
      }

      const player = game.playerByClientID(plan.clientID);
      if (!player || !player.isAlive()) {
        continue;
      }

      const targets = new Map<ClientID, number>();
      for (const tile of plan.frontline) {
        if (!game.hasOwner(tile)) {
          continue;
        }

        const owner = game.owner(tile);
        if (!owner.isPlayer()) {
          continue;
        }

        if (owner.id() !== player.id()) {
          targets.set(
            owner.clientID()!,
            (targets.get(owner.clientID()!) ?? 0) + 1,
          );
        }

        game.forEachNeighbor(tile, (neighbor) => {
          if (!game.hasOwner(neighbor)) {
            return;
          }
          const neighborOwner = game.owner(neighbor);
          if (!neighborOwner.isPlayer()) {
            return;
          }
          if (neighborOwner.id() !== player.id()) {
            targets.set(
              neighborOwner.clientID()!,
              (targets.get(neighborOwner.clientID()!) ?? 0) + 1,
            );
          }
        });
      }

      const budget = stanceBudget[plan.stance];
      const sortedTargets = Array.from(targets.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, budget.targets);

      if (sortedTargets.length === 0) {
        continue;
      }

      const troopBudget = player.troops() * budget.ratio;
      const troopPerTarget = troopBudget / sortedTargets.length;
      for (const [targetID] of sortedTargets) {
        output.push({
          clientID: plan.clientID,
          type: "attack",
          targetID,
          troops: troopPerTarget,
        });
      }

      const warship = player.units(UnitType.Warship)[0];
      const frontTile = plan.frontline[game.ticks() % plan.frontline.length];
      if (warship && frontTile) {
        output.push({
          clientID: plan.clientID,
          type: "move_warship",
          unitId: warship.id(),
          tile: frontTile,
        });
      }

      plan.generatedIntentCount += sortedTargets.length;
      plan.lastTick = game.ticks();
    }

    return output;
  }

  public ingestTurnIntents(intents: StampedIntent[]): void {
    intents.forEach((intent) => this.updateFromIntent(intent));
  }
}

export function isBattlePlanIntent(intent: Intent): boolean {
  return (
    intent.type === "create_battle_plan" ||
    intent.type === "update_battle_plan" ||
    intent.type === "execute_battle_plan"
  );
}
