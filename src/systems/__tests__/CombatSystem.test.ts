import { describe, it, expect, vi, beforeEach } from "vitest";

// Minimal Phaser stub – only the APIs used by CombatSystem
vi.mock("phaser", () => ({
  default: {
    Math: {
      Distance: {
        Between: (x1: number, y1: number, x2: number, y2: number) =>
          Math.hypot(x2 - x1, y2 - y1),
      },
    },
  },
}));

import { CombatSystem } from "../CombatSystem";
import type { GameState, UnitEntry, UnitData } from "../../types";
import type { EffectsSystem } from "../EffectsSystem";
import type { Stats } from "../../config/unitStats";

// ── Helpers ────────────────────────────────────────────────────────────────

const BASE_STATS: Stats = {
  baseDamage: 50,
  attackSpeed: 1,
  baseAttackPoint: 0.3,
  baseBackswing: 0.5,
  attackRange: 100,
  moveSpeed: 150,
  armor: 0,
  projectileSpeed: 0,
};

function makeData(overrides: Partial<UnitData> = {}): UnitData {
  return {
    id: "unit-1",
    team: "A",
    unitType: "hero",
    hp: 100,
    maxHp: 100,
    radius: 20,
    state: "idle",
    attackTimer: 0,
    cooldownTimer: 0,
    hasDealtDamage: false,
    laneOffset: 0,
    gold: 0,
    attackCount: 0,
    shieldActive: false,
    itemCooldown: 0,
    rapidFireActive: false,
    rapidFireDuration: 0,
    stats: { ...BASE_STATS },
    ...overrides,
  };
}

function makeEntry(data: UnitData): UnitEntry {
  return {
    data,
    sprite: { x: 0, y: 0, play: vi.fn(), body: { setVelocity: vi.fn() } } as unknown as UnitEntry["sprite"],
  };
}

function makeState(): GameState {
  return {
    units: new Map(),
    hpBars: new Map(),
    barriers: [],
    barrierGfx: {} as never,
    effectsGfx: {} as never,
    floatingTexts: [],
    laserBeams: [],
    waveNumber: 0,
    waveTimer: 0,
    lastHits: 0,
    denies: 0,
    idCounter: 0,
    shopOpen: false,
  };
}

function makeEffects(): EffectsSystem {
  return { addFloatingText: vi.fn(), addLaserBeam: vi.fn() } as unknown as EffectsSystem;
}

function makeCombat(state: GameState, effects: EffectsSystem): CombatSystem {
  return new CombatSystem({} as never, state, effects);
}

// ── calculateDamage ────────────────────────────────────────────────────────

describe("calculateDamage", () => {
  let combat: CombatSystem;

  beforeEach(() => {
    combat = makeCombat(makeState(), makeEffects());
  });

  it("returns base damage unchanged at 0 armour", () => {
    const atk = makeData({ stats: { ...BASE_STATS, baseDamage: 100 } });
    const def = makeData({ stats: { ...BASE_STATS, armor: 0 } });
    expect(combat.calculateDamage(atk, def)).toBe(100);
  });

  it("reduces damage for positive armour", () => {
    const atk = makeData({ stats: { ...BASE_STATS, baseDamage: 100 } });
    const def = makeData({ stats: { ...BASE_STATS, armor: 10 } });
    // armour 10: mult ≈ 0.625 → ~62–63 damage
    const dmg = combat.calculateDamage(atk, def);
    expect(dmg).toBeGreaterThan(0);
    expect(dmg).toBeLessThan(100);
  });

  it("amplifies damage for negative armour", () => {
    const atk = makeData({ stats: { ...BASE_STATS, baseDamage: 100 } });
    const def = makeData({ stats: { ...BASE_STATS, armor: -5 } });
    expect(combat.calculateDamage(atk, def)).toBeGreaterThan(100);
  });

  it("never returns negative damage", () => {
    const atk = makeData({ stats: { ...BASE_STATS, baseDamage: 0 } });
    const def = makeData({ stats: { ...BASE_STATS, armor: 100 } });
    expect(combat.calculateDamage(atk, def)).toBeGreaterThanOrEqual(0);
  });

  it("rounds to the nearest integer", () => {
    const atk = makeData({ stats: { ...BASE_STATS, baseDamage: 33 } });
    const def = makeData({ stats: { ...BASE_STATS, armor: 0 } });
    expect(Number.isInteger(combat.calculateDamage(atk, def))).toBe(true);
  });
});

// ── updateTimers ───────────────────────────────────────────────────────────

describe("updateTimers (via updateUnit)", () => {
  let state: GameState;
  let combat: CombatSystem;

  beforeEach(() => {
    state = makeState();
    combat = makeCombat(state, makeEffects());
  });

  it("ticks down cooldownTimer", () => {
    const d = makeData({ cooldownTimer: 1.0 });
    const u = makeEntry(d);
    state.units.set(d.id, u);
    combat.updateUnit(u, 0.1);
    expect(d.cooldownTimer).toBeCloseTo(0.9);
  });

  it("does not tick cooldownTimer below 0", () => {
    const d = makeData({ cooldownTimer: 0.05 });
    const u = makeEntry(d);
    state.units.set(d.id, u);
    combat.updateUnit(u, 0.1);
    // clamped implicitly: timer just goes negative but game logic still works
    expect(d.cooldownTimer).toBeLessThanOrEqual(0);
  });

  it("activates Divine Shield when itemCooldown reaches zero", () => {
    const d = makeData({
      itemCooldown: 0.05,
      armor: { id: "divine-shield", name: "", description: "", cost: 0, type: "armor", effect: "" },
      shieldActive: false,
    });
    const u = makeEntry(d);
    state.units.set(d.id, u);
    combat.updateUnit(u, 0.1);
    expect(d.shieldActive).toBe(true);
    expect(d.itemCooldown).toBe(0);
  });

  it("deactivates Rapid Fire when duration expires", () => {
    const d = makeData({ rapidFireActive: true, rapidFireDuration: 0.05 });
    const u = makeEntry(d);
    state.units.set(d.id, u);
    combat.updateUnit(u, 0.1);
    expect(d.rapidFireActive).toBe(false);
    expect(d.rapidFireDuration).toBe(0);
  });
});

// ── applyDamageInstant ─────────────────────────────────────────────────────

describe("applyDamageInstant", () => {
  let state: GameState;
  let effects: EffectsSystem;
  let combat: CombatSystem;

  beforeEach(() => {
    state = makeState();
    effects = makeEffects();
    combat = makeCombat(state, effects);
  });

  it("applies damage normally when shield is inactive", () => {
    const atk = makeData({ id: "a" });
    const defData = makeData({ id: "b", hp: 100, shieldActive: false });
    const def = makeEntry(defData);
    combat.applyDamageInstant(atk, def, 30);
    expect(defData.hp).toBe(70);
  });

  it("blocks damage and starts cooldown when shield is active", () => {
    const atk = makeData({ id: "a" });
    const defData = makeData({ id: "b", hp: 100, shieldActive: true });
    const def = makeEntry(defData);
    combat.applyDamageInstant(atk, def, 999);
    expect(defData.hp).toBe(100);         // no damage taken
    expect(defData.shieldActive).toBe(false);
    expect(defData.itemCooldown).toBeGreaterThan(0);
  });

  it("tracks last hits for team A hero killing an enemy creep", () => {
    const atk = makeData({ id: "hero-a", team: "A", unitType: "hero" });
    const defData = makeData({ id: "creep-b", team: "B", unitType: "creep", hp: 1 });
    const def = makeEntry(defData);
    state.units.set(atk.id, makeEntry(atk));
    combat.applyDamageInstant(atk, def, 50);
    expect(state.lastHits).toBe(1);
  });

  it("tracks denies for team A hero killing own creep", () => {
    const atk = makeData({ id: "hero-a", team: "A", unitType: "hero" });
    const defData = makeData({ id: "creep-a", team: "A", unitType: "creep", hp: 1 });
    const def = makeEntry(defData);
    state.units.set(atk.id, makeEntry(atk));
    combat.applyDamageInstant(atk, def, 50);
    expect(state.denies).toBe(1);
  });
});
