import { Difficulty, Game, Player, Relation } from "../../game/Game";

export enum AiProfilePreset {
  Historical = "historical",
  AggressiveNaval = "aggressive_naval",
  TurtleIndustry = "turtle_industry",
  ExpansionistFront = "expansionist_front",
}

export type AiObjective =
  | "expand"
  | "defend"
  | "punish_hostile"
  | "support_allies"
  | "naval_pressure";

export interface ThreatAssessment {
  neighboringEnemies: number;
  neighboringFriendlies: number;
  strongestEnemyTroops: number;
  isOutnumbered: boolean;
  hasHostileRelation: boolean;
}

export interface StrategyTickTelemetry {
  tick: number;
  profile: AiProfilePreset;
  objective: AiObjective;
  threat: ThreatAssessment;
  plan: {
    pushFrontline: boolean;
    focusEconomy: boolean;
    navalPressure: boolean;
    seekAlliance: boolean;
    useStrategicWeapons: boolean;
  };
}

interface ProfileTuning {
  triggerRatio: number;
  reserveRatio: number;
  expandRatio: number;
  attackRateMultiplier: number;
}

interface StrategyContext {
  tick: number;
  difficulty: Difficulty;
  player: Player;
  assessThreat: () => ThreatAssessment;
  executeAlliance: () => void;
  executeMIRV: () => void;
  executeStructures: () => void;
  executeWarshipSpawn: () => void;
  executeEmbargoes: () => void;
  executeAttack: () => void;
  executeCounterWarships: () => void;
  executeNuke: () => void;
  reportTelemetry: (telemetry: StrategyTickTelemetry) => void;
}

export class NationStrategyController {
  constructor(
    private readonly profile: AiProfilePreset,
    private readonly randomChance: (percentChance: number) => boolean,
  ) {}

  static profileTuning(profile: AiProfilePreset): ProfileTuning {
    switch (profile) {
      case AiProfilePreset.Historical:
        return {
          triggerRatio: 0.56,
          reserveRatio: 0.34,
          expandRatio: 0.15,
          attackRateMultiplier: 1,
        };
      case AiProfilePreset.AggressiveNaval:
        return {
          triggerRatio: 0.5,
          reserveRatio: 0.3,
          expandRatio: 0.2,
          attackRateMultiplier: 0.9,
        };
      case AiProfilePreset.TurtleIndustry:
        return {
          triggerRatio: 0.62,
          reserveRatio: 0.42,
          expandRatio: 0.1,
          attackRateMultiplier: 1.12,
        };
      case AiProfilePreset.ExpansionistFront:
        return {
          triggerRatio: 0.53,
          reserveRatio: 0.3,
          expandRatio: 0.2,
          attackRateMultiplier: 0.95,
        };
      default:
        return {
          triggerRatio: 0.56,
          reserveRatio: 0.34,
          expandRatio: 0.15,
          attackRateMultiplier: 1,
        };
    }
  }

  runTick(context: StrategyContext): void {
    const threat = context.assessThreat();
    const objective = this.selectObjective(context.player, threat);
    const plan = this.generatePlan(objective, context.difficulty, threat);

    context.reportTelemetry({
      tick: context.tick,
      profile: this.profile,
      objective,
      threat,
      plan,
    });

    if (plan.seekAlliance) {
      context.executeAlliance();
    }

    if (plan.focusEconomy) {
      context.executeStructures();
      if (this.randomChance(40)) {
        context.executeWarshipSpawn();
      }
    } else {
      context.executeMIRV();
      context.executeStructures();
      context.executeWarshipSpawn();
    }

    context.executeEmbargoes();

    if (plan.pushFrontline || this.randomChance(15)) {
      context.executeAttack();
    }

    context.executeCounterWarships();

    if (plan.useStrategicWeapons && this.randomChance(70)) {
      context.executeNuke();
    } else if (this.randomChance(20)) {
      context.executeNuke();
    }
  }

  private selectObjective(
    player: Player,
    threat: ThreatAssessment,
  ): AiObjective {
    if (
      this.profile === AiProfilePreset.AggressiveNaval &&
      threat.neighboringEnemies > 0
    ) {
      return "naval_pressure";
    }
    if (threat.isOutnumbered || threat.hasHostileRelation) {
      return "defend";
    }
    if (
      threat.neighboringFriendlies > 0 &&
      this.profile === AiProfilePreset.Historical
    ) {
      return "support_allies";
    }
    if (
      player.troops() > threat.strongestEnemyTroops * 1.2 &&
      threat.neighboringEnemies > 0
    ) {
      return "punish_hostile";
    }
    return "expand";
  }

  private generatePlan(
    objective: AiObjective,
    difficulty: Difficulty,
    threat: ThreatAssessment,
  ): StrategyTickTelemetry["plan"] {
    const isHighDifficulty =
      difficulty === Difficulty.Hard || difficulty === Difficulty.Impossible;

    switch (objective) {
      case "defend":
        return {
          pushFrontline: isHighDifficulty,
          focusEconomy: true,
          navalPressure: false,
          seekAlliance: true,
          useStrategicWeapons: isHighDifficulty || threat.hasHostileRelation,
        };
      case "naval_pressure":
        return {
          pushFrontline: true,
          focusEconomy: false,
          navalPressure: true,
          seekAlliance: false,
          useStrategicWeapons: isHighDifficulty,
        };
      case "punish_hostile":
        return {
          pushFrontline: true,
          focusEconomy: false,
          navalPressure: true,
          seekAlliance: false,
          useStrategicWeapons: true,
        };
      case "support_allies":
        return {
          pushFrontline: true,
          focusEconomy: false,
          navalPressure: false,
          seekAlliance: true,
          useStrategicWeapons: false,
        };
      case "expand":
      default:
        return {
          pushFrontline: true,
          focusEconomy: this.profile === AiProfilePreset.TurtleIndustry,
          navalPressure: false,
          seekAlliance: threat.neighboringEnemies > 0,
          useStrategicWeapons: isHighDifficulty,
        };
    }
  }
}

export function computeThreatAssessment(
  game: Game,
  player: Player,
): ThreatAssessment {
  const borderingPlayers = [
    ...new Set(
      Array.from(player.borderTiles())
        .flatMap((tile) => game.neighbors(tile))
        .map((tile) => game.owner(tile))
        .filter(
          (owner): owner is Player =>
            owner.isPlayer() && owner.id() !== player.id(),
        ),
    ),
  ];

  const neighboringFriendlies = borderingPlayers.filter((other) =>
    player.isFriendly(other),
  );
  const neighboringEnemies = borderingPlayers.filter(
    (other) => !player.isFriendly(other),
  );
  const strongestEnemyTroops = neighboringEnemies.reduce(
    (max, enemy) => Math.max(max, enemy.troops()),
    0,
  );

  const hasHostileRelation = neighboringEnemies.some(
    (enemy) => player.relation(enemy) <= Relation.Hostile,
  );

  return {
    neighboringEnemies: neighboringEnemies.length,
    neighboringFriendlies: neighboringFriendlies.length,
    strongestEnemyTroops,
    isOutnumbered: player.troops() < strongestEnemyTroops,
    hasHostileRelation,
  };
}
