import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from "../config/constants";
import type { GameState, Team } from "../types";
import type { EffectsSystem } from "./EffectsSystem";

export class BarrierSystem {
  constructor(private state: GameState, private effects: EffectsSystem) {}

  init(): void {
    const laneLen = Math.hypot(GAME_WIDTH, GAME_HEIGHT);
    const px = GAME_HEIGHT / laneLen;
    const py = GAME_WIDTH / laneLen;

    this.state.barriers = [
      {
        team: "A",
        x1: GAME_WIDTH * 0.25 - px * laneLen,
        y1: GAME_HEIGHT * 0.75 - py * laneLen,
        x2: GAME_WIDTH * 0.25 + px * laneLen,
        y2: GAME_HEIGHT * 0.75 + py * laneLen,
        hitsRemaining: 3,
      },
      {
        team: "B",
        x1: GAME_WIDTH * 0.75 - px * laneLen,
        y1: GAME_HEIGHT * 0.25 - py * laneLen,
        x2: GAME_WIDTH * 0.75 + px * laneLen,
        y2: GAME_HEIGHT * 0.25 + py * laneLen,
        hitsRemaining: 3,
      },
    ];
  }

  /**
   * Populate `group` with a dense chain of small static sensor bodies
   * covering each barrier line within the visible game area.
   *
   * Because Arcade Physics static bodies don't support rotation for AABB
   * collision, this fallback places 20×20 sensors every 18 px along the
   * line instead of using a single rotated rectangle.
   */
  createSensors(group: Phaser.Physics.Arcade.StaticGroup): void {
    const margin = 30;

    for (const b of this.state.barriers) {
      const dx = b.x2 - b.x1;
      const dy = b.y2 - b.y1;
      const len = Math.hypot(dx, dy);
      const count = Math.ceil(len / 18) + 1;

      for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        const x = b.x1 + dx * t;
        const y = b.y1 + dy * t;

        // Skip sensors that fall entirely outside the visible canvas
        if (
          x < -margin ||
          x > GAME_WIDTH + margin ||
          y < -margin ||
          y > GAME_HEIGHT + margin
        ) {
          continue;
        }

        // "__DEFAULT" is Phaser's built-in 32×32 white texture; set invisible
        const sensor = group.create(
          x,
          y,
          "__DEFAULT",
        ) as Phaser.Physics.Arcade.Image;
        sensor.setAlpha(0);
        (sensor.body as Phaser.Physics.Arcade.StaticBody).setSize(20, 20, true);
        sensor.setData("barrierTeam", b.team as Team);
        sensor.setData("barrier", b);
      }
    }
  }

  draw(): void {
    this.state.barrierGfx.clear();
    for (const b of this.state.barriers) {
      if (b.hitsRemaining <= 0) continue;
      const color = b.team === "A" ? COLORS.BARRIER_A : COLORS.BARRIER_B;
      this.state.barrierGfx.lineStyle(4, color, b.hitsRemaining / 3);
      this.state.barrierGfx.beginPath();
      this.state.barrierGfx.moveTo(b.x1, b.y1);
      this.state.barrierGfx.lineTo(b.x2, b.y2);
      this.state.barrierGfx.strokePath();
    }
  }
}
