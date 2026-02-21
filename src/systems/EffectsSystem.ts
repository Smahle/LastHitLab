import Phaser from "phaser";
import { COLORS } from "../config/constants";
import type { GameState } from "../types";

export class EffectsSystem {
  constructor(private scene: Phaser.Scene, private state: GameState) {}

  addFloatingText(x: number, y: number, text: string, color: string): void {
    const t = this.scene.add
      .text(x, y, text, {
        fontSize: "24px",
        fontStyle: "bold",
        color,
        stroke: "#000",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(50);
    this.state.floatingTexts.push({ text: t, duration: 1.0, maxDuration: 1.0 });
  }

  addLaserBeam(x1: number, y1: number, x2: number, y2: number, color: number): void {
    this.state.laserBeams.push({ x1, y1, x2, y2, color, duration: 0.2 });
  }

  updateFloatingTexts(dt: number): void {
    this.state.floatingTexts = this.state.floatingTexts.filter((ft) => {
      ft.duration -= dt;
      ft.text.y -= 30 * dt;
      ft.text.setAlpha(ft.duration / ft.maxDuration);
      if (ft.duration <= 0) {
        ft.text.destroy();
        return false;
      }
      return true;
    });
  }

  draw(): void {
    this.state.effectsGfx.clear();
    this.state.laserBeams = this.state.laserBeams.filter((l) => {
      l.duration -= this.scene.game.loop.delta / 1000;
      if (l.duration <= 0) return false;
      this.state.effectsGfx.lineStyle(4, l.color, l.duration / 0.2);
      this.state.effectsGfx.beginPath();
      this.state.effectsGfx.moveTo(l.x1, l.y1);
      this.state.effectsGfx.lineTo(l.x2, l.y2);
      this.state.effectsGfx.strokePath();
      return true;
    });
    this.state.units.forEach((u) => {
      if (u.data.shieldActive) {
        this.state.effectsGfx.lineStyle(2, COLORS.GOLD, 0.8);
        this.state.effectsGfx.strokeCircle(u.sprite.x, u.sprite.y, u.data.radius + 4);
      }
    });
  }
}
