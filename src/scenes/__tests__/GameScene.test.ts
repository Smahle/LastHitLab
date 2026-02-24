import { describe, it, expect, vi, beforeEach } from "vitest";

// minimal Phaser stub
vi.mock("phaser", () => ({
  default: {
    // minimal Scene stub so inheritance works
    Scene: class {},
    Math: {
      Distance: {
        Between: (x1: number, y1: number, x2: number, y2: number) =>
          Math.hypot(x2 - x1, y2 - y1),
      },
    },
  },
}));

import { GameScene } from "../GameScene";
import type { GameState, UnitEntry } from "../../types";
import type { EffectsSystem } from "../EffectsSystem";
import { CombatSystem } from "../../systems/CombatSystem";
import type { Stats } from "../../config/unitStats";

// helpers similar to CombatSystem tests
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
function makeData(overrides: Partial<any> = {}) {
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
function makeEntry(data: any): UnitEntry {
  return {
    data,
    sprite: {
      x: 0,
      y: 0,
      play: vi.fn(),
      body: { setVelocity: vi.fn() },
    } as any,
  } as any;
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
  return { addFloatingText: vi.fn(), addLaserBeam: vi.fn() } as any;
}

function makeCombat(state: GameState, effects: EffectsSystem): CombatSystem {
  const c = new CombatSystem({} as any, state, effects) as any;
  c.startAttack = vi.fn();
  return c;
}

describe("GameScene handleClick", () => {
  let scene: GameScene;
  let state: GameState;
  let effects: EffectsSystem;
  let combat: CombatSystem;

  beforeEach(() => {
    scene = new GameScene();
    state = makeState();
    effects = makeEffects();
    combat = makeCombat(state, effects);
    scene["state"] = state;
    scene["effects"] = effects;
    scene["combat"] = combat;
    scene["targetingMode"] = false;
  });

  it("denies low‑HP friendly creep without immediate indicator", () => {
    const hero = makeEntry(
      makeData({ id: "hero-A", team: "A", unitType: "hero" }),
    );
    hero.sprite.x = 0;
    hero.sprite.y = 0;
    state.units.set(hero.data.id, hero);

    const creep = makeEntry(
      makeData({
        id: "creep-A",
        team: "A",
        unitType: "creep",
        hp: 40,
        maxHp: 100,
        radius: 10,
      }),
    );
    creep.sprite.x = 5;
    creep.sprite.y = 5;
    state.units.set(creep.data.id, creep);

    // click on the creep coordinates
    scene["handleClick"](5, 5);

    expect(effects.addFloatingText).not.toHaveBeenCalled();
    // attack intent should still be registered
    expect(combat.startAttack).toHaveBeenCalledWith(hero, creep.data.id);
  });

  it("onProjectileHit applies damage and removes projectile for any enemy", () => {
    const proj: any = {
      active: true,
      getData: vi.fn((key: string) => {
        if (key === "team") return "A";
        if (key === "attackerId") return "att";
        if (key === "damage") return 12;
        return undefined;
      }),
    };
    const enemy = makeEntry(makeData({ id: "enemy", team: "B", hp: 20 }));
    enemy.sprite.x = 0;
    enemy.sprite.y = 0;
    (enemy.sprite as any).getData = vi.fn((k: string) =>
      k === "unitId" ? "enemy" : "B",
    );
    state.units.set(enemy.data.id, enemy);

    const killSpy = vi.fn();
    scene["projectilesGroup"] = { killAndHide: killSpy } as any;

    scene["onProjectileHit"](proj, enemy.sprite);

    expect(killSpy).toHaveBeenCalledWith(proj);
  });
});
