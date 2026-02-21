import Phaser from "phaser";
import {
  COLORS,
  GAME_WIDTH,
  GAME_HEIGHT,
  MAX_ATTACKERS_PER_TARGET,
  AGGRO_RANGE_BONUS,
  GOAL_REACH_DIST,
  MOVEMENT_STOP_DIST,
  RANGED_RANGE_THRESHOLD,
  SHIELD_ITEM_COOLDOWN,
  SPLASH_AOE_RADIUS,
  SPLASH_AOE_DAMAGE_MULT,
  CRIT_CHANCE,
  MIDAS_GOLD_MULT,
  RAPID_FIRE_SPEED_MULT,
  RAPID_FIRE_DURATION,
  MELEE_CREEP_GOLD_BASE,
  RANGED_CREEP_GOLD_BASE,
  CREEP_GOLD_VARIANCE,
  SEPARATION_STRENGTH,
} from "../config/constants";
import type { GameState, UnitData, UnitEntry } from "../types";
import type { EffectsSystem } from "./EffectsSystem";
import { spawnPos, targetPos } from "../helpers";

export class CombatSystem {
  constructor(
    private scene: Phaser.Scene,
    private state: GameState,
    private effects: EffectsSystem,
  ) {}

  // ── Public update entry points ─────────────────────────────────────────

  /** Advance one unit's state by `dt` seconds. */
  updateUnit(u: UnitEntry, dt: number): void {
    this.updateTimers(u.data, dt);
    if (u.data.unitType === "hero") {
      this.updateHeroUnit(u, dt);
    } else {
      this.updateCreepUnit(u, dt);
    }
  }

  // ── Timer management ───────────────────────────────────────────────────

  /** Tick all time-based cooldowns and buff durations on a unit. */
  private updateTimers(d: UnitData, dt: number): void {
    if (d.cooldownTimer > 0) d.cooldownTimer -= dt;

    if (d.itemCooldown > 0) {
      d.itemCooldown -= dt;
      if (d.itemCooldown <= 0) {
        d.itemCooldown = 0;
        // Divine Shield auto-activates when its cooldown expires
        if (d.armor?.id === "divine-shield") d.shieldActive = true;
      }
    }

    if (d.rapidFireDuration > 0) {
      d.rapidFireDuration -= dt;
      if (d.rapidFireDuration <= 0) {
        d.rapidFireDuration = 0;
        d.rapidFireActive = false;
      }
    }
  }

  // ── Hero update ────────────────────────────────────────────────────────

  /** Heroes are input-driven; only continue an in-progress attack here. */
  private updateHeroUnit(u: UnitEntry, dt: number): void {
    if (u.data.state === "attacking") this.handleAttack(u, dt);
  }

  // ── Creep AI ───────────────────────────────────────────────────────────

  /** Full creep AI tick: resolve current attack, then move or idle. */
  private updateCreepUnit(u: UnitEntry, dt: number): void {
    const d = u.data;
    if (d.state === "attacking") this.handleAttack(u, dt);

    // Validate existing target (may have just died)
    let target = d.targetId ? this.state.units.get(d.targetId) : undefined;
    if (target && target.data.hp <= 0) {
      d.targetId = undefined;
      target = undefined;
      this.resetAttack(u);
    }

    if (target) {
      this.tickCreepWithTarget(u, target);
    } else {
      this.tickCreepWithoutTarget(u);
    }
    this.applySeparation(u);
  }

  /** Creep has a live target: chase it or attack if in range. */
  private tickCreepWithTarget(u: UnitEntry, target: UnitEntry): void {
    const d = u.data;

    // When chasing a hero while idle, attempt re-acquisition for a better target
    if (target.data.unitType === "hero" && d.state === "idle") {
      this.acquireTarget(d);
      const reassigned = d.targetId
        ? this.state.units.get(d.targetId)
        : undefined;
      if (!reassigned) return;
      target = reassigned;
    }

    const dist = Phaser.Math.Distance.Between(
      u.sprite.x,
      u.sprite.y,
      target.sprite.x,
      target.sprite.y,
    );
    const edgeDist = dist - d.radius - target.data.radius;

    if (edgeDist <= d.stats.attackRange) {
      this.setVelocity(u, 0, 0);
      if (d.state === "idle" && d.cooldownTimer <= 0) {
        this.startAttack(u, target.data.id);
      }
    } else {
      const speed = d.stats.moveSpeed;
      const dx = target.sprite.x - u.sprite.x;
      const dy = target.sprite.y - u.sprite.y;
      this.setVelocity(u, (dx / dist) * speed, (dy / dist) * speed);
    }
  }

  /** Creep has no target: try to acquire one, else march down the lane. */
  private tickCreepWithoutTarget(u: UnitEntry): void {
    const d = u.data;
    if (d.state === "attacking") this.resetAttack(u);
    if (d.state === "idle") this.acquireTarget(d);

    // acquireTarget may have set a new target; wait for the next tick
    if (d.targetId) {
      this.setVelocity(u, 0, 0);
      return;
    }

    this.moveCreepToBase(u);
  }

  /** March a creep toward its lane goal; chase the enemy hero once close. */
  private moveCreepToBase(u: UnitEntry): void {
    const d = u.data;
    const goal = this.calcLaneGoal(d);

    // Once near the base target, switch to chasing the enemy hero directly
    if (
      Phaser.Math.Distance.Between(u.sprite.x, u.sprite.y, goal.x, goal.y) <=
      GOAL_REACH_DIST
    ) {
      const enemyHero = this.findUnit(
        (ud) => ud.team !== d.team && ud.unitType === "hero" && ud.hp > 0,
      );
      if (enemyHero) {
        goal.x = enemyHero.sprite.x;
        goal.y = enemyHero.sprite.y;
      }
    }

    const dist = Phaser.Math.Distance.Between(
      u.sprite.x,
      u.sprite.y,
      goal.x,
      goal.y,
    );
    if (dist > MOVEMENT_STOP_DIST) {
      const speed = d.stats.moveSpeed;
      this.setVelocity(
        u,
        ((goal.x - u.sprite.x) / dist) * speed,
        ((goal.y - u.sprite.y) / dist) * speed,
      );
    } else {
      this.setVelocity(u, 0, 0);
    }
  }

  /**
   * Compute the creep's lane goal: the base target offset perpendicularly
   * by `laneOffset` pixels so multiple creeps spread across the lane.
   */
  private calcLaneGoal(d: UnitData): { x: number; y: number } {
    const base = targetPos(d.team);
    const start = spawnPos(d.team);
    const laneLen = Phaser.Math.Distance.Between(
      start.x,
      start.y,
      base.x,
      base.y,
    );
    // Unit lane direction
    const lx = (base.x - start.x) / laneLen;
    const ly = (base.y - start.y) / laneLen;
    // Perpendicular direction for offset spread
    return {
      x: base.x + -ly * d.laneOffset,
      y: base.y + lx * d.laneOffset,
    };
  }

  // ── Target acquisition ─────────────────────────────────────────────────

  /**
   * Assign the nearest, least-contested enemy to `d.targetId`.
   * Prefers creeps over heroes; respects MAX_ATTACKERS_PER_TARGET.
   */
  acquireTarget(d: UnitData): void {
    if (d.unitType === "hero") return;
    const self = this.state.units.get(d.id);
    if (!self) return;

    const candidates: { id: string; dist: number; type: "hero" | "creep" }[] =
      [];
    this.state.units.forEach((u) => {
      if (
        u.data.team !== d.team &&
        u.data.hp > 0 &&
        u.sprite.x >= 0 &&
        u.sprite.x <= GAME_WIDTH &&
        u.sprite.y >= 0 &&
        u.sprite.y <= GAME_HEIGHT
      ) {
        const dist = Phaser.Math.Distance.Between(
          self.sprite.x,
          self.sprite.y,
          u.sprite.x,
          u.sprite.y,
        );
        if (dist <= d.stats.attackRange + AGGRO_RANGE_BONUS + d.radius) {
          candidates.push({ id: u.data.id, dist, type: u.data.unitType });
        }
      }
    });

    // Creeps first, then by ascending distance
    candidates.sort((a, b) => {
      if (a.type === "creep" && b.type === "hero") return -1;
      if (a.type === "hero" && b.type === "creep") return 1;
      return a.dist - b.dist;
    });

    d.targetId = undefined;
    for (const c of candidates) {
      if (this.countAttackers(c.id) < MAX_ATTACKERS_PER_TARGET) {
        d.targetId = c.id;
        return;
      }
    }
  }

  private countAttackers(targetId: string): number {
    let count = 0;
    this.state.units.forEach((u) => {
      if (u.data.targetId === targetId && u.data.state === "attacking") count++;
    });
    return count;
  }

  // ── Attack lifecycle ───────────────────────────────────────────────────

  /** Transition a unit into the "attacking" state and play the attack animation. */
  startAttack(u: UnitEntry, targetId: string): void {
    const d = u.data;
    d.state = "attacking";
    d.targetId = targetId;
    d.hasDealtDamage = false;
    this.setVelocity(u, 0, 0);

    if (d.unitType === "hero") {
      d.attackCount++;
      const effectiveSpeed = d.stats.attackSpeed * (d.rapidFireActive ? RAPID_FIRE_SPEED_MULT : 1);
      const totalTime = (d.stats.baseAttackPoint + d.stats.baseBackswing) / effectiveSpeed;
      u.sprite.play({ key: "anim-attack", frameRate: 5 / totalTime });
      // Laser Beam uses a pre-loaded attackTimer so the hit fires at attackPoint
      if (d.weapon?.id === "laser-beam" && d.attackCount % 4 === 0) {
        d.attackTimer = d.stats.baseAttackPoint;
        return;
      }
    } else {
      u.sprite.play({ key: "anim-attack", frameRate: 8 });
    }
    d.attackTimer = 0;
  }

  /** Advance an in-progress attack; fire the hit at attackPoint and end at backswing. */
  private handleAttack(u: UnitEntry, dt: number): void {
    const d = u.data;
    d.attackTimer += dt;

    const effectiveSpeed =
      d.stats.attackSpeed * (d.rapidFireActive ? RAPID_FIRE_SPEED_MULT : 1);
    const cooldown = 1 / effectiveSpeed;
    const attackPoint = d.stats.baseAttackPoint / effectiveSpeed;
    const backswing = d.stats.baseBackswing / effectiveSpeed;

    const target = d.targetId ? this.state.units.get(d.targetId) : undefined;
    if (!target || target.data.hp <= 0) {
      d.targetId = undefined;
      this.resetAttack(u);
      return;
    }

    const dist = Phaser.Math.Distance.Between(
      u.sprite.x,
      u.sprite.y,
      target.sprite.x,
      target.sprite.y,
    );
    const edgeDist = dist - d.radius - target.data.radius;

    // Cancel if target walked out of range before the hit lands
    if (!d.hasDealtDamage && edgeDist > d.stats.attackRange) {
      d.targetId = undefined;
      this.resetAttack(u);
      return;
    }

    if (!d.hasDealtDamage && d.attackTimer >= attackPoint) {
      const damage = this.calculateDamage(d, target.data);
      const isLaser =
        d.unitType === "hero" &&
        d.weapon?.id === "laser-beam" &&
        d.attackCount % 4 === 0;

      if (isLaser) {
        this.applyDamageInstant(d, target, damage);
        this.effects.addLaserBeam(
          u.sprite.x,
          u.sprite.y,
          target.sprite.x,
          target.sprite.y,
          d.team === "A" ? 0x00ffff : 0xff00ff,
        );
      } else if (d.stats.projectileSpeed > 0) {
        this.createProjectile(u, target, damage);
      } else {
        this.applyDamageInstant(d, target, damage);
      }

      d.hasDealtDamage = true;
      d.cooldownTimer = cooldown;
    }

    if (d.hasDealtDamage && d.attackTimer >= attackPoint + backswing) {
      this.resetAttack(u);
    }
  }

  /** Return a unit to idle and resume the appropriate looping animation. */
  private resetAttack(u: UnitEntry): void {
    const d = u.data;
    d.state = "idle";
    d.attackTimer = 0;
    d.hasDealtDamage = false;
    u.sprite.play(d.unitType === "hero" ? "anim-idle" : "anim-walk");
  }

  // ── Damage calculation ─────────────────────────────────────────────────

  /**
   * Apply the Dota-style armour reduction formula and optionally proc crits.
   * Positive armour reduces damage; negative armour amplifies it.
   */
  calculateDamage(attacker: UnitData, target: UnitData): number {
    const armor = target.stats.armor;
    const mult =
      armor >= 0
        ? 1 - (0.06 * armor) / (1 + 0.06 * armor)
        : 2 - Math.pow(0.94, -armor);
    let dmg = Math.max(0, Math.round(attacker.stats.baseDamage * mult));

    if (
      attacker.unitType === "hero" &&
      attacker.weapon?.id === "critical-strike" &&
      Math.random() < CRIT_CHANCE
    ) {
      dmg *= 2;
      const u = this.state.units.get(attacker.id);
      if (u)
        this.effects.addFloatingText(
          u.sprite.x,
          u.sprite.y - 30,
          "CRIT!",
          "#FF0000",
        );
    }
    return dmg;
  }

  applyDamageInstant(
    attacker: UnitData,
    target: UnitEntry,
    damage: number,
  ): void {
    if (target.data.shieldActive) {
      target.data.shieldActive = false;
      target.data.itemCooldown = SHIELD_ITEM_COOLDOWN;
      return;
    }

    const prevHp = target.data.hp;
    target.data.hp -= damage;
    if (target.data.hp <= 0 && prevHp > 0) this.handleLastHit(attacker, target);

    // Splash Blade: every other hit pulses AoE damage around the primary target
    if (
      attacker.unitType === "hero" &&
      attacker.weapon?.id === "splash-blade" &&
      attacker.attackCount % 2 === 0
    ) {
      const aoeDmg = damage * SPLASH_AOE_DAMAGE_MULT;
      this.state.units.forEach((u) => {
        if (
          u.data.id !== target.data.id &&
          u.data.team !== attacker.team &&
          u.data.hp > 0 &&
          Phaser.Math.Distance.Between(
            u.sprite.x,
            u.sprite.y,
            target.sprite.x,
            target.sprite.y,
          ) <= SPLASH_AOE_RADIUS
        ) {
          const prev = u.data.hp;
          u.data.hp -= aoeDmg;
          if (u.data.hp <= 0 && prev > 0) this.handleLastHit(attacker, u);
        }
      });
      // Visual indicator of the AoE pulse
      this.effects.addLaserBeam(
        target.sprite.x - SPLASH_AOE_RADIUS,
        target.sprite.y,
        target.sprite.x + SPLASH_AOE_RADIUS,
        target.sprite.y,
        0xffa500,
      );
    }
  }

  applyDamageFromProjectile(
    attackerId: string,
    target: UnitEntry,
    damage: number,
  ): void {
    const attacker = this.state.units.get(attackerId);
    if (!attacker) return;
    if (target.data.shieldActive) {
      target.data.shieldActive = false;
      target.data.itemCooldown = SHIELD_ITEM_COOLDOWN;
      return;
    }
    const prevHp = target.data.hp;
    target.data.hp -= damage;
    if (target.data.hp <= 0 && prevHp > 0)
      this.handleLastHit(attacker.data, target);
  }

  private handleLastHit(attacker: UnitData, target: UnitEntry): void {
    if (attacker.unitType !== "hero" || target.data.unitType !== "creep")
      return;

    if (target.data.team !== attacker.team) {
      // Last hit on an enemy creep: award gold
      const isRanged = target.data.stats.attackRange > RANGED_RANGE_THRESHOLD;
      let gold =
        (isRanged ? RANGED_CREEP_GOLD_BASE : MELEE_CREEP_GOLD_BASE) +
        Math.floor(Math.random() * CREEP_GOLD_VARIANCE);
      if (attacker.accessory?.id === "midas-hand")
        gold = Math.floor(gold * MIDAS_GOLD_MULT);
      attacker.gold += gold;

      if (attacker.weapon?.id === "rapid-fire") {
        attacker.rapidFireActive = true;
        attacker.rapidFireDuration = RAPID_FIRE_DURATION;
      }
      this.effects.addFloatingText(
        target.sprite.x,
        target.sprite.y,
        `+${gold}`,
        "#FFD700",
      );
      if (attacker.team === "A") this.state.lastHits++;
    } else {
      // Deny: killed own creep to deny enemy gold
      this.effects.addFloatingText(
        target.sprite.x,
        target.sprite.y,
        "!",
        attacker.team === "A" ? "#0096FF" : "#ff99ff",
      );
      if (attacker.team === "A") this.state.denies++;
    }
  }

  // ── Projectiles ────────────────────────────────────────────────────────

  private createProjectile(
    attacker: UnitEntry,
    target: UnitEntry,
    damage: number,
  ): void {
    const dist = Phaser.Math.Distance.Between(
      attacker.sprite.x,
      attacker.sprite.y,
      target.sprite.x,
      target.sprite.y,
    );
    const id = `proj-${++this.state.idCounter}`;
    const color =
      attacker.data.team === "A"
        ? COLORS.TEAM_A_PROJECTILE
        : COLORS.TEAM_B_PROJECTILE;
    const gfx = this.scene.add
      .circle(attacker.sprite.x, attacker.sprite.y, 6, color)
      .setDepth(15);

    this.state.projectiles.set(id, {
      gfx,
      data: {
        id,
        attackerId: attacker.data.id,
        targetId: target.data.id,
        team: attacker.data.team,
        startX: attacker.sprite.x,
        startY: attacker.sprite.y,
        damage,
        speed: attacker.data.stats.projectileSpeed,
        progress: 0,
        arcHeight: Math.min(dist * 0.25, 80),
        lifeTime: 0,
      },
    });
  }

  /** Advance all in-flight projectiles; resolve hits when they reach the target. */
  updateProjectiles(dt: number): void {
    const toRemove: string[] = [];
    this.state.projectiles.forEach((p, id) => {
      p.data.lifeTime += dt;
      const target = this.state.units.get(p.data.targetId);
      if (!target || target.data.hp <= 0 || p.data.lifeTime > 3) {
        toRemove.push(id);
        return;
      }

      const { x: tx, y: ty } = target.sprite;
      const totalDist = Phaser.Math.Distance.Between(
        p.data.startX,
        p.data.startY,
        tx,
        ty,
      );
      p.data.progress = Math.min(
        1,
        p.data.progress + (p.data.speed * dt) / Math.max(totalDist, 1),
      );

      if (p.data.progress >= 1) {
        this.applyDamageFromProjectile(
          p.data.attackerId,
          target,
          p.data.damage,
        );
        toRemove.push(id);
      } else {
        // Lerp along the line and apply a perpendicular arc offset
        const t = p.data.progress;
        const lx = p.data.startX + (tx - p.data.startX) * t;
        const ly = p.data.startY + (ty - p.data.startY) * t;
        const arcOffset = p.data.arcHeight * Math.sin(t * Math.PI);
        const pdx = tx - p.data.startX;
        const pdy = ty - p.data.startY;
        const pDist = Math.hypot(pdx, pdy) || 1;
        const arcDir = p.data.team === "A" ? -1 : 1;
        p.gfx.x = lx + (-pdy / pDist) * arcOffset * arcDir;
        p.gfx.y = ly + (pdx / pDist) * arcOffset * arcDir;
      }
    });

    toRemove.forEach((id) => {
      this.state.projectiles.get(id)?.gfx.destroy();
      this.state.projectiles.delete(id);
    });
  }

  // ── Utilities ──────────────────────────────────────────────────────────

  /**
   * Push this unit away from any same-team unit it overlaps with.
   * Applied after movement velocity is set so it adds on top.
   */
  private applySeparation(u: UnitEntry): void {
    let sx = 0,
      sy = 0;
    this.state.units.forEach((other) => {
      if (other.data.id === u.data.id || other.data.hp <= 0) return;
      if (other.data.team !== u.data.team) return;
      const dx = u.sprite.x - other.sprite.x;
      const dy = u.sprite.y - other.sprite.y;
      const dist = Math.hypot(dx, dy);
      const minDist = u.data.radius + other.data.radius + 4;
      if (dist < minDist && dist > 0) {
        const overlap = (minDist - dist) / minDist;
        sx += (dx / dist) * overlap;
        sy += (dy / dist) * overlap;
      }
    });
    if (sx !== 0 || sy !== 0) {
      const body = u.sprite.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(
        body.velocity.x + sx * SEPARATION_STRENGTH,
        body.velocity.y + sy * SEPARATION_STRENGTH,
      );
    }
  }

  /** Typed shorthand for Arcade-physics velocity to avoid repeated casts. */
  private setVelocity(u: UnitEntry, vx: number, vy: number): void {
    (u.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(vx, vy);
  }

  private findUnit(predicate: (d: UnitData) => boolean): UnitEntry | undefined {
    for (const [, u] of this.state.units) {
      if (predicate(u.data)) return u;
    }
    return undefined;
  }
}
