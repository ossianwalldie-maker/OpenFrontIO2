import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { assetUrl } from "../../../core/AssetUrls";
import { EventBus } from "../../../core/EventBus";
import { GameType } from "../../../core/game/Game";
import { GameView } from "../../../core/game/GameView";
import { Stance } from "../../../core/Schemas";
import { crazyGamesSDK } from "../../CrazyGamesSDK";
import { TogglePauseIntentEvent } from "../../InputHandler";
import {
  PauseGameIntentEvent,
  SendCreateBattlePlanIntentEvent,
  SendExecuteBattlePlanIntentEvent,
  SendUpdateBattlePlanIntentEvent,
  SendWinnerEvent,
} from "../../Transport";
import { translateText } from "../../Utils";
import {
  PlannerClearFrontlineEvent,
  PlannerEditModeEvent,
  PlannerFrontlineChangedEvent,
  PlannerProgressEvent,
  PlannerUndoFrontlineEvent,
} from "./FrontlinePlannerLayer";
import { ImmunityBarVisibleEvent } from "./ImmunityTimer";
import { Layer } from "./Layer";
import { ShowReplayPanelEvent } from "./ReplayPanel";
import { ShowSettingsModalEvent } from "./SettingsModal";
import { SpawnBarVisibleEvent } from "./SpawnTimer";
const exitIcon = assetUrl("images/ExitIconWhite.svg");
const FastForwardIconSolid = assetUrl("images/FastForwardIconSolidWhite.svg");
const pauseIcon = assetUrl("images/PauseIconWhite.svg");
const playIcon = assetUrl("images/PlayIconWhite.svg");
const settingsIcon = assetUrl("images/SettingIconWhite.svg");

@customElement("game-right-sidebar")
export class GameRightSidebar extends LitElement implements Layer {
  public game: GameView;
  public eventBus: EventBus;

  @state()
  private _isSinglePlayer: boolean = false;

  @state()
  private _isReplayVisible: boolean = false;

  @state()
  private _isVisible: boolean = true;

  @state()
  private isPaused: boolean = false;

  @state()
  private timer: number = 0;
  @state()
  private plannerEditing = false;
  @state()
  private plannerFrontline: number[] = [];
  @state()
  private plannerStance: Stance = "balanced";
  @state()
  private plannerArmyGroups = "army-group-1";
  @state()
  private plannerExecuting = false;
  @state()
  private plannerProgress = 0;
  @state()
  private plannerHasSavedPlan = false;

  private hasWinner = false;
  private isLobbyCreator = false;
  private spawnBarVisible = false;
  private immunityBarVisible = false;

  createRenderRoot() {
    return this;
  }

  init() {
    this._isSinglePlayer =
      this.game?.config()?.gameConfig()?.gameType === GameType.Singleplayer ||
      this.game.config().isReplay();
    this._isVisible = true;
    this.game.inSpawnPhase();

    this.eventBus.on(SpawnBarVisibleEvent, (e) => {
      this.spawnBarVisible = e.visible;
      this.updateParentOffset();
    });
    this.eventBus.on(ImmunityBarVisibleEvent, (e) => {
      this.immunityBarVisible = e.visible;
      this.updateParentOffset();
    });

    this.eventBus.on(SendWinnerEvent, () => {
      this.hasWinner = true;
      this.requestUpdate();
    });

    this.eventBus.on(TogglePauseIntentEvent, () => {
      const isReplayOrSingleplayer =
        this._isSinglePlayer || this.game?.config()?.isReplay();
      if (isReplayOrSingleplayer || this.isLobbyCreator) {
        this.onPauseButtonClick();
      }
    });
    this.eventBus.on(PlannerFrontlineChangedEvent, (e) => {
      this.plannerFrontline = e.frontline;
    });
    this.eventBus.on(PlannerProgressEvent, (e) => {
      this.plannerProgress = e.percent;
      if (e.frontlineSize === 0) {
        this.plannerExecuting = false;
      }
    });

    this.requestUpdate();
  }

  getTickIntervalMs() {
    return 250;
  }

  tick() {
    // Timer logic
    // Check if the player is the lobby creator
    if (!this.isLobbyCreator && this.game.myPlayer()?.isLobbyCreator()) {
      this.isLobbyCreator = true;
      this.requestUpdate();
    }

    const maxTimerValue = this.game.config().gameConfig().maxTimerValue;
    const spawnPhaseTurns = this.game.config().numSpawnPhaseTurns();
    const ticks = this.game.ticks();
    const gameTicks = Math.max(0, ticks - spawnPhaseTurns);
    const elapsedSeconds = Math.floor(gameTicks / 10); // 10 ticks per second

    if (this.game.inSpawnPhase()) {
      this.timer =
        maxTimerValue !== null && maxTimerValue !== undefined
          ? maxTimerValue * 60
          : 0;
      return;
    }

    if (this.hasWinner) {
      return;
    }

    if (maxTimerValue !== null && maxTimerValue !== undefined) {
      this.timer = Math.max(0, maxTimerValue * 60 - elapsedSeconds);
    } else {
      this.timer = elapsedSeconds;
    }
  }

  private updateParentOffset(): void {
    const offset =
      (this.spawnBarVisible ? 7 : 0) + (this.immunityBarVisible ? 7 : 0);
    const parent = this.parentElement as HTMLElement;
    if (parent) {
      parent.style.marginTop = `${offset}px`;
    }
  }

  private secondsToHms = (d: number): string => {
    const pad = (n: number) => (n < 10 ? `0${n}` : n);

    const h = Math.floor(d / 3600);
    const m = Math.floor((d % 3600) / 60);
    const s = Math.floor((d % 3600) % 60);

    if (h !== 0) {
      return `${pad(h)}:${pad(m)}:${pad(s)}`;
    } else {
      return `${pad(m)}:${pad(s)}`;
    }
  };

  private toggleReplayPanel(): void {
    this._isReplayVisible = !this._isReplayVisible;
    this.eventBus.emit(
      new ShowReplayPanelEvent(this._isReplayVisible, this._isSinglePlayer),
    );
  }

  private onPauseButtonClick() {
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      crazyGamesSDK.gameplayStop();
    } else {
      crazyGamesSDK.gameplayStart();
    }
    this.eventBus.emit(new PauseGameIntentEvent(this.isPaused));
  }

  private async onExitButtonClick() {
    const isAlive = this.game.myPlayer()?.isAlive();
    if (isAlive) {
      const isConfirmed = confirm(
        translateText("help_modal.exit_confirmation"),
      );
      if (!isConfirmed) return;
    }
    await crazyGamesSDK.requestMidgameAd();
    await crazyGamesSDK.gameplayStop();
    // redirect to the home page
    window.location.href = "/";
  }

  private onSettingsButtonClick() {
    this.eventBus.emit(
      new ShowSettingsModalEvent(true, this._isSinglePlayer, this.isPaused),
    );
  }

  render() {
    if (this.game === undefined) return html``;

    const timerColor =
      this.game.config().gameConfig().maxTimerValue !== undefined &&
      this.game.config().gameConfig().maxTimerValue !== null &&
      this.timer < 60
        ? "text-red-400"
        : "";

    return html`
      <aside
        class=${`w-fit flex flex-row items-center gap-3 py-2 px-3 bg-gray-800/92 backdrop-blur-sm shadow-xs min-[1200px]:rounded-lg rounded-bl-lg transition-transform duration-300 ease-out transform text-white ${
          this._isVisible ? "translate-x-0" : "translate-x-full"
        }`}
        @contextmenu=${(e: Event) => e.preventDefault()}
      >
        <!-- In-game time -->
        <div class=${timerColor}>${this.secondsToHms(this.timer)}</div>

        <!-- Buttons -->
        ${this.maybeRenderReplayButtons()}

        <div class="cursor-pointer" @click=${this.onSettingsButtonClick}>
          <img src=${settingsIcon} alt="settings" width="20" height="20" />
        </div>

        <div class="cursor-pointer" @click=${this.onExitButtonClick}>
          <img src=${exitIcon} alt="exit" width="20" height="20" />
        </div>
        <div class="border-l border-white/20 h-5"></div>
        <button
          class="text-xs px-2 py-1 rounded bg-amber-600/90"
          @click=${this.togglePlannerEditing}
        >
          ${this.plannerEditing ? "Stop Front Draw" : "Draw Front"}
        </button>
        <button
          class="text-xs px-2 py-1 rounded bg-gray-700"
          @click=${this.undoFrontline}
        >
          Undo
        </button>
        <button
          class="text-xs px-2 py-1 rounded bg-gray-700"
          @click=${this.clearFrontline}
        >
          Clear
        </button>
        <select
          class="text-xs text-black rounded px-1 py-1"
          .value=${this.plannerStance}
          @change=${(e: Event) =>
            (this.plannerStance = (e.target as HTMLSelectElement)
              .value as Stance)}
        >
          <option value="aggressive">Aggressive</option>
          <option value="balanced">Balanced</option>
          <option value="cautious">Cautious</option>
        </select>
        <input
          class="text-xs text-black rounded px-1 py-1 w-28"
          .value=${this.plannerArmyGroups}
          @input=${(e: Event) =>
            (this.plannerArmyGroups = (e.target as HTMLInputElement).value)}
          placeholder="army groups csv"
        />
        <button
          class="text-xs px-2 py-1 rounded bg-blue-600"
          @click=${() => this.persistPlan(!this.plannerHasSavedPlan)}
        >
          Save Plan
        </button>
        <button
          class=${`text-xs px-2 py-1 rounded ${this.plannerExecuting ? "bg-red-600" : "bg-green-600"}`}
          @click=${this.togglePlanExecution}
        >
          ${this.plannerExecuting ? "Pause Plan" : "Execute Plan"}
        </button>
        <div class="text-xs text-white/80">
          Front: ${this.plannerFrontline.length} • Progress:
          ${this.plannerProgress}%
        </div>
      </aside>
    `;
  }

  maybeRenderReplayButtons() {
    const isReplayOrSingleplayer =
      this._isSinglePlayer || this.game?.config()?.isReplay();
    const showPauseButton = isReplayOrSingleplayer || this.isLobbyCreator;

    return html`
      ${isReplayOrSingleplayer
        ? html`
            <div class="cursor-pointer" @click=${this.toggleReplayPanel}>
              <img
                src=${FastForwardIconSolid}
                alt="replay"
                width="20"
                height="20"
              />
            </div>
          `
        : ""}
      ${showPauseButton
        ? html`
            <div class="cursor-pointer" @click=${this.onPauseButtonClick}>
              <img
                src=${this.isPaused ? playIcon : pauseIcon}
                alt="play/pause"
                width="20"
                height="20"
              />
            </div>
          `
        : ""}
    `;
  }

  private togglePlannerEditing() {
    this.plannerEditing = !this.plannerEditing;
    this.eventBus.emit(new PlannerEditModeEvent(this.plannerEditing));
  }

  private clearFrontline() {
    this.eventBus.emit(new PlannerClearFrontlineEvent());
  }

  private undoFrontline() {
    this.eventBus.emit(new PlannerUndoFrontlineEvent());
  }

  private persistPlan(create: boolean) {
    if (this.plannerFrontline.length === 0) {
      return;
    }
    const groups = this.plannerArmyGroups
      .split(",")
      .map((g) => g.trim())
      .filter(Boolean);
    const event = create
      ? new SendCreateBattlePlanIntentEvent(
          "primary-front",
          this.plannerFrontline,
          groups.length > 0 ? groups : ["army-group-1"],
          this.plannerStance,
        )
      : new SendUpdateBattlePlanIntentEvent(
          "primary-front",
          this.plannerFrontline,
          groups.length > 0 ? groups : ["army-group-1"],
          this.plannerStance,
        );
    this.eventBus.emit(event);
    this.plannerHasSavedPlan = true;
  }

  private togglePlanExecution() {
    this.plannerExecuting = !this.plannerExecuting;
    this.eventBus.emit(
      new SendExecuteBattlePlanIntentEvent(
        "primary-front",
        this.plannerExecuting ? "execute" : "pause",
      ),
    );
  }
}
