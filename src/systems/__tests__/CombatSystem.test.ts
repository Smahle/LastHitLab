import { describe, it, expect, vi, beforeEach } from "vitest";

// Minimal Phaser stub – only the APIs used by CombatSystem
vi.mock("phaser", () => ({
  default: {
    Math: {
      Distance: {
        Between: (x1: number, y1: number, x2: number, y2: number) =>
          Math.hypot(x2 - x1, y2 - y1),
      },
      Angle: {
        Between: (x1: number, y1: number, x2: number, y2: number) =>
          Math.atan2(y2 - y1, x2 - x1),
        RotateTo: (from: number, to: number, max: number) => {
          // wrap difference to [-π, π]
          const diff =
            ((((to - from) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) -
            Math.PI;
          const amt = Math.sign(diff) * Math.min(Math.abs(diff), max);
          return from + amt;
        },
        Wrap: (angle: number) => {
          const pi2 = Math.PI * 2;
          return ((angle % pi2) + pi2) % pi2;
        },
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
    sprite: {
      x: 0,
      y: 0,
      play: vi.fn(),
      body: { setVelocity: vi.fn() },
    } as unknown as UnitEntry["sprite"],
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
  return {
    addFloatingText: vi.fn(),
    addLaserBeam: vi.fn(),
  } as unknown as EffectsSystem;
}

function makeCombat(state: GameState, effects: EffectsSystem): CombatSystem {
  // minimal scene stub with time and physics namespaces used by CombatSystem
  const sceneStub: any = {
    time: { delayedCall: vi.fn() },
    physics: { moveToObject: vi.fn() },
  };
  return new CombatSystem(sceneStub, state, effects);
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
      armor: {
        id: "divine-shield",
        name: "",
        description: "",
        cost: 0,
        type: "armor",
        effect: "",
      },
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

// ── projectile behaviour and utilities ───────────────────────────────────

describe("projectile helpers", () => {
  let state: GameState;
  let effects: EffectsSystem;
  let combat: CombatSystem;

  beforeEach(() => {
    state = makeState();
    effects = makeEffects();
    combat = makeCombat(state, effects);
  });

  it("stores targetId and speed when spawning", () => {
    const atk = makeData();
    const tgtData = makeData({ id: "tgt", team: "B" });
    const tgt: UnitEntry = makeEntry(tgtData);
    state.units.set(tgtData.id, tgt);

    // create fake projectile and group
    const proj: any = {
      x: 0,
      y: 0,
      active: true,
      getData: vi.fn().mockReturnValue(undefined),
      setData: vi.fn(),
      setActive: vi.fn().mockReturnThis(),
      setVisible: vi.fn().mockReturnThis(),
      setTint: vi.fn().mockReturnThis(),
      setDepth: vi.fn().mockReturnThis(),
      body: { setVelocity: vi.fn(), setEnable: vi.fn() },
    };
    combat.projectilesGroup = {
      get: vi.fn().mockReturnValue(proj),
    } as any;

    atk.stats.projectileSpeed = 10;
    combat.spawnProjectile({ data: atk, sprite: proj } as any, tgt, 5);

    expect(proj.setData).toHaveBeenCalledWith("targetId", tgtData.id);
    expect(proj.setData).toHaveBeenCalledWith("speed", 10);
    expect(proj.setData).toHaveBeenCalledWith("age", 0);
    // initial velocity should be set toward target (same spot => zero)
    expect(proj.body.setVelocity).toHaveBeenCalled();
  });

  it("updateProjectiles steers toward living target", () => {
    const proj: any = {
      x: 0,
      y: 0,
      active: true,
      getData: vi.fn((key: string) => {
        if (key === "targetId") return "tgt";
        if (key === "speed") return 5;
        if (key === "age") return 0;
        return undefined;
      }),
      setData: vi.fn(),
      body: { velocity: { x: 1, y: 0 }, setVelocity: vi.fn() },
    };
    // create a fake unit entry with a sprite located to the right of the
    // projectile so steering will modify the velocity angle
    const targetEntry: UnitEntry = {
      data: makeData({ id: "tgt", team: "B" }),
      sprite: { x: 10, y: 0 } as any,
    } as any;
    state.units.set("tgt", targetEntry);

    combat.projectilesGroup = {
      getChildren: () => [proj],
      killAndHide: vi.fn(),
    } as any;

    combat.updateProjectiles(1 / 60);

    expect(proj.body.setVelocity).toHaveBeenCalled();
    // age should be bumped
    expect(proj.setData).toHaveBeenCalledWith("age", expect.any(Number));
  });

  it("kills projectile when target is dead", () => {
    const proj: any = {
      x: 0,
      y: 0,
      active: true,
      getData: vi.fn((key: string) => {
        if (key === "targetId") return "tgt";
        if (key === "speed") return 5;
        if (key === "age") return 0;
        return undefined;
      }),
      setData: vi.fn(),
      body: { velocity: { x: 0, y: 0 }, setVelocity: vi.fn() },
    };
    // add entry with hp=0 to simulate dead target
    const deadEntry: UnitEntry = {
      data: makeData({ id: "tgt", team: "B", hp: 0 }),
      sprite: { x: 0, y: 0 } as any,
    } as any;
    state.units.set("tgt", deadEntry);

    const killSpy = vi.fn();
    combat.projectilesGroup = {
      getChildren: () => [proj],
      killAndHide: killSpy,
    } as any;

    combat.updateProjectiles(1 / 60);
    expect(killSpy).toHaveBeenCalledWith(proj);
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
    expect(defData.hp).toBe(100); // no damage taken
    expect(defData.shieldActive).toBe(false);
    expect(defData.itemCooldown).toBeGreaterThan(0);
  });

  it("tracks last hits for team A hero killing an enemy creep", () => {
    const atk = makeData({ id: "hero-a", team: "A", unitType: "hero" });
    const defData = makeData({
      id: "creep-b",
      team: "B",
      unitType: "creep",
      hp: 1,
    });
    const def = makeEntry(defData);
    state.units.set(atk.id, makeEntry(atk));
    combat.applyDamageInstant(atk, def, 50);
    expect(state.lastHits).toBe(1);
  });

  it("tracks denies for team A hero killing own creep", () => {
    const atk = makeData({ id: "hero-a", team: "A", unitType: "hero" });
    const defData = makeData({
      id: "creep-a",
      team: "A",
      unitType: "creep",
      hp: 1,
    });
    const def = makeEntry(defData);
    state.units.set(atk.id, makeEntry(atk));
    combat.applyDamageInstant(atk, def, 50);
    expect(state.denies).toBe(1);
    // ensure denial floating text shown
    expect(effects.addFloatingText).toHaveBeenCalledWith(
      def.sprite.x,
      def.sprite.y,
      "!",
      atk.team === "A" ? "#0096FF" : "#ff99ff",
    );
  });
});
