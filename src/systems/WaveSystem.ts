import { WAVE_INTERVAL, SHOP_DURATION } from "../config/constants";
import { MELEE_CREEP_STATS, RANGED_CREEP_STATS } from "../config/unitStats";
import type { GameState, Team, UnitData } from "../types";
import type { Stats } from "../config/unitStats";
import { spawnPos, targetPos, nextId } from "../helpers";

type CreateUnitOpts = {
  id: string;
  team: Team;
  unitType: "creep";
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  radius: number;
  stats: Stats;
  laneOffset?: number;
};

export class WaveSystem {
  constructor(
    private state: GameState,
    private createUnit: (opts: CreateUnitOpts) => void
  ) {}

  start(): void {
    this.state.waveNumber = 1;
    this.spawnWave();
  }

  update(dt: number): void {
    this.state.waveTimer += dt;
    if (this.state.waveTimer >= WAVE_INTERVAL + SHOP_DURATION) {
      this.state.waveNumber++;
      this.state.waveTimer = 0;
      this.spawnWave();
    }
  }

  private spawnWave(): void {
    this.spawnTeam("A");
    this.spawnTeam("B");
  }

  private spawnTeam(team: Team): void {
    const r = 22;
    const sep = 2 * r + 50;
    const start = spawnPos(team);
    const goal = targetPos(team);
    const dx = goal.x - start.x;
    const dy = goal.y - start.y;
    const laneLen = Math.hypot(dx, dy);
    const dir = { x: dx / laneLen, y: dy / laneLen };
    const perp = { x: -dir.y, y: dir.x };

    for (let i = 0; i < 3; i++) {
      const offset = (i - 1) * sep;
      this.createUnit({
        id: nextId(this.state, `melee-${team}`),
        team,
        unitType: "creep",
        x: start.x + perp.x * offset,
        y: start.y + perp.y * offset,
        hp: 550,
        maxHp: 550,
        radius: r,
        stats: { ...MELEE_CREEP_STATS },
        laneOffset: offset,
      });
    }

    this.createUnit({
      id: nextId(this.state, `ranged-${team}`),
      team,
      unitType: "creep",
      x: start.x + dir.x * -60,
      y: start.y + dir.y * -60,
      hp: 300,
      maxHp: 300,
      radius: r,
      stats: { ...RANGED_CREEP_STATS },
      laneOffset: 0,
    });
  }
}
