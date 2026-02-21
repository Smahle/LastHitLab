import Phaser from "phaser";
import type { Stats, Item } from "./config/unitStats";

export type Team = "A" | "B";
export type UnitType = "hero" | "creep";
export type UnitState = "idle" | "attacking";

export interface UnitData {
  id: string;
  team: Team;
  unitType: UnitType;
  hp: number;
  maxHp: number;
  radius: number;
  state: UnitState;
  attackTimer: number;
  cooldownTimer: number;
  hasDealtDamage: boolean;
  targetId?: string;
  stats: Stats;
  laneOffset: number;
  gold: number;
  weapon?: Item;
  armor?: Item;
  accessory?: Item;
  attackCount: number;
  shieldActive: boolean;
  itemCooldown: number;
  rapidFireActive: boolean;
  rapidFireDuration: number;
}

export interface ProjectileData {
  id: string;
  attackerId: string;
  targetId: string;
  team: Team;
  startX: number;
  startY: number;
  damage: number;
  speed: number;
  progress: number;
  arcHeight: number;
  lifeTime: number;
}

export interface Barrier {
  team: Team;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  hitsRemaining: number;
}

export interface FloatingText {
  text: Phaser.GameObjects.Text;
  duration: number;
  maxDuration: number;
}

export interface LaserBeam {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: number;
  duration: number;
}

export type UnitEntry = { sprite: Phaser.Physics.Arcade.Sprite; data: UnitData };
export type ProjectileEntry = { gfx: Phaser.GameObjects.Arc; data: ProjectileData };
export type HPBarEntry = { bg: Phaser.GameObjects.Rectangle; fg: Phaser.GameObjects.Rectangle };

export interface GameState {
  units: Map<string, UnitEntry>;
  projectiles: Map<string, ProjectileEntry>;
  hpBars: Map<string, HPBarEntry>;
  barriers: Barrier[];
  barrierGfx: Phaser.GameObjects.Graphics;
  effectsGfx: Phaser.GameObjects.Graphics;
  floatingTexts: FloatingText[];
  laserBeams: LaserBeam[];
  waveNumber: number;
  waveTimer: number;
  lastHits: number;
  denies: number;
  idCounter: number;
  shopOpen: boolean;
}
