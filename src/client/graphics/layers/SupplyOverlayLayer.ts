import { GameView } from "../../../core/game/GameView";
import { UserSettings } from "../../../core/game/UserSettings";
import { Layer } from "./Layer";

export class SupplyOverlayLayer implements Layer {
  constructor(
    private game: GameView,
    private userSettings: UserSettings,
  ) {}

  shouldTransform(): boolean {
    return true;
  }

  renderLayer(context: CanvasRenderingContext2D): void {
    if (!this.userSettings.supplyOverlay()) {
      return;
    }

    const myPlayer = this.game.myPlayer();
    for (let y = 0; y < this.game.height(); y++) {
      for (let x = 0; x < this.game.width(); x++) {
        const tile = this.game.ref(x, y);
        if (!this.game.isLand(tile)) {
          continue;
        }
        if (myPlayer && this.game.ownerID(tile) !== myPlayer.smallID()) {
          continue;
        }
        const supply = this.game.supplyAt(tile);
        if (supply >= 0.99) {
          continue;
        }
        const alpha = Math.min(0.55, 0.6 * (1 - supply));
        const red = Math.round(255 * (1 - supply));
        const green = Math.round(220 * supply);
        context.fillStyle = `rgba(${red}, ${green}, 60, ${alpha})`;
        context.fillRect(x, y, 1, 1);
      }
    }
  }
}
