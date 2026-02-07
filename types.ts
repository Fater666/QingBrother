
export type GameView = 'MAIN_MENU' | 'PROLOGUE' | 'ORIGIN_SELECT' | 'INTRO_STORY' | 'WORLD_MAP' | 'COMBAT' | 'CAMP' | 'RECRUITMENT' | 'EVENT' | 'CITY' | 'BATTLE_RESULT';

// 战团起源类型
export interface OriginConfig {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  gold: number;
  food: number;
  mercenaries: {
    name?: string;
    bg: string;
    formationIndex: number | null;
    equipment?: {
      mainHand?: string[];   // 武器ID池，随机选一个
      offHand?: string[];    // 盾牌ID池
      armor?: string[];      // 护甲ID池
      helmet?: string[];     // 头盔ID池
    };
  }[];
  introStory: string[];
}

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
  subType?: 'FOOD' | 'MEDICINE' | 'REPAIR_KIT';  // 消耗品子类型
  effectValue?: number;                            // 效果值（恢复量/修复量等）
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
    targetEntityName?: string; // 目标敌人名称（杀敌任务用）
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

// 大地图AI行为类型
export type WorldAIType = 'BANDIT' | 'BEAST' | 'ARMY' | 'TRADER' | 'NOMAD';

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
  aiState: 'IDLE' | 'PATROL' | 'CHASE' | 'TRAVEL' | 'FLEE' | 'WANDER' | 'AMBUSH' | 'RETURN';
  homeX: number; 
  homeY: number;
  targetEntityId?: string | null; 
  isQuestTarget?: boolean;
  
  // 行为树扩展属性
  worldAIType: WorldAIType;                    // 大地图AI类型
  patrolPoints?: {x: number, y: number}[];     // 巡逻路线点
  patrolIndex?: number;                        // 当前巡逻点索引
  alertRadius: number;                         // 警戒半径（发现玩家）
  chaseRadius: number;                         // 追击半径（放弃追击）
  territoryRadius?: number;                    // 领地半径（野兽专用）
  fleeThreshold?: number;                      // 逃跑阈值（0-1）
  lastSeenPlayerPos?: {x: number, y: number};  // 上次发现玩家位置
  wanderCooldown?: number;                     // 游荡冷却计时器
  strength?: number;                           // 队伍实力（用于判断是否追击）
  linkedCityId?: string;                       // 绑定城市ID（军队/商队）
  destinationCityId?: string;                  // 目的地城市ID（商队）
}

// ==================== 野心目标系统 ====================

export type AmbitionType = 'COMBAT' | 'ECONOMY' | 'TEAM' | 'EQUIPMENT' | 'EXPLORATION';

export interface Ambition {
  id: string;
  name: string;
  description: string;
  type: AmbitionType;
  reputationReward: number; // 完成后获得的声望（默认100）
}

export interface AmbitionState {
  currentAmbition: Ambition | null;       // 当前选定的野心目标
  completedIds: string[];                 // 已完成的目标ID列表
  lastCancelledIds: string[];             // 上次取消的目标ID列表（下次候选排除）
  nextSelectionDay: number;               // 下一次可以选择目标的天数
  noAmbitionUntilDay: number;             // "无野心"冷却到期天数
  totalCompleted: number;                 // 累计完成目标数
  battlesWon: number;                     // 累计战斗胜利数（用于目标检测）
  citiesVisited: string[];                // 已访问过的城市ID（用于目标检测）
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
  reputation: number;                     // 声望值（影响合同出价）
  ambitionState: AmbitionState;           // 野心目标状态
  moraleModifier: number;                 // 全员士气修正（+1=自信开场, -1=动摇开场, 0=正常）
}

// 敌人AI类型
export type AIType = 'BANDIT' | 'BEAST' | 'ARMY' | 'ARCHER' | 'BERSERKER';

export interface CombatUnit extends Character {
  combatPos: { q: number; r: number };
  team: 'PLAYER' | 'ENEMY';
  currentAP: number;
  isDead: boolean;
  isShieldWall: boolean;
  isHalberdWall: boolean;
  movedThisTurn: boolean;
  waitCount: number; // 本回合等待次数，最多2次
  freeSwapUsed: boolean;
  hasUsedFreeAttack: boolean; // 本回合是否已使用过截击（控制区机制）
  aiType?: AIType; // 敌人AI行为类型
}

export interface CombatState {
  units: CombatUnit[];
  turnOrder: string[];
  currentUnitIndex: number;
  round: number;
  combatLog: string[];
  terrainType: string; 
}

// 战斗结算数据
export interface BattleResult {
  victory: boolean;
  roundsTotal: number;
  enemyName: string;
  // 阶段一：伤亡与经验
  casualties: { name: string; background: string }[];
  survivors: { id: string; name: string; background: string; hpBefore: number; hpAfter: number; maxHp: number; xpGained: number }[];
  enemiesKilled: number;
  enemiesRouted: number;
  // 阶段二：战利品
  lootItems: Item[];
  goldReward: number;
}
