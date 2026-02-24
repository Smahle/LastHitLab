// Game dimensions (landscape)
export const GAME_WIDTH = 844;
export const GAME_HEIGHT = 390;

// Timing
export const WAVE_INTERVAL = 30; // seconds between waves
export const SHOP_DURATION = 15; // seconds of shop time

// Combat – targeting & movement
export const MAX_ATTACKERS_PER_TARGET = 100;
export const PICK_MARGIN = 10;
/** Extra pixels beyond attackRange in which creeps notice enemies. */
export const AGGRO_RANGE_BONUS = 200;
/** Distance (px) at which a creep considers its lane goal "reached". */
export const GOAL_REACH_DIST = 50;
/** Minimum remaining distance before a unit stops moving. */
export const MOVEMENT_STOP_DIST = 5;
/** attackRange threshold that distinguishes ranged from melee creeps. */
export const RANGED_RANGE_THRESHOLD = 200;

// Combat – item tuning
/** Seconds for Divine Shield to recharge after absorbing a hit. */
export const SHIELD_ITEM_COOLDOWN = 35;
/** AoE radius (px) for Splash Blade's every-other-hit pulse. */
export const SPLASH_AOE_RADIUS = 150;
/** Fraction of hit damage dealt to units in the Splash Blade AoE. */
export const SPLASH_AOE_DAMAGE_MULT = 0.5;
/** Probability of a Critical Strike proc per attack. */
export const CRIT_CHANCE = 0.25;
/** Gold multiplier applied by Midas Hand on last hits. */
export const MIDAS_GOLD_MULT = 1.3;
/** Attack-speed multiplier during a Rapid Fire proc. */
export const RAPID_FIRE_SPEED_MULT = 1.5;
/** Duration (seconds) of a Rapid Fire proc. */
export const RAPID_FIRE_DURATION = 5;

// Combat – creep gold rewards
export const MELEE_CREEP_GOLD_BASE = 38;
export const RANGED_CREEP_GOLD_BASE = 54;
/** Random bonus gold per last hit in [0, CREEP_GOLD_VARIANCE). */
export const CREEP_GOLD_VARIANCE = 7;

// Colors
export const COLORS = {
  TEAM_A_HERO: 0x0096ff,
  TEAM_B_HERO: 0xff99ff,
  TEAM_A_CREEP: [0x6ee76e, 0x1faf3a], // lane 0, lane 1
  TEAM_B_CREEP: [0xff6b6b, 0xc81e1e],
  TEAM_A_PROJECTILE: 0x4fc3f7,
  TEAM_B_PROJECTILE: 0xff6b6b,
  GOLD: 0xffd700,
  BARRIER_A: 0x4fc3f7,
  BARRIER_B: 0xff6b6b,
};
