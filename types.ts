
export interface Vector2 {
  x: number;
  y: number;
}

export enum WeaponType {
  FIST = 'FIST',
  PISTOL = 'PISTOL',
  MACHINE_GUN = 'MACHINE_GUN',
  GRENADE = 'GRENADE'
}

export interface WeaponInfo {
  type: WeaponType;
  ammo: number;
  cooldown: number;
  damage: number;
  zoomFactor: number;
}

export interface Entity {
  id: string;
  pos: Vector2;
  angle: number;
  velocity: Vector2;
  radius: number;
}

export enum EntityType {
  PLAYER = 'PLAYER',
  PEDESTRIAN = 'PEDESTRIAN',
  VEHICLE = 'VEHICLE',
  PROJECTILE = 'PROJECTILE'
}

export interface Projectile extends Entity {
  type: EntityType.PROJECTILE;
  ownerId: string;
  weaponType: WeaponType;
  distanceTraveled: number;
  maxDistance: number;
  isExplosive: boolean;
}

export interface Vehicle extends Entity {
  type: EntityType.VEHICLE;
  vehicleStyle: 'sedan' | 'sport' | 'van';
  color: string;
  speed: number;
  health: number;
}

export interface Pedestrian extends Entity {
  type: EntityType.PEDESTRIAN | EntityType.PLAYER;
  health: number;
  currentWeapon: WeaponType;
  state: 'idle' | 'walking' | 'running' | 'rolling' | 'dead';
  anger: number;
  targetId?: string;
  stamina: number;
  lastShotTime: number;
  rollTimer: number;
  currentVehicleId?: string;
  isAiming?: boolean;
}

export interface BloodEffect {
  pos: Vector2;
  alpha: number;
  timestamp: number;
  angle: number;
  scale: number;
}

export interface GameState {
  player: Pedestrian;
  vehicles: Vehicle[];
  pedestrians: Pedestrian[];
  projectiles: Projectile[];
  score: number;
  wantedLevel: number;
  currentVehicleSpeed?: number;
}
