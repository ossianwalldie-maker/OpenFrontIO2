import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { EventBus } from "../../../core/EventBus";
import { GameView, PlayerView } from "../../../core/game/GameView";
import {
  SendCancelNAPIntentEvent,
  SendCreateFactionIntentEvent,
  SendInviteToFactionIntentEvent,
  SendJoinFactionIntentEvent,
  SendLeaveFactionIntentEvent,
  SendProposeGuaranteeIntentEvent,
  SendProposeNAPIntentEvent,
  SendRevokeGuaranteeIntentEvent,
} from "../../Transport";
import { translateText } from "../../Utils";
import { Layer } from "./Layer";

@customElement("diplomacy-panel")
export class DiplomacyPanel extends LitElement implements Layer {
  public game: GameView | null = null;
  public eventBus: EventBus | null = null;

  @property({ type: Boolean }) visible = false;

  createRenderRoot() {
    return this;
  }

  init() {}
  tick() {}
  renderLayer() {}
  shouldTransform(): boolean {
    return false;
  }

  private relationshipActions(other: PlayerView) {
    if (!this.eventBus) return null;
    return html`<div class="flex gap-1 mt-1">
      <button
        class="px-1 py-0.5 rounded bg-blue-700/70"
        @click=${() =>
          this.eventBus?.emit(new SendProposeGuaranteeIntentEvent(other))}
      >
        G+
      </button>
      <button
        class="px-1 py-0.5 rounded bg-slate-700/70"
        @click=${() =>
          this.eventBus?.emit(new SendRevokeGuaranteeIntentEvent(other))}
      >
        G-
      </button>
      <button
        class="px-1 py-0.5 rounded bg-purple-700/70"
        @click=${() =>
          this.eventBus?.emit(new SendProposeNAPIntentEvent(other))}
      >
        NAP+
      </button>
      <button
        class="px-1 py-0.5 rounded bg-slate-700/70"
        @click=${() => this.eventBus?.emit(new SendCancelNAPIntentEvent(other))}
      >
        NAP-
      </button>
    </div>`;
  }

  render() {
    if (!this.visible || !this.game) return html``;

    const myPlayer = this.game.myPlayer();
    if (!myPlayer) return html``;

    const diplomacy = myPlayer.data.diplomacy;
    const faction = diplomacy?.factions.find(
      (f) => f.id === diplomacy.factionID,
    );

    return html`
      <div class="mt-2 rounded-lg bg-gray-800/85 text-white text-xs p-2">
        <div class="font-semibold mb-1">
          ${translateText("help_modal.info_alliance")}: Diplomacy
        </div>
        <div class="text-slate-200">
          Global tension: ${diplomacy?.globalTension.toFixed(1) ?? "0.0"}
        </div>

        <div class="mt-2">
          <div class="font-semibold">Faction</div>
          ${faction
            ? html`<div>
                ${faction.name} (${faction.members.length})
                <button
                  class="ml-2 px-1 py-0.5 rounded bg-red-700/70"
                  @click=${() =>
                    this.eventBus?.emit(new SendLeaveFactionIntentEvent())}
                >
                  Leave
                </button>
              </div>`
            : html`<button
                class="px-1 py-0.5 rounded bg-green-700/70"
                @click=${() =>
                  this.eventBus?.emit(
                    new SendCreateFactionIntentEvent(
                      `Faction ${myPlayer.smallID()}`,
                    ),
                  )}
              >
                Create
              </button>`}
        </div>

        <div class="mt-2">
          <div class="font-semibold">War goals</div>
          ${(diplomacy?.warGoals ?? [])
            .slice(0, 3)
            .map(
              (g) =>
                html`<div class="text-slate-200">
                  #${g.targetID.slice(0, 4)} • ${g.justification} •
                  ${g.progressTicks}
                </div>`,
            )}
        </div>

        <div class="mt-2 max-h-32 overflow-y-auto">
          <div class="font-semibold">Treaties</div>
          ${(this.game.playerViews() ?? [])
            .filter((p) => p !== myPlayer && p.isAlive())
            .slice(0, 8)
            .map(
              (p) =>
                html`<div class="border-t border-slate-700/60 pt-1 mt-1">
                  <div class="flex items-center justify-between">
                    <span>${p.displayName()}</span>
                    <button
                      class="px-1 py-0.5 rounded bg-cyan-700/70"
                      @click=${() =>
                        this.eventBus?.emit(
                          new SendInviteToFactionIntentEvent(p),
                        )}
                    >
                      Invite
                    </button>
                    <button
                      class="px-1 py-0.5 rounded bg-emerald-700/70"
                      @click=${() =>
                        this.eventBus?.emit(new SendJoinFactionIntentEvent(p))}
                    >
                      Join
                    </button>
                  </div>
                  ${this.relationshipActions(p)}
                </div>`,
            )}
        </div>
      </div>
    `;
  }
}
