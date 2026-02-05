
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

export interface Perk {
  id: string;
  name: string; 
  tier: number; 
  icon: string;
  description: string;
}

export interface BackgroundTemplate {
  id: string;
  name: string;
  icon: string;
  salaryMult: number;
  gearQuality: number;
  hpMod: [number, number];
  fatigueMod: [number, number];
  resolveMod: [number, number];
  meleeSkillMod: [number, number];
  rangedSkillMod: [number, number];
  defMod: [number, number];
  initMod: [number, number];
  desc: string;
  stories: string[];
}

export interface Item {
  id: string;
  name: string;
  type: 'WEAPON' | 'ARMOR' | 'HELMET' | 'SHIELD' | 'CONSUMABLE' | 'AMMO' | 'ACCESSORY';
  value: number;
  weight: number;
  durability: number;     
  maxDurability: number;  
  description: string;
  damage?: [number, number]; 
  armorPen?: number;         
  armorDmg?: number;         
  hitChanceMod?: number;     
  defenseBonus?: number;     
  rangedBonus?: number;      
  fatigueCost?: number;      
  maxFatiguePenalty?: number;
  range?: number;            
}

export interface Character {
  id: string;
  name: string;
  background: string;
  backgroundStory: string;
  level: number;
  xp: number;
  hp: number;
  maxHp: number;
  fatigue: number; 
  maxFatigue: number; 
  morale: MoraleStatus;
  stats: {
    meleeSkill: number;     
    rangedSkill: number;    
    meleeDefense: number;   
    rangedDefense: number;  
    resolve: number;        
    initiative: number;     
  };
  stars: { 
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
  perkPoints: number;
  perks: string[]; 
  equipment: {
    mainHand: Item | null;
    offHand: Item | null;
    armor: Item | null;
    helmet: Item | null;
    ammo: Item | null;
    accessory: Item | null;
  };
  bag: (Item | null)[]; 
  salary: number;
  formationIndex: number | null; 
}

export type QuestType = 'HUNT' | 'ESCORT' | 'PATROL' | 'DELIVERY';

export interface Quest {
    id: string;
    type: QuestType;
    title: string;
    description: string;
    difficulty: 1 | 2 | 3; 
    rewardGold: number;
    sourceCityId: string;
    targetCityId?: string; 
    targetEntityId?: string; 
    isCompleted: boolean;
    daysLeft: number;
}

export type CityFacility = 'MARKET' | 'RECRUIT' | 'TAVERN' | 'TEMPLE';

export interface City {
  id: string;
  name: string;
  x: number;
  y: number;
  type: 'CAPITAL' | 'TOWN' | 'VILLAGE';
  faction: string;
  state: 'NORMAL' | 'WAR' | 'FAMINE' | 'PROSPEROUS';
  facilities: CityFacility[]; 
  market: Item[];
  recruits: Character[];
  quests: Quest[]; 
}

export interface WorldTile {
  x: number;
  y: number;
  type: 'PLAINS' | 'FOREST' | 'MOUNTAIN' | 'SWAMP' | 'CITY' | 'RUINS' | 'SNOW' | 'DESERT' | 'ROAD';
  height: number;
  explored: boolean; 
}

export interface WorldEntity {
  id: string;
  name: string;
  type: 'BANDIT' | 'ARMY' | 'TRADER' | 'NOMAD' | 'BEAST' | 'QUEST_TARGET';
  faction: 'HOSTILE' | 'NEUTRAL' | 'ALLY';
  x: number;
  y: number;
  targetX: number | null;
  targetY: number | null;
  speed: number;
  aiState: 'IDLE' | 'PATROL' | 'CHASE' | 'TRAVEL' | 'FLEE';
  homeX: number; 
  homeY: number;
  targetEntityId?: string | null; 
  isQuestTarget?: boolean; 
}

export interface Party {
  x: number; 
  y: number; 
  targetX: number | null;
  targetY: number | null;
  gold: number;
  food: number;
  mercenaries: Character[];
  inventory: Item[];
  day: number; 
  activeQuest: Quest | null;
}

export interface CombatUnit extends Character {
  combatPos: { q: number; r: number };
  team: 'PLAYER' | 'ENEMY';
  currentAP: number;
  isDead: boolean;
  isShieldWall: boolean;
  isHalberdWall: boolean;
  movedThisTurn: boolean;
  hasWaited: boolean; 
  freeSwapUsed: boolean; 
}

export interface CombatState {
  units: CombatUnit[];
  turnOrder: string[];
  currentUnitIndex: number;
  round: number;
  combatLog: string[];
  terrainType: string; 
}
