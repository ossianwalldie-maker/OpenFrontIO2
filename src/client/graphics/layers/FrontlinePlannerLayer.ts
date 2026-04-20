import { EventBus, GameEvent } from "../../../core/EventBus";
import { GameView } from "../../../core/game/GameView";
import { MouseUpEvent } from "../../InputHandler";
import { TransformHandler } from "../TransformHandler";
import { UIState } from "../UIState";
import { Layer } from "./Layer";

export class PlannerEditModeEvent implements GameEvent {
  constructor(public readonly enabled: boolean) {}
}

export class PlannerFrontlineChangedEvent implements GameEvent {
  constructor(public readonly frontline: number[]) {}
}

export class PlannerProgressEvent implements GameEvent {
  constructor(
    public readonly percent: number,
    public readonly frontlineSize: number,
  ) {}
}

export class PlannerClearFrontlineEvent implements GameEvent {}

export class PlannerUndoFrontlineEvent implements GameEvent {}

export class FrontlinePlannerLayer implements Layer {
  private editing = false;
  private frontline: number[] = [];

  constructor(
    private game: GameView,
    private eventBus: EventBus,
    private transformHandler: TransformHandler,
    private uiState: UIState,
  ) {}

  init(): void {
    this.eventBus.on(PlannerEditModeEvent, (e) => {
      this.editing = e.enabled;
      this.uiState.isPlanningFrontline = e.enabled;
    });

    this.eventBus.on(PlannerFrontlineChangedEvent, (e) => {
      this.frontline = e.frontline;
    });

    this.eventBus.on(PlannerClearFrontlineEvent, () => {
      this.frontline = [];
      this.eventBus.emit(new PlannerFrontlineChangedEvent([]));
    });

    this.eventBus.on(PlannerUndoFrontlineEvent, () => {
      if (this.frontline.length === 0) {
        return;
      }
      this.frontline = this.frontline.slice(0, -1);
      this.eventBus.emit(new PlannerFrontlineChangedEvent(this.frontline));
    });

    this.eventBus.on(MouseUpEvent, (e) => {
      if (!this.editing || this.game.inSpawnPhase()) {
        return;
      }
      const world = this.transformHandler.screenToWorldCoordinates(e.x, e.y);
      if (!this.game.isValidCoord(world.x, world.y)) {
        return;
      }
      const tile = this.game.ref(world.x, world.y);
      const next = this.frontline.includes(tile)
        ? this.frontline
        : [...this.frontline, tile];
      this.frontline = next;
      this.eventBus.emit(new PlannerFrontlineChangedEvent(next));
    });
  }

  shouldTransform(): boolean {
    return true;
  }

  tick(): void {
    if (this.frontline.length === 0) {
      this.eventBus.emit(new PlannerProgressEvent(0, 0));
      return;
    }

    const me = this.game.myPlayer();
    if (!me) {
      return;
    }

    let controlled = 0;
    for (const tile of this.frontline) {
      if (this.game.hasOwner(tile) && this.game.owner(tile).id() === me.id()) {
        controlled++;
      }
    }
    this.eventBus.emit(
      new PlannerProgressEvent(
        Math.round((controlled / this.frontline.length) * 100),
        this.frontline.length,
      ),
    );
  }

  renderLayer(context: CanvasRenderingContext2D): void {
    if (this.frontline.length === 0) {
      return;
    }

    context.save();
    context.strokeStyle = this.editing ? "#f59e0b" : "#22c55e";
    context.fillStyle = "#f59e0b";
    context.lineWidth = 2;

    context.beginPath();
    this.frontline.forEach((tile, idx) => {
      const x = this.game.x(tile) + 0.5;
      const y = this.game.y(tile) + 0.5;
      if (idx === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
      context.fillRect(x - 0.2, y - 0.2, 0.4, 0.4);
    });
    context.stroke();
    context.restore();
  }
}
