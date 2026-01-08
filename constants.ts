
export const TILE_SIZE = 128;
export const CITY_SIZE = 40;
export const FRICTION = 0.92;
export const DRAG = 0.97;
export const VEHICLE_ACCEL = 0.25;
export const VEHICLE_TURN_SPEED = 0.06;

export const PLAYER_RUN_SPEED = 3.5;
export const PLAYER_WALK_SPEED = 1.4;
export const STAMINA_REGEN = 0.4;
export const ROLL_STAMINA_COST = 30;
export const ROLL_SPEED_BOOST = 6.5;

export const WEAPONS = {
  [ 'FIST' ]: { range: 60, damage: 15, cooldown: 12, zoomFactor: 1.2 },
  [ 'PISTOL' ]: { range: 500, damage: 25, cooldown: 20, zoomFactor: 1.5 },
  [ 'MACHINE_GUN' ]: { range: 700, damage: 15, cooldown: 5, zoomFactor: 1.8 },
  [ 'GRENADE' ]: { range: 400, damage: 100, cooldown: 60, explosive: true, zoomFactor: 1.4 }
};

export const COLORS = {
  ROAD: '#1e1e1e',
  SIDEWALK: '#383838',
  BUILDING: '#1a1a2e',
  BUILDING_TOP: '#24243e',
  GRASS: '#162b16',
  TREE: '#0a1a0a',
  PLAYER: '#00ffcc',
  PED: '#ffffff',
  MIST: 'rgba(0, 0, 0, 0.85)'
};

export const generateMap = () => {
  const grid: number[][] = [];
  for (let y = 0; y < CITY_SIZE; y++) {
    grid[y] = [];
    for (let x = 0; x < CITY_SIZE; x++) {
      if (x % 6 === 0 || y % 6 === 0) {
        grid[y][x] = 1; // Road
      } else if (x % 6 === 1 || x % 6 === 5 || y % 6 === 1 || y % 6 === 5) {
        grid[y][x] = 2; // Sidewalk
      } else {
        grid[y][x] = (Math.random() > 0.94) ? 4 : 3; // 3: Building, 4: Tree/Park
      }
    }
  }
  return grid;
};
