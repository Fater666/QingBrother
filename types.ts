
export type GameView = 'WORLD_MAP' | 'COMBAT' | 'CAMP' | 'RECRUITMENT' | 'EVENT' | 'CITY';

export enum MoraleStatus {
  CONFIDENT = '自信',
  STEADY = '稳定',
  WAVERING = '动摇',
  BREAKING = '崩溃',
  FLEEING = '逃跑'
}

export interface Ability {
  id: string;
  name: string;
  description: string;
  apCost: number;
  fatCost: number;
  range: [number, number]; // Min, Max
  icon: string;
  type: 'ATTACK' | 'SKILL' | 'UTILITY';
  targetType: 'ENEMY' | 'SELF' | 'ALLY' | 'GROUND';
}

export interface Item {
  id: string;
  name: string;
  type: 'WEAPON' | 'ARMOR' | 'HELMET' | 'SHIELD' | 'CONSUMABLE';
  value: number;
  weight: number;
  durability: number;     // For Armor: Current Armor Points
  maxDurability: number;  // For Armor: Max Armor Points
  description: string;
  
  // Weapon Stats
  damage?: [number, number]; // [Min, Max] HP Damage
  armorPen?: number;         // 0.0 - 1.0 (Direct HP damage percentage ignoring armor)
  armorDmg?: number;         // 0.0 - 2.0 (Multiplier for damage done to armor durability)
  hitChanceMod?: number;     // +% to hit
  
  // Defensive Stats
  defenseBonus?: number;     // Melee Defense bonus (Shields/Parrying weapons)
  rangedBonus?: number;      // Ranged Defense bonus
  
  // Costs
  fatigueCost?: number;      // Fatigue cost to use (Weapon)
  maxFatiguePenalty?: number;// Max Fatigue reduction (Armor/Shield)
  range?: number;            // Attack range in hexes
}

export interface Character {
  id: string;
  name: string;
  background: string;
  backgroundStory: string; // New: Flavor text
  level: number;
  hp: number;
  maxHp: number;
  fatigue: number; // Current accumulated fatigue (starts at 0)
  maxFatigue: number; // Max usable fatigue (Base - Gear)
  morale: MoraleStatus;
  stats: {
    meleeSkill: number;     // 近战命中
    rangedSkill: number;    // 远程命中
    meleeDefense: number;   // 近战防御
    rangedDefense: number;  // 远程防御
    resolve: number;        // 胆识/士气
    initiative: number;     // 身法/先手
  };
  stars: { // Potential (0-3 stars)
    meleeSkill: number;
    rangedSkill: number;
    meleeDefense: number;
    rangedDefense: number;
    resolve: number;
    initiative: number;
    hp: number;
    fatigue: number;
  };
  traits: string[];
  equipment: {
    mainHand: Item | null;
    offHand: Item | null; // For shields
    armor: Item | null;
    helmet: Item | null;
  };
  salary: number;
  
  // New: Formation Logic
  // 0-8: Front Row, 9-17: Back Row. null: Reserve
  formationIndex: number | null; 
}

export interface City {
  id: string;
  name: string;
  x: number;
  y: number;
  type: 'CAPITAL' | 'TOWN' | 'VILLAGE';
  faction: string;
  state: 'NORMAL' | 'WAR' | 'FAMINE' | 'PROSPEROUS';
  market: Item[];
  recruits: Character[];
}

export interface WorldTile {
  x: number;
  y: number;
  type: 'PLAINS' | 'FOREST' | 'MOUNTAIN' | 'SWAMP' | 'CITY' | 'RUINS' | 'SNOW' | 'DESERT' | 'ROAD';
  height: number;
}

export interface WorldEntity {
  id: string;
  name: string;
  type: 'BANDIT' | 'ARMY' | 'TRADER' | 'NOMAD' | 'BEAST';
  faction: 'HOSTILE' | 'NEUTRAL';
  x: number;
  y: number;
  
  // AI State
  targetX: number | null;
  targetY: number | null;
  speed: number;
  aiState: 'IDLE' | 'PATROL' | 'CHASE' | 'TRAVEL';
  homeX: number; // Spawn point or patrol center
  homeY: number;
  targetEntityId?: string | null; // ID of entity chasing
}

export interface Party {
  x: number; // Current float X position
  y: number; // Current float Y position
  targetX: number | null;
  targetY: number | null;
  gold: number;
  food: number;
  mercenaries: Character[];
  inventory: Item[];
  day: number; // Fractional day (e.g., 1.5 is noon on day 1)
}

export interface CombatUnit extends Character {
  combatPos: { q: number; r: number };
  team: 'PLAYER' | 'ENEMY';
  currentAP: number;
  isDead: boolean;
  isShieldWall: boolean;
  isHalberdWall: boolean;
  movedThisTurn: boolean;
  hasWaited: boolean; // Tracks if unit has used "Wait" action this round
}

export interface CombatState {
  units: CombatUnit[];
  turnOrder: string[];
  currentUnitIndex: number;
  round: number;
  combatLog: string[];
  terrainType: string; // To generate combat map
}
