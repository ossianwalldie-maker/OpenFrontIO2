import { FlatBinaryHeap } from "../execution/utils/FlatBinaryHeap";
import { Game, Player, UnitType } from "./Game";
import { TileRef } from "./GameMap";

const HUB_TYPES = [UnitType.City, UnitType.Factory, UnitType.Port] as const;
const MAX_DISTANCE = 18;
const DECAY_PER_STEP = 1 / MAX_DISTANCE;
const OUT_OF_SUPPLY_THRESHOLD = 0.28;

type HubLink = { tile: TileRef; cost: number };

export interface SupplySnapshot {
  tick: number;
  values: Uint8Array;
  playerAverage: Record<string, number>;
  playerOutOfSupplyTiles: Record<string, number>;
}

export function createInitialSupplySnapshot(tileCount: number): SupplySnapshot {
  return {
    tick: 0,
    values: new Uint8Array(tileCount),
    playerAverage: {},
    playerOutOfSupplyTiles: {},
  };
}

export function computeSupplySnapshot(game: Game): SupplySnapshot {
  const tileCount = game.width() * game.height();
  const values = new Uint8Array(tileCount);
  const playerAverage: Record<string, number> = {};
  const playerOutOfSupplyTiles: Record<string, number> = {};

  const ownerByTile = new Uint16Array(tileCount);
  game.forEachTile((tile) => {
    ownerByTile[tile] = game.ownerID(tile);
  });

  for (const player of game.players()) {
    const ownerId = player.smallID();
    const hubs = collectOwnedHubs(game, player, ownerId);
    const links = buildHubLinks(game, hubs);

    const distance = new Map<TileRef, number>();
    const heap = new FlatBinaryHeap();

    for (const hub of hubs) {
      distance.set(hub, 0);
      heap.enqueue(hub, 0);
    }

    while (heap.size() > 0) {
      const [tile, cost] = heap.dequeue();
      const best = distance.get(tile);
      if (best === undefined || best !== cost || cost > MAX_DISTANCE) {
        continue;
      }

      game.forEachNeighbor(tile, (neighbor) => {
        if (ownerByTile[neighbor] !== ownerId || !game.isLand(neighbor)) {
          return;
        }
        const nextCost = cost + 1;
        if (nextCost > MAX_DISTANCE) {
          return;
        }
        const prev = distance.get(neighbor);
        if (prev === undefined || nextCost < prev) {
          distance.set(neighbor, nextCost);
          heap.enqueue(neighbor, nextCost);
        }
      });

      const linked = links.get(tile);
      if (!linked) {
        continue;
      }
      for (const edge of linked) {
        const nextCost = cost + edge.cost;
        if (nextCost > MAX_DISTANCE) {
          continue;
        }
        const prev = distance.get(edge.tile);
        if (prev === undefined || nextCost < prev) {
          distance.set(edge.tile, nextCost);
          heap.enqueue(edge.tile, nextCost);
        }
      }
    }

    let tiles = 0;
    let supplyTotal = 0;
    let outOfSupply = 0;

    for (const tile of player.tiles()) {
      if (!game.isLand(tile)) {
        continue;
      }
      const dist = distance.get(tile);
      const supply =
        dist === undefined ? 0 : Math.max(0, 1 - dist * DECAY_PER_STEP);
      const byteVal = Math.round(supply * 255);
      values[tile] = Math.max(values[tile], byteVal);
      tiles++;
      supplyTotal += supply;
      if (supply <= OUT_OF_SUPPLY_THRESHOLD) {
        outOfSupply++;
      }
    }

    playerAverage[player.id()] = tiles > 0 ? supplyTotal / tiles : 0;
    playerOutOfSupplyTiles[player.id()] = outOfSupply;
  }

  return {
    tick: game.ticks(),
    values,
    playerAverage,
    playerOutOfSupplyTiles,
  };
}

function collectOwnedHubs(
  game: Game,
  player: Player,
  ownerId: number,
): TileRef[] {
  const hubs: TileRef[] = [];
  for (const hubType of HUB_TYPES) {
    for (const unit of player.units(hubType)) {
      if (!unit.isActive()) {
        continue;
      }
      const tile = unit.tile();
      if (game.ownerID(tile) === ownerId) {
        hubs.push(tile);
      }
    }
  }
  return hubs;
}

function buildHubLinks(game: Game, hubs: TileRef[]): Map<TileRef, HubLink[]> {
  const links = new Map<TileRef, HubLink[]>();
  const stationManager = game.railNetwork().stationManager();

  const portsByComponent = new Map<number, TileRef[]>();
  const stationHubs = new Set<TileRef>();

  for (const hub of hubs) {
    const owner = game.owner(hub);
    if (!owner.isPlayer()) {
      continue;
    }
    const port = owner
      .units(UnitType.Port)
      .find((u) => u.isActive() && u.tile() === hub);
    if (port) {
      const component = game.getWaterComponent(hub);
      if (component !== null) {
        const list = portsByComponent.get(component) ?? [];
        list.push(hub);
        portsByComponent.set(component, list);
      }
    }

    const unit = owner
      .units(UnitType.City, UnitType.Factory, UnitType.Port)
      .find((u) => u.isActive() && u.tile() === hub);
    if (unit && stationManager.findStation(unit)) {
      stationHubs.add(hub);
    }
  }

  const hubSet = new Set(hubs);
  for (const hub of stationHubs) {
    const owner = game.owner(hub);
    if (!owner.isPlayer()) continue;
    const srcUnit = owner
      .units(UnitType.City, UnitType.Factory, UnitType.Port)
      .find((u) => u.isActive() && u.tile() === hub);
    if (!srcUnit) continue;
    const srcStation = stationManager.findStation(srcUnit);
    if (!srcStation) continue;

    for (const other of stationHubs) {
      if (hub === other) continue;
      const otherOwner = game.owner(other);
      if (!otherOwner.isPlayer()) continue;
      const dstUnit = otherOwner
        .units(UnitType.City, UnitType.Factory, UnitType.Port)
        .find((u) => u.isActive() && u.tile() === other);
      if (!dstUnit) continue;
      const dstStation = stationManager.findStation(dstUnit);
      if (!dstStation) continue;

      const path = game.railNetwork().findStationsPath(srcStation, dstStation);
      if (path.length > 1 && hubSet.has(other)) {
        const arr = links.get(hub) ?? [];
        arr.push({ tile: other, cost: 1 });
        links.set(hub, arr);
      }
    }
  }

  for (const list of portsByComponent.values()) {
    for (const a of list) {
      for (const b of list) {
        if (a === b) continue;
        const arr = links.get(a) ?? [];
        arr.push({ tile: b, cost: 2 });
        links.set(a, arr);
      }
    }
  }

  return links;
}
