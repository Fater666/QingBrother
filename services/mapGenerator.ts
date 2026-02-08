/**
 * 地图生成器 - 仿战场兄弟风格
 * 使用柏林噪声和区域系统生成具有特色的地图
 */

import { WorldTile, City, Quest, Character, Item, QuestType } from '../types';
import { MAP_SIZE, WEAPON_TEMPLATES, ARMOR_TEMPLATES, HELMET_TEMPLATES, SHIELD_TEMPLATES, CONSUMABLE_TEMPLATES, CITY_NAMES, SURNAMES, NAMES_MALE, BACKGROUNDS, BackgroundTemplate, assignTraits, getTraitStatMods, QUEST_TEMPLATES, QUEST_NPC_NAMES, QUEST_PLACE_NAMES, ELITE_QUEST_TEMPLATES } from '../constants';

// ============================================================================
// 柏林噪声实现 (Simplex-like Noise)
// ============================================================================

// 梯度向量表
const GRAD3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
];

// 排列表 - 用于伪随机
const createPermutation = (seed: number): number[] => {
  const perm = Array.from({ length: 256 }, (_, i) => i);
  
  // Fisher-Yates shuffle with seed
  let s = seed;
  for (let i = 255; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  
  // 扩展到512以便于访问
  return [...perm, ...perm];
};

// 点积
const dot2 = (g: number[], x: number, y: number): number => g[0] * x + g[1] * y;

// 平滑插值
const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

// 线性插值
const lerp = (a: number, b: number, t: number): number => a + t * (b - a);

/**
 * 2D柏林噪声
 */
export class PerlinNoise {
  private perm: number[];
  
  constructor(seed: number = Math.random() * 10000) {
    this.perm = createPermutation(Math.floor(seed));
  }
  
  /**
   * 获取2D噪声值 (返回0-1范围)
   */
  noise2D(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    
    const u = fade(xf);
    const v = fade(yf);
    
    const aa = this.perm[this.perm[X] + Y];
    const ab = this.perm[this.perm[X] + Y + 1];
    const ba = this.perm[this.perm[X + 1] + Y];
    const bb = this.perm[this.perm[X + 1] + Y + 1];
    
    const gradAA = GRAD3[aa % 12];
    const gradBA = GRAD3[ba % 12];
    const gradAB = GRAD3[ab % 12];
    const gradBB = GRAD3[bb % 12];
    
    const x1 = lerp(dot2(gradAA, xf, yf), dot2(gradBA, xf - 1, yf), u);
    const x2 = lerp(dot2(gradAB, xf, yf - 1), dot2(gradBB, xf - 1, yf - 1), u);
    
    // 归一化到 0-1 范围
    return (lerp(x1, x2, v) + 1) / 2;
  }
  
  /**
   * 分形噪声 (多层叠加)
   * octaves: 层数
   * persistence: 每层衰减系数
   * lacunarity: 每层频率倍增
   */
  fractalNoise(x: number, y: number, octaves: number = 4, persistence: number = 0.5, lacunarity: number = 2): number {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;
    
    for (let i = 0; i < octaves; i++) {
      total += this.noise2D(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    
    return total / maxValue;
  }
}

// ============================================================================
// 区域系统 (Biome System)
// ============================================================================

export type BiomeType = 'NORTHERN_TUNDRA' | 'CENTRAL_PLAINS' | 'SOUTHERN_WETLANDS' | 'FAR_SOUTH_DESERT';

export interface BiomeConfig {
  name: string;
  yRange: [number, number];  // Y轴范围 (0-1)
  baseTemperature: number;   // 基础温度
  baseMoisture: number;      // 基础湿度
  terrainWeights: Record<string, number>;  // 地形权重
  cityDensity: number;       // 城市密度
  ruinChance: number;        // 遗迹概率
}

export const BIOME_CONFIGS: Record<BiomeType, BiomeConfig> = {
  NORTHERN_TUNDRA: {
    name: '北疆冻土',
    yRange: [0, 0.25],
    baseTemperature: 0.15,
    baseMoisture: 0.4,
    terrainWeights: {
      SNOW: 0.5,
      FOREST: 0.25,
      MOUNTAIN: 0.15,
      PLAINS: 0.1
    },
    cityDensity: 0.5,
    ruinChance: 0.02
  },
  CENTRAL_PLAINS: {
    name: '中原沃野',
    yRange: [0.25, 0.6],
    baseTemperature: 0.6,
    baseMoisture: 0.5,
    terrainWeights: {
      PLAINS: 0.55,
      FOREST: 0.25,
      MOUNTAIN: 0.1,
      SWAMP: 0.05,
      RUINS: 0.05
    },
    cityDensity: 1.5,
    ruinChance: 0.03
  },
  SOUTHERN_WETLANDS: {
    name: '江南水乡',
    yRange: [0.6, 0.8],
    baseTemperature: 0.7,
    baseMoisture: 0.75,
    terrainWeights: {
      SWAMP: 0.3,
      FOREST: 0.35,
      PLAINS: 0.2,
      RUINS: 0.1,
      MOUNTAIN: 0.05
    },
    cityDensity: 1.0,
    ruinChance: 0.06
  },
  FAR_SOUTH_DESERT: {
    name: '南疆荒漠',
    yRange: [0.8, 1.0],
    baseTemperature: 0.9,
    baseMoisture: 0.15,
    terrainWeights: {
      DESERT: 0.6,
      PLAINS: 0.15,
      MOUNTAIN: 0.15,
      RUINS: 0.1
    },
    cityDensity: 0.6,
    ruinChance: 0.05
  }
};

/**
 * 获取坐标所在的区域
 */
export const getBiome = (y: number, mapSize: number): BiomeType => {
  const normalizedY = y / mapSize;
  
  if (normalizedY < 0.25) return 'NORTHERN_TUNDRA';
  if (normalizedY < 0.6) return 'CENTRAL_PLAINS';
  if (normalizedY < 0.8) return 'SOUTHERN_WETLANDS';
  return 'FAR_SOUTH_DESERT';
};

// ============================================================================
// 地形决定逻辑
// ============================================================================

export type TerrainType = 'PLAINS' | 'FOREST' | 'MOUNTAIN' | 'SWAMP' | 'CITY' | 'RUINS' | 'SNOW' | 'DESERT' | 'ROAD';

interface TerrainParams {
  x: number;
  y: number;
  elevation: number;    // 高度 0-1
  moisture: number;     // 湿度 0-1
  temperature: number;  // 温度 0-1
  biome: BiomeType;
  detailNoise: number;  // 细节噪声
}

/**
 * 根据参数决定地形类型
 */
export const determineTerrain = (params: TerrainParams): TerrainType => {
  const { elevation, moisture, temperature, biome, detailNoise } = params;
  const config = BIOME_CONFIGS[biome];
  
  // 山地优先级最高 - 高海拔区域
  if (elevation > 0.72) {
    return 'MOUNTAIN';
  }
  
  // 次高海拔 - 丘陵地带可能是山地或森林
  if (elevation > 0.58) {
    if (detailNoise > 0.6) return 'MOUNTAIN';
    if (moisture > 0.5) return 'FOREST';
    return 'PLAINS';
  }
  
  // 根据区域特性决定地形
  switch (biome) {
    case 'NORTHERN_TUNDRA':
      // 北疆：雪原为主，有针叶林
      if (temperature < 0.25) {
        if (moisture > 0.5 && detailNoise > 0.4) return 'FOREST';  // 针叶林
        return 'SNOW';
      }
      if (moisture > 0.55) return 'FOREST';
      return detailNoise > 0.7 ? 'SNOW' : 'PLAINS';
      
    case 'CENTRAL_PLAINS':
      // 中原：平原和森林为主
      if (moisture > 0.65 && elevation < 0.35) return 'SWAMP';
      if (moisture > 0.5) return 'FOREST';
      if (detailNoise > 0.85) return 'RUINS';  // 偶尔有遗迹
      return 'PLAINS';
      
    case 'SOUTHERN_WETLANDS':
      // 江南：沼泽和密林为主
      if (moisture > 0.6 && elevation < 0.4) return 'SWAMP';
      if (moisture > 0.45) return 'FOREST';
      if (detailNoise > 0.8) return 'RUINS';  // 较多遗迹
      return 'PLAINS';
      
    case 'FAR_SOUTH_DESERT':
      // 南疆：沙漠为主
      if (moisture < 0.3) return 'DESERT';
      if (moisture < 0.45) {
        return detailNoise > 0.5 ? 'DESERT' : 'PLAINS';  // 绿洲
      }
      if (detailNoise > 0.75) return 'RUINS';  // 古代遗迹
      return 'PLAINS';  // 绿洲地带
  }
  
  return 'PLAINS';
};

// ============================================================================
// 山脉生成 - 创建连贯的山脉带
// ============================================================================

/**
 * 生成山脉脊线噪声
 * 产生从北到南蜿蜒的山脉
 */
export const generateMountainRidge = (
  x: number, 
  y: number, 
  ridgeNoise: PerlinNoise,
  mapSize: number
): number => {
  // 主山脉位置（地图中偏西）
  const mainRidgeX = mapSize * 0.35;
  
  // 山脉的弯曲程度
  const wiggle = ridgeNoise.fractalNoise(0, y / mapSize * 4, 3, 0.5, 2) * mapSize * 0.2;
  
  // 到山脉中心的距离
  const distToRidge = Math.abs(x - (mainRidgeX + wiggle));
  
  // 山脉宽度
  const ridgeWidth = mapSize * 0.08;
  
  // 返回山脉强度（0-1，1表示在山脊上）
  if (distToRidge < ridgeWidth) {
    return 1 - (distToRidge / ridgeWidth);
  }
  
  // 次级山脉（东部）
  const secondRidgeX = mapSize * 0.7;
  const wiggle2 = ridgeNoise.fractalNoise(100, y / mapSize * 3, 2, 0.5, 2) * mapSize * 0.15;
  const distToRidge2 = Math.abs(x - (secondRidgeX + wiggle2));
  const ridgeWidth2 = mapSize * 0.05;
  
  if (distToRidge2 < ridgeWidth2) {
    return (1 - (distToRidge2 / ridgeWidth2)) * 0.7;
  }
  
  return 0;
};

// ============================================================================
// 城市生成
// ============================================================================

/**
 * 辅助函数：生成角色名字
 */
const generateName = (): string => {
  const surname = SURNAMES[Math.floor(Math.random() * SURNAMES.length)];
  const nameLen = Math.random() > 0.7 ? 2 : 1;
  let givenName = "";
  for (let i = 0; i < nameLen; i++) {
    givenName += NAMES_MALE[Math.floor(Math.random() * NAMES_MALE.length)];
  }
  return surname + givenName;
};

/**
 * 辅助函数：创建雇佣兵
 */
const createMercenary = (id: string): Character => {
  const bgKeys = Object.keys(BACKGROUNDS);
  const bgKey = bgKeys[Math.floor(Math.random() * bgKeys.length)];
  const bg: BackgroundTemplate = BACKGROUNDS[bgKey];
  const name = generateName();
  const roll = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
  const rollMod = (range: [number, number]) => roll(range[0], range[1]);

  // 分配特质并计算属性修正
  const traits = assignTraits(bgKey);
  const traitMods = getTraitStatMods(traits);

  const baseHp = roll(50, 70) + rollMod(bg.hpMod) + traitMods.hpMod;
  const baseFat = roll(90, 110) + rollMod(bg.fatigueMod) + traitMods.fatigueMod;
  const baseRes = roll(30, 50) + rollMod(bg.resolveMod) + traitMods.resolveMod;
  const baseInit = roll(100, 110) + rollMod(bg.initMod) + traitMods.initMod;
  const baseMSkill = roll(47, 57) + rollMod(bg.meleeSkillMod) + traitMods.meleeSkillMod;
  const baseRSkill = roll(32, 42) + rollMod(bg.rangedSkillMod) + traitMods.rangedSkillMod;
  const baseMDef = roll(0, 5) + rollMod(bg.defMod) + traitMods.meleeDefMod;
  const baseRDef = roll(0, 5) + rollMod(bg.defMod) + traitMods.rangedDefMod;

  const genStars = () => {
    const r = Math.random() * 100;
    if (r > 95) return 3;
    if (r > 80) return 2;
    if (r > 50) return 1;
    return 0;
  };

  const stars = {
    meleeSkill: genStars(),
    rangedSkill: genStars(),
    meleeDefense: genStars(),
    rangedDefense: genStars(),
    resolve: genStars(),
    initiative: genStars(),
    hp: genStars(),
    fatigue: genStars(),
  };

  const weaponPool = WEAPON_TEMPLATES.filter(w => w.value < 400);
  const weapon = weaponPool[Math.floor(Math.random() * weaponPool.length)];
  const armor = Math.random() > 0.4 ? ARMOR_TEMPLATES[Math.floor(Math.random() * 2)] : null;

  return {
    id, name, background: bg.name, backgroundStory: bg.desc, level: 1, xp: 0,
    hp: baseHp, maxHp: baseHp, fatigue: 0, maxFatigue: baseFat,
    morale: 'STEADY' as any,
    stats: { meleeSkill: baseMSkill, rangedSkill: baseRSkill, meleeDefense: baseMDef, rangedDefense: baseRDef, resolve: baseRes, initiative: baseInit },
    stars,
    traits, perks: [], perkPoints: 0,
    equipment: { mainHand: weapon, offHand: null, armor, helmet: null, ammo: null, accessory: null },
    bag: [null, null, null, null], salary: Math.floor(10 * bg.salaryMult), formationIndex: null
  };
};

// ============================================================================
// 商店系统 - 按类别+城市规模分层生成装备（仿战场兄弟）
// ============================================================================

/** 品质等级及其在各城市规模下的出现权重 */
const RARITY_ORDER = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'] as const;

/** 各城市规模允许的最高品质及品质权重 */
const RARITY_WEIGHTS: Record<string, Record<string, number>> = {
  VILLAGE:  { COMMON: 50, UNCOMMON: 40, RARE: 10, EPIC: 0, LEGENDARY: 0 },
  TOWN:    { COMMON: 20, UNCOMMON: 35, RARE: 30, EPIC: 12, LEGENDARY: 3 },
  CAPITAL: { COMMON: 10, UNCOMMON: 20, RARE: 30, EPIC: 25, LEGENDARY: 15 },
};

/** 各城市规模的库存数量范围 [min, max] */
const MARKET_STOCK_CONFIG: Record<string, { weapons: [number, number]; armors: [number, number]; helmets: [number, number]; shields: [number, number]; food: [number, number]; med: [number, number]; repairChance: number }> = {
  VILLAGE:  { weapons: [2, 3], armors: [1, 2], helmets: [0, 1], shields: [0, 1], food: [2, 3], med: [1, 1], repairChance: 0.3 },
  TOWN:    { weapons: [3, 5], armors: [2, 3], helmets: [1, 2], shields: [1, 2], food: [2, 4], med: [1, 2], repairChance: 0.6 },
  CAPITAL: { weapons: [5, 7], armors: [3, 4], helmets: [2, 3], shields: [2, 3], food: [3, 5], med: [2, 3], repairChance: 0.9 },
};

/** 按权重随机选择一个品质等级 */
const rollRarity = (cityType: string): string => {
  const weights = RARITY_WEIGHTS[cityType] || RARITY_WEIGHTS.TOWN;
  const entries = RARITY_ORDER.map(r => ({ rarity: r, weight: weights[r] || 0 })).filter(e => e.weight > 0);
  const total = entries.reduce((s, e) => s + e.weight, 0);
  let roll = Math.random() * total;
  for (const e of entries) {
    roll -= e.weight;
    if (roll <= 0) return e.rarity;
  }
  return entries[entries.length - 1].rarity;
};

/** 在 [min, max] 范围内随机整数 */
const randRange = (min: number, max: number): number => min + Math.floor(Math.random() * (max - min + 1));

/** 从数组中按品质筛选后随机选一个，如果没有匹配则从全池随机 */
const pickByRarity = (pool: Item[], rarity: string): Item | null => {
  const matched = pool.filter(it => it.rarity === rarity);
  if (matched.length > 0) return { ...matched[Math.floor(Math.random() * matched.length)] };
  // 降级：找最接近的低品质
  const idx = RARITY_ORDER.indexOf(rarity as any);
  for (let i = idx - 1; i >= 0; i--) {
    const fallback = pool.filter(it => it.rarity === RARITY_ORDER[i]);
    if (fallback.length > 0) return { ...fallback[Math.floor(Math.random() * fallback.length)] };
  }
  return pool.length > 0 ? { ...pool[Math.floor(Math.random() * pool.length)] } : null;
};

/**
 * 生成城市商店库存（仿战场兄弟）
 * - 武器按 weaponClass 分配，保证类别多样性
 * - 城市规模影响品质上限和库存数量
 * - 排除 UNIQUE 品质
 */
export const generateCityMarket = (cityType: 'CAPITAL' | 'TOWN' | 'VILLAGE'): Item[] => {
  const config = MARKET_STOCK_CONFIG[cityType];
  const market: Item[] = [];

  // --- 武器：按 weaponClass 分类，每类最多抽 1 把，保证多样性 ---
  const nonUniqueWeapons = WEAPON_TEMPLATES.filter(w => w.rarity !== 'UNIQUE');
  const weaponClasses = [...new Set(nonUniqueWeapons.map(w => w.weaponClass).filter(Boolean))] as string[];
  const weaponCount = randRange(config.weapons[0], config.weapons[1]);
  // 打乱类别顺序，取前 N 个类别各出一把
  const shuffledClasses = [...weaponClasses].sort(() => 0.5 - Math.random());
  const classesToUse = shuffledClasses.slice(0, Math.min(weaponCount, shuffledClasses.length));
  
  for (const cls of classesToUse) {
    const classPool = nonUniqueWeapons.filter(w => w.weaponClass === cls);
    const rarity = rollRarity(cityType);
    const weapon = pickByRarity(classPool, rarity);
    if (weapon) market.push(weapon);
  }
  // 如果还需要更多武器（weaponCount > 类别数），再从全池随机补充
  while (market.filter(it => it.type === 'WEAPON').length < weaponCount) {
    const rarity = rollRarity(cityType);
    const weapon = pickByRarity(nonUniqueWeapons, rarity);
    if (weapon) market.push(weapon);
    else break;
  }

  // --- 护甲 ---
  const nonUniqueArmors = ARMOR_TEMPLATES.filter(a => a.rarity !== 'UNIQUE');
  const armorCount = randRange(config.armors[0], config.armors[1]);
  for (let i = 0; i < armorCount; i++) {
    const rarity = rollRarity(cityType);
    const armor = pickByRarity(nonUniqueArmors, rarity);
    if (armor) market.push(armor);
  }

  // --- 头盔 ---
  const nonUniqueHelmets = HELMET_TEMPLATES.filter(h => h.rarity !== 'UNIQUE');
  const helmetCount = randRange(config.helmets[0], config.helmets[1]);
  for (let i = 0; i < helmetCount; i++) {
    const rarity = rollRarity(cityType);
    const helmet = pickByRarity(nonUniqueHelmets, rarity);
    if (helmet) market.push(helmet);
  }

  // --- 盾牌 ---
  const nonUniqueShields = SHIELD_TEMPLATES.filter(s => s.rarity !== 'UNIQUE');
  const shieldCount = randRange(config.shields[0], config.shields[1]);
  for (let i = 0; i < shieldCount; i++) {
    const rarity = rollRarity(cityType);
    const shield = pickByRarity(nonUniqueShields, rarity);
    if (shield) market.push(shield);
  }

  // --- 消耗品 ---
  const foodItems = CONSUMABLE_TEMPLATES.filter(c => c.subType === 'FOOD');
  const medItems = CONSUMABLE_TEMPLATES.filter(c => c.subType === 'MEDICINE');
  const repairItems = CONSUMABLE_TEMPLATES.filter(c => c.subType === 'REPAIR_KIT');

  const foodCount = randRange(config.food[0], config.food[1]);
  market.push(...foodItems.sort(() => 0.5 - Math.random()).slice(0, foodCount));

  const medCount = randRange(config.med[0], config.med[1]);
  market.push(...medItems.sort(() => 0.5 - Math.random()).slice(0, medCount));

  if (Math.random() < config.repairChance) {
    market.push(repairItems[Math.floor(Math.random() * repairItems.length)]);
  }

  return market;
};

/**
 * 生成城市价格浮动系数 (0.8 ~ 1.2)
 */
export const rollPriceModifier = (): number => {
  return +(0.8 + Math.random() * 0.4).toFixed(2);
};

/**
 * 根据区域特点生成城市
 */
export const generateCities = (
  tiles: WorldTile[],
  mapSize: number,
  cityNames: string[]
): City[] => {
  const cities: City[] = [];
  const placedCities: { x: number; y: number; biome: BiomeType }[] = [];
  
  // 各区域城市数量配置
  const biomesCityCount: Record<BiomeType, number> = {
    NORTHERN_TUNDRA: 2,      // 北疆：2个城市
    CENTRAL_PLAINS: 5,       // 中原：5个城市（最多）
    SOUTHERN_WETLANDS: 3,    // 江南：3个城市
    FAR_SOUTH_DESERT: 2      // 南疆：2个绿洲城市
  };
  
  // 城市名称索引
  let nameIndex = 0;
  
  // 按区域生成城市
  const biomes: BiomeType[] = ['NORTHERN_TUNDRA', 'CENTRAL_PLAINS', 'SOUTHERN_WETLANDS', 'FAR_SOUTH_DESERT'];
  
  for (const biome of biomes) {
    const config = BIOME_CONFIGS[biome];
    const count = biomesCityCount[biome];
    const yMin = Math.floor(config.yRange[0] * mapSize);
    const yMax = Math.floor(config.yRange[1] * mapSize);
    
    for (let i = 0; i < count; i++) {
      let cx = 0, cy = 0, valid = false;
      let attempts = 0;
      
      while (!valid && attempts < 100) {
        cx = Math.floor(Math.random() * (mapSize - 10)) + 5;
        cy = yMin + Math.floor(Math.random() * (yMax - yMin - 4)) + 2;
        
        // 检查与其他城市的距离
        const tooClose = placedCities.some(pc => Math.hypot(pc.x - cx, pc.y - cy) < 14);
        
        // 检查地形是否适合建城（避开山地和沼泽）
        const idx = cy * mapSize + cx;
        const tile = tiles[idx];
        const badTerrain = tile && (tile.type === 'MOUNTAIN' || tile.type === 'SWAMP' || tile.type === 'SNOW');
        
        if (!tooClose && !badTerrain) {
          valid = true;
        }
        attempts++;
      }
      
      if (!valid) continue;
      
      // 设置城市地块
      const idx = cy * mapSize + cx;
      tiles[idx].type = 'CITY';
      placedCities.push({ x: cx, y: cy, biome });
      
      // 城市类型：第一个城市是王都，其他根据区域定
      let cityType: 'CAPITAL' | 'TOWN' | 'VILLAGE' = 'TOWN';
      if (nameIndex === 0) {
        cityType = 'CAPITAL';
      } else if (biome === 'NORTHERN_TUNDRA' || biome === 'FAR_SOUTH_DESERT') {
        cityType = 'VILLAGE';
      }

      // 使用新的分层市场生成系统
      const market = generateCityMarket(cityType);
      const recruits = Array.from({ length: 4 }).map((_, j) => createMercenary(`rec-${nameIndex}-${j}`));
      
      // 根据城市规模生成不同数量的任务（仿战场兄弟）
      const quests = generateCityQuests(biome, cityType, `city-${nameIndex}`, nameIndex);
      
      cities.push({
        id: `city-${nameIndex}`,
        name: cityNames[nameIndex % cityNames.length],
        x: cx, y: cy,
        type: cityType,
        faction: '秦',
        state: 'NORMAL',
        facilities: ['MARKET', 'RECRUIT', 'TAVERN', 'TEMPLE'],
        market,
        recruits,
        quests,
        lastMarketRefreshDay: 1,
        priceModifier: rollPriceModifier(),
      });
      
      nameIndex++;
    }
  }
  
  return cities;
};

// ============================================================================
// 任务生成系统 - 丰富描述 + 多任务 + 声望门槛
// ============================================================================

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/**
 * 根据城市规模确定任务数量
 */
const getQuestCount = (cityType: City['type']): number => {
  switch (cityType) {
    case 'VILLAGE': return 1 + (Math.random() < 0.5 ? 1 : 0); // 1-2
    case 'TOWN': return 2 + (Math.random() < 0.5 ? 1 : 0);    // 2-3
    case 'CAPITAL': return 3 + (Math.random() < 0.5 ? 1 : 0);  // 3-4
  }
};

/**
 * 为城市生成一组任务
 */
const generateCityQuests = (
  biome: BiomeType,
  cityType: City['type'],
  sourceCityId: string,
  nameIndex: number
): Quest[] => {
  const questCount = getQuestCount(cityType);
  const quests: Quest[] = [];
  const usedTargets = new Set<string>(); // 避免重复目标
  
  const biomeTemplates = QUEST_TEMPLATES[biome];
  const places = QUEST_PLACE_NAMES[biome];
  const npcPool = [...QUEST_NPC_NAMES.OFFICIALS, ...QUEST_NPC_NAMES.MERCHANTS, ...QUEST_NPC_NAMES.VILLAGERS];
  
  // 决定是否生成高声望任务（城镇和王都才有机会）
  const eliteSlot = cityType !== 'VILLAGE' && Math.random() < (cityType === 'CAPITAL' ? 0.8 : 0.4);
  
  for (let qi = 0; qi < questCount; qi++) {
    const isElite = eliteSlot && qi === questCount - 1; // 最后一个槽位留给高声望任务
    
    if (isElite) {
      // 生成高声望任务
      const eliteTemplates = ELITE_QUEST_TEMPLATES[biome];
      if (eliteTemplates && eliteTemplates.length > 0) {
        const tmpl = pick(eliteTemplates);
        const difficulty = tmpl.minDifficulty;
        const place = pick(places);
        const npc = pick([...QUEST_NPC_NAMES.MILITARY, ...QUEST_NPC_NAMES.OFFICIALS]);
        const target = tmpl.targets.length > 0 ? pick(tmpl.targets) : '';
        const descFn = pick(tmpl.descs);
        const desc = descFn(target, place, npc);
        const title = tmpl.titles(difficulty);
        
        const rewardGold = difficulty === 2 ? 600 + Math.floor(Math.random() * 300)
                         : 1000 + Math.floor(Math.random() * 500);
        
        quests.push({
          id: `q-${nameIndex}-${qi + 1}`,
          type: tmpl.type,
          title,
          description: desc,
          difficulty,
          rewardGold,
          sourceCityId,
          targetEntityName: target || undefined,
          isCompleted: false,
          daysLeft: 7 + difficulty * 3,
          requiredReputation: tmpl.requiredReputation,
        });
        continue;
      }
    }
    
    // 普通任务生成
    // 决定任务类型：前几个优先 HUNT（因为其他类型暂时只有描述没有完整玩法），但也有概率出其他类型
    const availableTypes: QuestType[] = ['HUNT'];
    if (biomeTemplates.PATROL) availableTypes.push('PATROL');
    if ((biomeTemplates as any).ESCORT) availableTypes.push('ESCORT');
    if ((biomeTemplates as any).DELIVERY) availableTypes.push('DELIVERY');
    
    // HUNT 权重更高（70%），其他类型平分剩余
    let questType: QuestType;
    if (qi === 0 || Math.random() < 0.7) {
      questType = 'HUNT';
    } else {
      questType = pick(availableTypes);
    }
    
    // 难度：村庄偏低，王都偏高
    const diffRoll = Math.random();
    let difficulty: 1 | 2 | 3;
    if (cityType === 'VILLAGE') {
      difficulty = diffRoll < 0.6 ? 1 : diffRoll < 0.9 ? 2 : 3;
    } else if (cityType === 'CAPITAL') {
      difficulty = diffRoll < 0.2 ? 1 : diffRoll < 0.6 ? 2 : 3;
    } else {
      difficulty = diffRoll < 0.4 ? 1 : diffRoll < 0.75 ? 2 : 3;
    }
    
    const place = pick(places);
    const npc = pick(npcPool);
    
    if (questType === 'HUNT') {
      const huntTemplates = biomeTemplates.HUNT;
      const tmpl = pick(huntTemplates);
      // 选一个未重复的目标
      let target = pick(tmpl.targets);
      let attempts = 0;
      while (usedTargets.has(target) && attempts < 10) {
        target = pick(tmpl.targets);
        attempts++;
      }
      usedTargets.add(target);
      
      const title = tmpl.titles(difficulty);
      const descFn = pick(tmpl.descs);
      const desc = descFn(target, place, npc);
      
      const rewardGold = difficulty === 1 ? 200 + Math.floor(Math.random() * 100)
                       : difficulty === 2 ? 400 + Math.floor(Math.random() * 200)
                       : 700 + Math.floor(Math.random() * 300);
      
      quests.push({
        id: `q-${nameIndex}-${qi + 1}`,
        type: 'HUNT',
        title,
        description: desc,
        difficulty,
        rewardGold,
        sourceCityId,
        targetEntityName: target,
        isCompleted: false,
        daysLeft: 7 + difficulty * 2,
      });
    } else if (questType === 'PATROL' && biomeTemplates.PATROL) {
      const patrolTemplates = biomeTemplates.PATROL;
      const tmpl = pick(patrolTemplates);
      const title = tmpl.titles(difficulty);
      const descFn = pick(tmpl.descs);
      const desc = descFn(place, npc);
      
      // PATROL 任务也需要目标敌人（巡逻时遇到的敌人）
      const huntTmpl = pick(biomeTemplates.HUNT);
      const target = pick(huntTmpl.targets);
      
      const rewardGold = difficulty === 1 ? 150 + Math.floor(Math.random() * 80)
                       : difficulty === 2 ? 300 + Math.floor(Math.random() * 150)
                       : 550 + Math.floor(Math.random() * 250);
      
      quests.push({
        id: `q-${nameIndex}-${qi + 1}`,
        type: 'PATROL',
        title,
        description: desc,
        difficulty,
        rewardGold,
        sourceCityId,
        targetEntityName: target,
        isCompleted: false,
        daysLeft: 5 + difficulty * 2,
      });
    } else if (questType === 'ESCORT' && (biomeTemplates as any).ESCORT) {
      const escortTemplates = (biomeTemplates as any).ESCORT;
      const tmpl = pick(escortTemplates);
      const title = tmpl.titles(difficulty);
      const descFn = pick(tmpl.descs);
      const desc = descFn(place, npc);
      
      // ESCORT 同样可能遭遇敌人
      const huntTmpl = pick(biomeTemplates.HUNT);
      const target = pick(huntTmpl.targets);
      
      const rewardGold = difficulty === 1 ? 250 + Math.floor(Math.random() * 100)
                       : difficulty === 2 ? 500 + Math.floor(Math.random() * 200)
                       : 800 + Math.floor(Math.random() * 300);
      
      quests.push({
        id: `q-${nameIndex}-${qi + 1}`,
        type: 'ESCORT',
        title,
        description: desc,
        difficulty,
        rewardGold,
        sourceCityId,
        targetEntityName: target,
        isCompleted: false,
        daysLeft: 8 + difficulty * 2,
      });
    } else if (questType === 'DELIVERY' && (biomeTemplates as any).DELIVERY) {
      const deliveryTemplates = (biomeTemplates as any).DELIVERY;
      const tmpl = pick(deliveryTemplates);
      const title = tmpl.titles(difficulty);
      const descFn = pick(tmpl.descs);
      const desc = descFn(place, npc);
      
      // DELIVERY 路上可能遇到截杀
      const huntTmpl = pick(biomeTemplates.HUNT);
      const target = pick(huntTmpl.targets);
      
      const rewardGold = difficulty === 1 ? 180 + Math.floor(Math.random() * 80)
                       : difficulty === 2 ? 350 + Math.floor(Math.random() * 150)
                       : 600 + Math.floor(Math.random() * 250);
      
      quests.push({
        id: `q-${nameIndex}-${qi + 1}`,
        type: 'DELIVERY',
        title,
        description: desc,
        difficulty,
        rewardGold,
        sourceCityId,
        targetEntityName: target,
        isCompleted: false,
        daysLeft: 6 + difficulty * 2,
      });
    } else {
      // 回退到 HUNT
      const huntTemplates = biomeTemplates.HUNT;
      const tmpl = pick(huntTemplates);
      const target = pick(tmpl.targets);
      const title = tmpl.titles(difficulty);
      const descFn = pick(tmpl.descs);
      const desc = descFn(target, place, npc);
      
      const rewardGold = difficulty === 1 ? 200 + Math.floor(Math.random() * 100)
                       : difficulty === 2 ? 400 + Math.floor(Math.random() * 200)
                       : 700 + Math.floor(Math.random() * 300);
      
      quests.push({
        id: `q-${nameIndex}-${qi + 1}`,
        type: 'HUNT',
        title,
        description: desc,
        difficulty,
        rewardGold,
        sourceCityId,
        targetEntityName: target,
        isCompleted: false,
        daysLeft: 7 + difficulty * 2,
      });
    }
  }
  
  return quests;
};

// ============================================================================
// 道路生成 - A* 寻路避开山地
// ============================================================================

interface PathNode {
  x: number;
  y: number;
  g: number;  // 从起点到此点的实际代价
  h: number;  // 启发式估计代价
  f: number;  // 总代价 f = g + h
  parent: PathNode | null;
}

/**
 * 获取地形的移动代价
 */
const getTerrainCost = (type: string): number => {
  switch (type) {
    case 'MOUNTAIN': return 100;  // 几乎不可通行
    case 'SWAMP': return 8;       // 很难通行
    case 'FOREST': return 4;      // 较难通行
    case 'SNOW': return 3;        // 稍微困难
    case 'DESERT': return 3;      // 稍微困难
    case 'PLAINS': return 2;      // 正常
    case 'ROAD': return 1;        // 最容易
    case 'CITY': return 1;        // 最容易
    default: return 2;
  }
};

/**
 * A* 寻路算法 - 找到两城市间的最优道路
 */
export const findPath = (
  startX: number, startY: number,
  endX: number, endY: number,
  tiles: WorldTile[],
  mapSize: number
): { x: number; y: number }[] => {
  const openSet: PathNode[] = [];
  const closedSet = new Set<string>();
  
  const heuristic = (x: number, y: number) => Math.abs(x - endX) + Math.abs(y - endY);
  
  const startNode: PathNode = {
    x: startX, y: startY,
    g: 0,
    h: heuristic(startX, startY),
    f: heuristic(startX, startY),
    parent: null
  };
  
  openSet.push(startNode);
  
  const directions = [
    { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
    { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
    { dx: -1, dy: -1 }, { dx: 1, dy: -1 },
    { dx: -1, dy: 1 }, { dx: 1, dy: 1 }
  ];
  
  while (openSet.length > 0) {
    // 找到f值最小的节点
    openSet.sort((a, b) => a.f - b.f);
    const current = openSet.shift()!;
    
    // 到达终点
    if (current.x === endX && current.y === endY) {
      const path: { x: number; y: number }[] = [];
      let node: PathNode | null = current;
      while (node) {
        path.unshift({ x: node.x, y: node.y });
        node = node.parent;
      }
      return path;
    }
    
    closedSet.add(`${current.x},${current.y}`);
    
    // 检查相邻节点
    for (const dir of directions) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;
      
      if (nx < 0 || nx >= mapSize || ny < 0 || ny >= mapSize) continue;
      if (closedSet.has(`${nx},${ny}`)) continue;
      
      const tile = tiles[ny * mapSize + nx];
      const cost = getTerrainCost(tile.type);
      
      // 跳过不可通行地形
      if (cost > 50) continue;
      
      const g = current.g + cost * (dir.dx !== 0 && dir.dy !== 0 ? 1.414 : 1);
      const h = heuristic(nx, ny);
      const f = g + h;
      
      // 检查是否已在openSet中
      const existing = openSet.find(n => n.x === nx && n.y === ny);
      if (existing) {
        if (g < existing.g) {
          existing.g = g;
          existing.f = f;
          existing.parent = current;
        }
      } else {
        openSet.push({ x: nx, y: ny, g, h, f, parent: current });
      }
    }
    
    // 防止无限循环
    if (closedSet.size > mapSize * mapSize / 2) break;
  }
  
  // 没找到路径，返回直线
  const path: { x: number; y: number }[] = [];
  let cx = startX, cy = startY;
  while (cx !== endX || cy !== endY) {
    if (cx < endX) cx++;
    else if (cx > endX) cx--;
    else if (cy < endY) cy++;
    else if (cy > endY) cy--;
    path.push({ x: cx, y: cy });
  }
  return path;
};

/**
 * 生成城市间的道路网络
 */
export const generateRoads = (
  tiles: WorldTile[],
  cities: City[],
  mapSize: number
): void => {
  if (cities.length < 2) return;
  
  // 使用最小生成树算法连接所有城市
  const connected = new Set<string>([cities[0].id]);
  const edges: { from: City; to: City; dist: number }[] = [];
  
  // 计算所有城市对之间的距离
  for (let i = 0; i < cities.length; i++) {
    for (let j = i + 1; j < cities.length; j++) {
      const dist = Math.hypot(cities[i].x - cities[j].x, cities[i].y - cities[j].y);
      edges.push({ from: cities[i], to: cities[j], dist });
    }
  }
  
  // 按距离排序
  edges.sort((a, b) => a.dist - b.dist);
  
  // Prim算法构建最小生成树
  while (connected.size < cities.length) {
    for (const edge of edges) {
      const fromConnected = connected.has(edge.from.id);
      const toConnected = connected.has(edge.to.id);
      
      if (fromConnected !== toConnected) {
        // 找到路径并铺设道路
        const path = findPath(edge.from.x, edge.from.y, edge.to.x, edge.to.y, tiles, mapSize);
        
        for (const point of path) {
          const idx = point.y * mapSize + point.x;
          if (tiles[idx].type !== 'CITY') {
            tiles[idx].type = 'ROAD';
          }
        }
        
        connected.add(edge.from.id);
        connected.add(edge.to.id);
        break;
      }
    }
  }
  
  // 添加一些额外的道路连接（环路），让地图更有趣
  const extraConnections = Math.floor(cities.length / 3);
  let added = 0;
  for (const edge of edges) {
    if (added >= extraConnections) break;
    if (edge.dist < mapSize * 0.4 && Math.random() > 0.5) {
      const path = findPath(edge.from.x, edge.from.y, edge.to.x, edge.to.y, tiles, mapSize);
      for (const point of path) {
        const idx = point.y * mapSize + point.x;
        if (tiles[idx].type !== 'CITY' && tiles[idx].type !== 'ROAD') {
          tiles[idx].type = 'ROAD';
        }
      }
      added++;
    }
  }
};

// ============================================================================
// 主地图生成函数
// ============================================================================

export interface MapGenerationResult {
  tiles: WorldTile[];
  cities: City[];
  seed: number;
}

/**
 * 生成完整的世界地图
 */
export const generateWorldMap = (
  mapSize: number = MAP_SIZE,
  cityNames: string[] = CITY_NAMES,
  customSeed?: number
): MapGenerationResult => {
  const seed = customSeed ?? Math.floor(Math.random() * 100000);
  
  // 初始化噪声生成器
  const elevationNoise = new PerlinNoise(seed);
  const moistureNoise = new PerlinNoise(seed + 1000);
  const detailNoise = new PerlinNoise(seed + 2000);
  const ridgeNoise = new PerlinNoise(seed + 3000);
  
  // 噪声缩放参数
  const elevationScale = 0.08;
  const moistureScale = 0.06;
  const detailScale = 0.15;
  
  // 生成地形
  const tiles: WorldTile[] = [];
  
  for (let y = 0; y < mapSize; y++) {
    for (let x = 0; x < mapSize; x++) {
      // 计算各种噪声值
      let elevation = elevationNoise.fractalNoise(x * elevationScale, y * elevationScale, 4, 0.5, 2);
      const moisture = moistureNoise.fractalNoise(x * moistureScale, y * moistureScale, 3, 0.6, 2);
      const detail = detailNoise.fractalNoise(x * detailScale, y * detailScale, 2, 0.5, 2);
      
      // 山脉增强
      const ridgeStrength = generateMountainRidge(x, y, ridgeNoise, mapSize);
      elevation = Math.min(1, elevation + ridgeStrength * 0.4);
      
      // 获取区域和温度
      const biome = getBiome(y, mapSize);
      const normalizedY = y / mapSize;
      
      // 温度：北冷南热，但加入一些随机变化
      let temperature = 1 - normalizedY;
      temperature = temperature * 0.8 + detail * 0.2;
      
      // 调整湿度：南方水乡湿度更高
      let adjustedMoisture = moisture;
      if (biome === 'SOUTHERN_WETLANDS') {
        adjustedMoisture = Math.min(1, moisture + 0.2);
      } else if (biome === 'FAR_SOUTH_DESERT') {
        adjustedMoisture = Math.max(0, moisture - 0.3);
      }
      
      // 决定地形类型
      const terrainType = determineTerrain({
        x, y,
        elevation,
        moisture: adjustedMoisture,
        temperature,
        biome,
        detailNoise: detail
      });
      
      tiles.push({
        x, y,
        type: terrainType,
        height: Math.floor(elevation * 3),
        explored: false
      });
    }
  }
  
  // 生成城市
  const cities = generateCities(tiles, mapSize, cityNames);
  
  // 生成道路网络
  generateRoads(tiles, cities, mapSize);
  
  return { tiles, cities, seed };
};
