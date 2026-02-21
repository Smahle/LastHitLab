import { GAME_WIDTH, GAME_HEIGHT } from "./config/constants";
import type { Team, GameState } from "./types";

export function spawnPos(team: Team) {
  return team === "A"
    ? { x: GAME_WIDTH * -0.15, y: GAME_HEIGHT * 1.15 }
    : { x: GAME_WIDTH * 1.15, y: GAME_HEIGHT * -0.15 };
}

export function targetPos(team: Team) {
  return team === "A"
    ? { x: GAME_WIDTH * 0.85, y: GAME_HEIGHT * 0.15 }
    : { x: GAME_WIDTH * 0.15, y: GAME_HEIGHT * 0.85 };
}

export function nextId(state: GameState, prefix: string): string {
  return `${prefix}-${++state.idCounter}`;
}
