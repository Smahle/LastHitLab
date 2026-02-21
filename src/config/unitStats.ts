export interface Stats {
  baseDamage: number;
  attackSpeed: number;
  baseAttackPoint: number;
  baseBackswing: number;
  attackRange: number;
  moveSpeed: number;
  armor: number;
  projectileSpeed: number;
}

export const HERO_STATS: Stats = {
  baseDamage: 55,
  attackSpeed: 1.5,
  baseAttackPoint: 0.3,
  baseBackswing: 0.5,
  attackRange: 700,
  moveSpeed: 0,
  armor: 5,
  projectileSpeed: 600,
};

export const MELEE_CREEP_STATS: Stats = {
  baseDamage: 21,
  attackSpeed: 1.0,
  baseAttackPoint: 0.4,
  baseBackswing: 0.5,
  attackRange: 30,
  moveSpeed: 50,
  armor: 2,
  projectileSpeed: 0,
};

export const RANGED_CREEP_STATS: Stats = {
  baseDamage: 24,
  attackSpeed: 1.0,
  baseAttackPoint: 0.5,
  baseBackswing: 0.5,
  attackRange: 200,
  moveSpeed: 50,
  armor: 0,
  projectileSpeed: 400,
};

export interface Item {
  id: string;
  name: string;
  description: string;
  cost: number;
  type: "weapon" | "armor" | "accessory";
  effect: string;
}

export const SHOP_ITEMS: Item[] = [
  {
    id: "laser-beam",
    name: "Laser Beam",
    description: "Every 4th attack is instant with a laser animation",
    cost: 500,
    type: "weapon",
    effect: "instant_4th_attack",
  },
  {
    id: "splash-blade",
    name: "Splash Blade",
    description: "Every other attack deals AOE damage around the target",
    cost: 600,
    type: "weapon",
    effect: "aoe_every_2nd",
  },
  {
    id: "divine-shield",
    name: "Divine Shield",
    description: "Blocks one instance of damage. 35s cooldown.",
    cost: 400,
    type: "armor",
    effect: "block_damage",
  },
  {
    id: "rapid-fire",
    name: "Rapid Fire",
    description: "Increases attack speed by 50% for 5s after getting a kill",
    cost: 700,
    type: "weapon",
    effect: "speed_on_kill",
  },
  {
    id: "critical-strike",
    name: "Critical Strike",
    description: "25% chance to deal double damage",
    cost: 800,
    type: "weapon",
    effect: "crit_chance",
  },
  {
    id: "midas-hand",
    name: "Midas Hand",
    description: "Gain 30% more gold from last hits",
    cost: 900,
    type: "accessory",
    effect: "gold_bonus",
  },
];
