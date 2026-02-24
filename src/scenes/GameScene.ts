import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT, PICK_MARGIN } from "../config/constants";
import { HERO_STATS } from "../config/unitStats";
import type { Stats } from "../config/unitStats";
import type {
  GameState,
  Team,
  UnitType,
  UnitData,
  UnitEntry,
  Barrier,
} from "../types";
import { EffectsSystem } from "../systems/EffectsSystem";
import { CombatSystem } from "../systems/CombatSystem";
import { WaveSystem } from "../systems/WaveSystem";
import { BarrierSystem } from "../systems/BarrierSystem";
import { HUD } from "../ui/HUD";

export class GameScene extends Phaser.Scene {
  private state!: GameState;
  private effects!: EffectsSystem;
  private combat!: CombatSystem;
  private waves!: WaveSystem;
  private barrier!: BarrierSystem;
  private hud!: HUD;
  private targetingMode = false;

  // ── Physics groups ────────────────────────────────────────────────────
  private unitsGroup!: Phaser.Physics.Arcade.Group;
  private projectilesGroup!: Phaser.Physics.Arcade.Group;
  private barrierSensorsGroup!: Phaser.Physics.Arcade.StaticGroup;

  constructor() {
    super({ key: "GameScene" });
  }

  preload() {
    this.load.image("bg", "assets/map2.png");
    this.load.atlas("archmage", "assets/archmage.png", "assets/archmage.json");
  }

  create() {
    // Generate a small circle texture used for projectile sprites
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff);
    g.fillCircle(6, 6, 6);
    g.generateTexture("projectile", 12, 12);
    g.destroy();

    // ── World bounds ────────────────────────────────────────────────────
    this.physics.world.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // ── Physics groups ──────────────────────────────────────────────────
    this.unitsGroup = this.physics.add.group();

    // Projectile pool — 200 sprites, no per-child update needed
    this.projectilesGroup = this.physics.add.group({
      maxSize: 200,
      runChildUpdate: false,
    });

    this.barrierSensorsGroup = this.physics.add.staticGroup();

    // ── Game state ──────────────────────────────────────────────────────
    this.state = {
      units: new Map(),
      hpBars: new Map(),
      barriers: [],
      barrierGfx: this.add.graphics(),
      effectsGfx: this.add.graphics(),
      floatingTexts: [],
      laserBeams: [],
      waveNumber: 0,
      waveTimer: 0,
      lastHits: 0,
      denies: 0,
      idCounter: 0,
      shopOpen: false,
    };

    this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, "bg")
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
      .setDepth(-1);

    // ── Systems ─────────────────────────────────────────────────────────
    this.effects = new EffectsSystem(this, this.state);
    this.combat = new CombatSystem(
      this,
      this.state,
      this.effects,
      this.projectilesGroup,
    );
    this.barrier = new BarrierSystem(this.state, this.effects);
    this.waves = new WaveSystem(this.state, (opts) => this.createUnit(opts));
    this.hud = new HUD(this, this.state);

    // ── Colliders & overlaps ────────────────────────────────────────────
    this.physics.add.collider(this.unitsGroup, this.unitsGroup);

    // Projectile hits: overlap resolves damage via callback
    this.physics.add.overlap(
      this.projectilesGroup,
      this.unitsGroup,
      this.onProjectileHit as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this,
    );

    // Barrier sensors: creeps that enter the sensor zone are killed
    this.physics.add.overlap(
      this.barrierSensorsGroup,
      this.unitsGroup,
      this.onBarrierTouch as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this,
    );

    this.createAnimations();
    this.spawnHeroes();
    this.barrier.init();
    this.barrier.createSensors(this.barrierSensorsGroup);
    this.waves.start();
    this.hud.create(
      () => this.hud.toggleShop(),
      () => {
        this.targetingMode = !this.targetingMode;
      },
    );

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.state.shopOpen) return;
      this.handleClick(pointer.x, pointer.y);
    });
  }

  private createAnimations() {
    this.anims.create({
      key: "anim-idle",
      frames: this.anims.generateFrameNames("archmage", {
        prefix: "idle_",
        start: 0,
        end: 4,
      }),
      frameRate: 5,
      repeat: -1,
    });
    this.anims.create({
      key: "anim-walk",
      frames: this.anims.generateFrameNames("archmage", {
        prefix: "walk_",
        start: 0,
        end: 7,
      }),
      frameRate: 8,
      repeat: -1,
    });
    this.anims.create({
      key: "anim-attack",
      frames: this.anims.generateFrameNames("archmage", {
        prefix: "attack_",
        start: 0,
        end: 4,
      }),
      frameRate: 8,
      repeat: 0,
    });
    this.anims.create({
      key: "anim-death",
      frames: this.anims.generateFrameNames("archmage", {
        prefix: "death_",
        start: 0,
        end: 7,
      }),
      frameRate: 8,
      repeat: 0,
    });
  }

  update(_time: number, deltaMs: number) {
    const dt = deltaMs / 1000;
    if (this.state.shopOpen) return;

    this.waves.update(dt);

    this.state.units.forEach((u) => {
      if (u.data.hp <= 0) return;
      this.combat.updateUnit(u, dt);
    });

    // steer any in-flight projectiles toward their targets
    this.combat.updateProjectiles(dt);

    this.updateHPBars();
    this.barrier.draw();
    this.effects.updateFloatingTexts(dt);
    this.effects.draw();
    this.hud.update(this.targetingMode);
    this.removeDeadUnits();
  }

  private createUnit(opts: {
    id: string;
    team: Team;
    unitType: UnitType;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    radius: number;
    stats: Stats;
    gold?: number;
    laneOffset?: number;
  }) {
    const data: UnitData = {
      id: opts.id,
      team: opts.team,
      unitType: opts.unitType,
      hp: opts.hp,
      maxHp: opts.maxHp,
      radius: opts.radius,
      state: "idle",
      attackTimer: 0,
      cooldownTimer: 0,
      hasDealtDamage: false,
      stats: opts.stats,
      laneOffset: opts.laneOffset ?? 0,
      gold: opts.gold ?? 0,
      attackCount: 0,
      shieldActive: false,
      itemCooldown: 0,
      rapidFireActive: false,
      rapidFireDuration: 0,
    };

    const sprite = this.physics.add.sprite(
      opts.x,
      opts.y,
      "archmage",
      "idle_0",
    );

    // Set up circular physics body for all units
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    body.setCircle(
      opts.radius,
      sprite.width / 2 - opts.radius,
      sprite.height / 2 - opts.radius,
    );
    body.setAllowGravity(false);
    body.setCollideWorldBounds(true);

    // Tag sprite so overlap callbacks can look up the unit
    sprite.setData("unitId", opts.id);
    sprite.setData("team", opts.team);

    if (opts.unitType === "hero") {
      sprite.setScale(0.35).setDepth(10);
      sprite.play("anim-idle");
      if (opts.team === "B") sprite.setFlipX(true);
      // Heroes don't move; make them immovable so creeps are deflected
      body.setImmovable(true);
    } else {
      const isRanged = opts.stats.attackRange > 100;
      const tint =
        opts.team === "A"
          ? isRanged
            ? 0x1faf3a
            : 0x6ee76e
          : isRanged
            ? 0xc81e1e
            : 0xff6b6b;
      sprite.setScale(0.2).setDepth(5).setTint(tint);
      sprite.play("anim-walk");
      if (opts.team === "B") sprite.setFlipX(true);
    }

    this.unitsGroup.add(sprite);

    const barW = opts.radius * 2;
    this.state.hpBars.set(opts.id, {
      bg: this.add
        .rectangle(opts.x, opts.y - opts.radius - 6, barW, 4, 0x333333)
        .setDepth(20),
      fg: this.add
        .rectangle(opts.x, opts.y - opts.radius - 6, barW, 4, 0x4caf50)
        .setDepth(21),
    });
    this.state.units.set(opts.id, { sprite, data });
  }

  private spawnHeroes() {
    const heroSize = 28 * 3;
    this.createUnit({
      id: "hero-A",
      team: "A",
      unitType: "hero",
      x: heroSize / 2 + 14,
      y: GAME_HEIGHT - heroSize / 2 - 14,
      hp: 1100,
      maxHp: 1100,
      radius: 28,
      stats: { ...HERO_STATS },
      gold: 500,
    });
    this.createUnit({
      id: "hero-B",
      team: "B",
      unitType: "hero",
      x: GAME_WIDTH - heroSize / 2 - 14,
      y: heroSize / 2 + 14,
      hp: 1100,
      maxHp: 1100,
      radius: 28,
      stats: { ...HERO_STATS },
      gold: 500,
    });
  }

  // ── Overlap callbacks ──────────────────────────────────────────────────

  /**
   * Called by Arcade Physics when a projectile overlaps a unit sprite.
   * Ignores friendly fire; applies damage and returns the projectile to
   * the pool.
   */
  private onProjectileHit(
    projectile: Phaser.GameObjects.GameObject,
    unitSprite: Phaser.GameObjects.GameObject,
  ): void {
    const proj = projectile as Phaser.Physics.Arcade.Sprite;
    const sprite = unitSprite as Phaser.Physics.Arcade.Sprite;

    const projTeam = proj.getData("team") as Team;
    const unitTeam = sprite.getData("team") as Team;

    // Ignore friendly fire
    if (projTeam === unitTeam) return;

    const attackerId = proj.getData("attackerId") as string;
    const damage = proj.getData("damage") as number;
    const intended = proj.getData("targetId") as string | undefined;
    const unitId = sprite.getData("unitId") as string;

    // only the designated target should be affected by this projectile
    if (intended && unitId !== intended) return;

    const unit = this.state.units.get(unitId);
    if (!unit || unit.data.hp <= 0) {
      this.projectilesGroup.killAndHide(proj);
      return;
    }

    this.combat.applyDamageFromProjectile(attackerId, unit, damage);
    this.projectilesGroup.killAndHide(proj);
  }

  /**
   * Called by Arcade Physics when a barrier sensor overlaps a unit sprite.
   * Only enemy creeps are affected; each hit decrements hitsRemaining and
   * kills the creep. Sensors for an exhausted barrier are disabled.
   */
  private onBarrierTouch(
    sensor: Phaser.GameObjects.GameObject,
    unitSprite: Phaser.GameObjects.GameObject,
  ): void {
    const sensorImg = sensor as Phaser.Physics.Arcade.Image;
    const sprite = unitSprite as Phaser.Physics.Arcade.Sprite;

    const barrierTeam = sensorImg.getData("barrierTeam") as Team;
    const unitTeam = sprite.getData("team") as Team;

    // Only affect enemy creeps
    if (unitTeam === barrierTeam) return;

    const unitId = sprite.getData("unitId") as string;
    const unit = this.state.units.get(unitId);
    if (!unit || unit.data.hp <= 0 || unit.data.unitType !== "creep") return;

    const b = sensorImg.getData("barrier") as Barrier;
    if (b.hitsRemaining <= 0) return;

    unit.data.hp = 0;
    b.hitsRemaining--;

    this.effects.addFloatingText(
      sprite.x,
      sprite.y - 20,
      "BLOCKED!",
      barrierTeam === "A" ? "#4fc3f7" : "#ff6b6b",
    );

    // Disable all sensors for this barrier when its charges are exhausted
    if (b.hitsRemaining <= 0) {
      this.barrierSensorsGroup.getChildren().forEach((child) => {
        const img = child as Phaser.Physics.Arcade.Image;
        if (img.getData("barrier") === b) {
          img.setActive(false).setVisible(false);
          (img.body as Phaser.Physics.Arcade.StaticBody).enable = false;
        }
      });
    }
  }

  // ── Input ──────────────────────────────────────────────────────────────

  private handleClick(x: number, y: number) {
    const heroA = this.state.units.get("hero-A");
    if (!heroA) return;

    let clicked: UnitEntry | undefined;
    let closestDist = Infinity;
    this.state.units.forEach((u) => {
      if (u.data.hp <= 0) return;
      const d = Math.hypot(x - u.sprite.x, y - u.sprite.y);
      if (d <= u.data.radius + PICK_MARGIN && d < closestDist) {
        closestDist = d;
        clicked = u;
      }
    });
    if (!clicked) return;

    if (this.targetingMode) {
      if (clicked.data.team === "A") {
        clicked.data.shieldActive = true;
        heroA.data.itemCooldown = 35;
        this.effects.addFloatingText(
          clicked.sprite.x,
          clicked.sprite.y - 30,
          "SHIELD!",
          "#FFD700",
        );
        this.targetingMode = false;
      }
      return;
    }

    const target = clicked.data;
    if (target.id === "hero-A") return;
    if (
      target.team === "A" &&
      target.unitType === "creep" &&
      target.hp > target.maxHp * 0.5
    )
      return;


    const dist = Math.hypot(
      clicked.sprite.x - heroA.sprite.x,
      clicked.sprite.y - heroA.sprite.y,
    );
    const edgeDist = dist - heroA.data.radius - target.radius;

    if (edgeDist <= heroA.data.stats.attackRange) {
      if (heroA.data.state === "idle" && heroA.data.cooldownTimer <= 0) {
        this.combat.startAttack(heroA, target.id);
      } else {
        heroA.data.targetId = target.id;
      }
    } else {
      heroA.data.targetId = target.id;
    }
  }

  // ── HP bars & cleanup ──────────────────────────────────────────────────

  private updateHPBars() {
    this.state.units.forEach((u) => {
      const bar = this.state.hpBars.get(u.data.id);
      if (!bar) return;
      const ratio = Math.max(0, u.data.hp / u.data.maxHp);
      const w = u.data.radius * 2;
      bar.bg.setPosition(u.sprite.x, u.sprite.y - u.data.radius - 6);
      bar.fg.setPosition(
        u.sprite.x - (w * (1 - ratio)) / 2,
        u.sprite.y - u.data.radius - 6,
      );
      bar.fg.setDisplaySize(w * ratio, 4);
      bar.fg.setFillStyle(
        ratio > 0.5 ? 0x4caf50 : ratio > 0.25 ? 0xff9800 : 0xf44336,
      );
    });
  }

  private removeDeadUnits() {
    const toRemove: string[] = [];
    this.state.units.forEach((u, id) => {
      if (u.data.hp <= 0 && u.data.unitType !== "hero") toRemove.push(id);
    });
    toRemove.forEach((id) => {
      const u = this.state.units.get(id);
      if (u) {
        // sprite.destroy() also removes the body from all physics groups
        u.sprite.destroy();
        const bar = this.state.hpBars.get(id);
        if (bar) {
          bar.bg.destroy();
          bar.fg.destroy();
        }
        this.state.hpBars.delete(id);
      }
      this.state.units.delete(id);
    });
  }
}
