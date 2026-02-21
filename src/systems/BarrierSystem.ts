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

  check(prevPos: Map<string, { x: number; y: number }>): void {
    for (const b of this.state.barriers) {
      if (b.hitsRemaining <= 0) continue;
      const enemyTeam: Team = b.team === "A" ? "B" : "A";

      this.state.units.forEach((u) => {
        if (u.data.team !== enemyTeam || u.data.unitType !== "creep" || u.data.hp <= 0) return;
        const prev = prevPos.get(u.data.id);
        if (!prev) return;

        const before = this.lineSide(prev.x, prev.y, b.x1, b.y1, b.x2, b.y2);
        const after = this.lineSide(u.sprite.x, u.sprite.y, b.x1, b.y1, b.x2, b.y2);

        if (before * after < 0) {
          u.data.hp = 0;
          b.hitsRemaining--;
          this.effects.addFloatingText(
            u.sprite.x, u.sprite.y - 20,
            "BLOCKED!",
            b.team === "A" ? "#4fc3f7" : "#ff6b6b"
          );
        }
      });
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

  private lineSide(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    return (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1);
  }
}
