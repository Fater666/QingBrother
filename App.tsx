
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GameView, Party, WorldTile, CombatState, MoraleStatus, Character, CombatUnit, WorldEntity, City, CityFacility, Quest, WorldAIType, OriginConfig, BattleResult, Item, AIType, AmbitionState, EnemyCamp, CampRegion } from './types.ts';
import { MAP_SIZE, WEAPON_TEMPLATES, ARMOR_TEMPLATES, SHIELD_TEMPLATES, HELMET_TEMPLATES, TERRAIN_DATA, CITY_NAMES, SURNAMES, NAMES_MALE, BACKGROUNDS, BackgroundTemplate, QUEST_FLAVOR_TEXTS, VISION_RADIUS, CONSUMABLE_TEMPLATES, assignTraits, getTraitStatMods, TRAIT_TEMPLATES, UNIQUE_WEAPON_TEMPLATES, UNIQUE_ARMOR_TEMPLATES, UNIQUE_HELMET_TEMPLATES, UNIQUE_SHIELD_TEMPLATES, getDifficultyTier, TIERED_ENEMY_COMPOSITIONS, GOLD_REWARDS, CAMP_TEMPLATES_DATA, BOSS_CAMP_CONFIGS, checkLevelUp } from './constants';
import { applyStudentXPBonus, applyColossus, applyFortifiedMind, applyBrawny } from './services/perkService';
import { WorldMap } from './components/WorldMap.tsx';
import { CombatView } from './components/CombatView.tsx';
import { SquadManagement } from './components/SquadManagement.tsx';
import { CityView } from './components/CityView.tsx';
import { MainMenu } from './components/MainMenu.tsx';
import { Prologue } from './components/Prologue.tsx';
import { OriginSelect, ORIGIN_CONFIGS } from './components/OriginSelect.tsx';
import { BattleResultView } from './components/BattleResultView.tsx';
import { SaveLoadPanel, getSaveSlotKey, getAllSaveMetas, saveMetas, hasAnySaveData, SaveSlotMeta } from './components/SaveLoadPanel.tsx';
import { updateWorldEntityAI, generateRoadPatrolPoints, generateCityPatrolPoints } from './services/worldMapAI.ts';
import { generateWorldMap, getBiome, BIOME_CONFIGS, generateCityMarket, rollPriceModifier, generateCityQuests } from './services/mapGenerator.ts';
import { AmbitionSelect } from './components/AmbitionSelect.tsx';
import { ContactModal } from './components/ContactModal.tsx';
import { ConfirmDialog } from './components/ConfirmDialog.tsx';
import { DEFAULT_AMBITION_STATE, selectAmbition, selectNoAmbition, completeAmbition, cancelAmbition, checkAmbitionComplete, shouldShowAmbitionSelect, getAmbitionProgress, getAmbitionTypeInfo } from './services/ambitionService.ts';
import { GameTip } from './components/GameTip.tsx';
import { GameTipData, GAME_TIPS, markTipShown } from './services/tipService.ts';

// --- Character Generation ---
const generateName = (): string => {
    const surname = SURNAMES[Math.floor(Math.random() * SURNAMES.length)];
    const nameLen = Math.random() > 0.7 ? 2 : 1;
    let givenName = "";
    for(let i=0; i<nameLen; i++) {
        givenName += NAMES_MALE[Math.floor(Math.random() * NAMES_MALE.length)];
    }
    return surname + givenName;
};

const createMercenary = (id: string, fixedName?: string, forcedBgKey?: string, formationIndex: number | null = null): Character => {
  const bgKeys = Object.keys(BACKGROUNDS);
  let bgKey = forcedBgKey;
  if (!bgKey || !BACKGROUNDS[bgKey]) {
      bgKey = bgKeys[Math.floor(Math.random() * bgKeys.length)];
  }
  
  const bg: BackgroundTemplate = BACKGROUNDS[bgKey];
  const name = fixedName || generateName();
  const roll = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
  const rollMod = (range: [number, number]) => roll(range[0], range[1]);

  // 分配特质并计算属性修正
  const traits = assignTraits(bgKey!);
  const traitMods = getTraitStatMods(traits);

  const baseHp = roll(50, 70) + rollMod(bg.hpMod) + traitMods.hpMod;
  const baseFat = roll(90, 110) + rollMod(bg.fatigueMod) + traitMods.fatigueMod;
  const baseRes = roll(30, 50) + rollMod(bg.resolveMod) + traitMods.resolveMod;
  const baseInit = roll(100, 110) + rollMod(bg.initMod) + traitMods.initMod;
  const baseMSkill = roll(47, 57) + rollMod(bg.meleeSkillMod) + traitMods.meleeSkillMod;
  const baseRSkill = roll(32, 42) + rollMod(bg.rangedSkillMod) + traitMods.rangedSkillMod;
  const baseMDef = roll(0, 5) + rollMod(bg.defMod) + traitMods.meleeDefMod;
  const baseRDef = roll(0, 5) + rollMod(bg.defMod) + traitMods.rangedDefMod;

  const genStars = (mod: [number, number]) => {
      const r = Math.random() * 100;
      if (r > 95) return 3;
      if (r > 80) return 2;
      if (r > 50) return 1;
      return 0;
  };

  const stars = {
      meleeSkill: genStars(bg.meleeSkillMod),
      rangedSkill: genStars(bg.rangedSkillMod),
      meleeDefense: genStars(bg.defMod),
      rangedDefense: genStars(bg.defMod),
      resolve: genStars(bg.resolveMod),
      initiative: genStars(bg.initMod),
      hp: genStars(bg.hpMod),
      fatigue: genStars(bg.fatigueMod),
  };

  let weaponPool = WEAPON_TEMPLATES.filter(w => w.value < 400);
  const weapon = weaponPool[Math.floor(Math.random() * weaponPool.length)];
  const armor = Math.random() > 0.4 ? ARMOR_TEMPLATES[Math.floor(Math.random() * 2)] : null;
  const helmet = Math.random() > 0.6 ? HELMET_TEMPLATES[Math.floor(Math.random() * 2)] : null;

  // 计算薪资和雇佣费用
  const salary = Math.floor(10 * bg.salaryMult);
  const hireCostBase = salary * 25;
  const randomFactor = 0.8 + Math.random() * 0.4;
  let hireCost = Math.floor(hireCostBase * randomFactor);

  const traitPriceMod = traits.reduce((mod, t) => {
    const tmpl = TRAIT_TEMPLATES[t];
    if (!tmpl) return mod;
    return mod + (tmpl.type === 'positive' ? 0.15 : -0.10);
  }, 1.0);
  hireCost = Math.floor(hireCost * traitPriceMod);
  hireCost = Math.max(10, hireCost);

  return {
    id, name, background: bg.name, backgroundStory: bg.desc, level: 1, xp: 0, hp: baseHp, maxHp: baseHp, fatigue: 0,
    maxFatigue: baseFat, morale: MoraleStatus.STEADY,
    stats: { meleeSkill: baseMSkill, rangedSkill: baseRSkill, meleeDefense: baseMDef, rangedDefense: baseRDef, resolve: baseRes, initiative: baseInit },
    stars,
    traits, perks: [], perkPoints: 0,
    equipment: { mainHand: weapon, offHand: null, armor, helmet, ammo: null, accessory: null },
    bag: [null, null, null, null], salary, hireCost, formationIndex
  };
};

const generateMap = (): { tiles: WorldTile[], cities: City[] } => {
  // 使用新的柏林噪声地图生成器
  const result = generateWorldMap(MAP_SIZE, CITY_NAMES);
  console.log(`[地图生成] 种子: ${result.seed}, 城市数: ${result.cities.length}`);
  return { tiles: result.tiles, cities: result.cities };
};

// ==================== 巢穴系统（仿战场兄弟） ====================

// 巢穴配置表：从 CSV 数据加载
interface CampTemplate {
  region: CampRegion;
  entityType: WorldAIType;
  entitySubType: WorldEntity['type'];
  faction: WorldEntity['faction'];
  maxAlive: number;
  spawnCooldown: number; // 游戏天数
  namePool: string[];
  // 实体属性模板
  speed: [number, number];       // [min, max]
  alertRadius: [number, number];
  chaseRadius: [number, number];
  strength?: [number, number];
  fleeThreshold?: [number, number];
  territoryRadius?: [number, number];
  aiState: WorldEntity['aiState'];
  preferredTerrain: string[];    // 巢穴偏好地形
  yRange: [number, number];     // Y轴范围比例 (0-1)
}

const CAMP_TEMPLATES: CampTemplate[] = CAMP_TEMPLATES_DATA as CampTemplate[];

/**
 * 在指定区域找一个合适的巢穴位置
 */
const findCampPosition = (
  tiles: WorldTile[],
  yRange: [number, number],
  preferredTerrain: string[],
  maxAttempts: number = 30
): { x: number; y: number } => {
  const yMin = Math.floor(yRange[0] * MAP_SIZE);
  const yMax = Math.floor(yRange[1] * MAP_SIZE);
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const tx = Math.floor(Math.random() * MAP_SIZE);
    const ty = yMin + Math.floor(Math.random() * Math.max(1, yMax - yMin));
    if (ty < 0 || ty >= MAP_SIZE || tx < 0 || tx >= MAP_SIZE) continue;
    const tile = tiles[ty * MAP_SIZE + tx];
    if (tile && preferredTerrain.includes(tile.type)) {
      return { x: tx, y: ty };
    }
  }
  // 回退：随机位置
  return {
    x: Math.floor(Math.random() * MAP_SIZE),
    y: Math.floor(yRange[0] * MAP_SIZE + Math.random() * ((yRange[1] - yRange[0]) * MAP_SIZE))
  };
};

/**
 * 辅助：在范围内生成随机数
 */
const rollRange = (range: [number, number]): number => range[0] + Math.random() * (range[1] - range[0]);
const rollRangeInt = (range: [number, number]): number => range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1));

/**
 * 从巢穴产出一个实体
 */
const spawnEntityFromCamp = (
  camp: EnemyCamp,
  template: CampTemplate,
  entityIndex: number,
  tiles: WorldTile[]
): WorldEntity => {
  // 在巢穴附近找一个位置
  const angle = Math.random() * Math.PI * 2;
  const dist = 1 + Math.random() * 4;
  const ex = Math.max(0, Math.min(MAP_SIZE - 1, camp.x + Math.cos(angle) * dist));
  const ey = Math.max(0, Math.min(MAP_SIZE - 1, camp.y + Math.sin(angle) * dist));
  
  const name = template.namePool[Math.floor(Math.random() * template.namePool.length)];
  
  const entity: WorldEntity = {
    id: `${camp.id}-ent-${entityIndex}-${Date.now().toString(36)}`,
    name,
    type: template.entitySubType,
    faction: template.faction,
    x: ex, y: ey,
    targetX: null, targetY: null,
    speed: rollRange(template.speed),
    aiState: template.aiState,
    homeX: camp.x, homeY: camp.y,
    worldAIType: template.entityType,
    alertRadius: rollRange(template.alertRadius),
    chaseRadius: rollRange(template.chaseRadius),
    campId: camp.id,
    wanderCooldown: Math.random() * 5,
  };
  
  if (template.strength) entity.strength = rollRangeInt(template.strength);
  if (template.fleeThreshold) entity.fleeThreshold = rollRange(template.fleeThreshold);
  if (template.territoryRadius) entity.territoryRadius = rollRange(template.territoryRadius);
  
  // 土匪类型生成巡逻点
  if (template.entityType === 'BANDIT' && template.aiState === 'PATROL') {
    entity.patrolPoints = generateRoadPatrolPoints(camp.x, camp.y, tiles, 3, 12);
    entity.patrolIndex = 0;
  }
  
  return entity;
};

/**
 * 从Boss巢穴产出一个Boss实体（只产出一个守卫，带Boss标记）
 */
const spawnBossEntity = (camp: EnemyCamp): WorldEntity => {
  const angle = Math.random() * Math.PI * 2;
  const dist = 1 + Math.random() * 2;
  const ex = Math.max(0, Math.min(MAP_SIZE - 1, camp.x + Math.cos(angle) * dist));
  const ey = Math.max(0, Math.min(MAP_SIZE - 1, camp.y + Math.sin(angle) * dist));
  
  return {
    id: `${camp.id}-boss-${Date.now().toString(36)}`,
    name: camp.bossName || 'Boss守卫',
    type: 'BANDIT',
    faction: 'HOSTILE',
    x: ex, y: ey,
    targetX: null, targetY: null,
    speed: 0,
    aiState: 'IDLE',
    homeX: camp.x, homeY: camp.y,
    worldAIType: 'BOSS_CAMP',
    alertRadius: 5,
    chaseRadius: 5,
    campId: camp.id,
    wanderCooldown: Math.random() * 5,
    territoryRadius: 3,
    strength: 8,
    isBossEntity: true,
  };
};

/**
 * 生成所有巢穴（含Boss巢穴）
 */
const generateCamps = (tiles: WorldTile[]): EnemyCamp[] => {
  const camps: EnemyCamp[] = [];
  
  // 普通巢穴
  CAMP_TEMPLATES.forEach((template, idx) => {
    const pos = findCampPosition(tiles, template.yRange, template.preferredTerrain);
    
    camps.push({
      id: `camp-${template.region.toLowerCase()}-${idx}`,
      x: pos.x,
      y: pos.y,
      region: template.region,
      entityType: template.entityType,
      maxAlive: template.maxAlive,
      currentAlive: 0,  // 稍后在 spawnInitial 中更新
      spawnCooldown: template.spawnCooldown,
      lastSpawnDay: 0,
      namePool: template.namePool,
      destroyed: false,
    });
  });
  
  // Boss巢穴
  BOSS_CAMP_CONFIGS.forEach((bossConfig: any) => {
    const pos = findCampPosition(tiles, bossConfig.yRange, bossConfig.preferredTerrain);
    
    camps.push({
      id: bossConfig.id,
      x: pos.x,
      y: pos.y,
      region: bossConfig.region as CampRegion,
      entityType: 'BANDIT' as WorldAIType,  // Boss巢穴默认用BANDIT类型
      maxAlive: 1,       // Boss巢穴只产出1个实体
      currentAlive: 0,
      spawnCooldown: 999, // Boss不重生
      lastSpawnDay: 0,
      namePool: [bossConfig.name],
      destroyed: false,
      // Boss专属字段
      isBoss: true,
      bossName: bossConfig.name,
      uniqueLootIds: bossConfig.uniqueLootIds,
      bossCompositionKey: bossConfig.bossCompositionKey,
      cleared: false,
    });
  });
  
  return camps;
};

/**
 * 从巢穴初始产出实体 + 生成军队和商队
 */
const generateEntities = (cities: City[], tiles: WorldTile[], camps: EnemyCamp[]): WorldEntity[] => {
    const ents: WorldEntity[] = [];
    let entityCounter = 0;
    
    // 从每个巢穴产出初始实体
    camps.forEach((camp, campIdx) => {
      // Boss巢穴：产出一个Boss实体
      if (camp.isBoss) {
        const bossEnt = spawnBossEntity(camp);
        ents.push(bossEnt);
        camp.currentAlive = 1;
        return;
      }
      
      // 普通巢穴：产出2个
      const template = CAMP_TEMPLATES[campIdx];
      if (!template) return;
      
      const initialCount = Math.min(2, camp.maxAlive);
      for (let i = 0; i < initialCount; i++) {
        const ent = spawnEntityFromCamp(camp, template, entityCounter++, tiles);
        ents.push(ent);
        camp.currentAlive++;
      }
    });
    
    // 巡防军 - 在城市附近（非巢穴系统）
    for(let i = 0; i < Math.min(4, cities.length); i++) {
        const nearCity = cities[i];
        const offsetX = (Math.random() - 0.5) * 10;
        const offsetY = (Math.random() - 0.5) * 10;
        const x = Math.max(1, Math.min(MAP_SIZE - 2, nearCity.x + offsetX));
        const y = Math.max(1, Math.min(MAP_SIZE - 2, nearCity.y + offsetY));
        
        const armyPatrolPoints = generateCityPatrolPoints(nearCity.x, nearCity.y, 6, 4);
        
        ents.push({ 
            id: `army-${i}`, 
            name: '巡防军', 
            type: 'ARMY', 
            faction: 'NEUTRAL',
            x, y, 
            targetX: null, 
            targetY: null, 
            speed: 0.6 + Math.random() * 0.2, 
            aiState: 'PATROL', 
            homeX: nearCity.x, 
            homeY: nearCity.y,
            worldAIType: 'ARMY',
            alertRadius: 6,
            chaseRadius: 12,
            linkedCityId: nearCity.id,
            strength: 5 + Math.floor(Math.random() * 3),
            patrolPoints: armyPatrolPoints,
            patrolIndex: 0
        });
    }
    
    // 商队 - 在城市间往返（非巢穴系统）
    cities.forEach((city, idx) => {
        if (cities.length < 2) return;
        const targetCity = cities[(idx + 1) % cities.length];
        ents.push({
            id: `trader-${idx}`, 
            name: '商队', 
            type: 'TRADER', 
            faction: 'NEUTRAL', 
            x: city.x, 
            y: city.y, 
            targetX: targetCity.x, 
            targetY: targetCity.y, 
            speed: 0.5, 
            aiState: 'TRAVEL', 
            homeX: city.x, 
            homeY: city.y,
            worldAIType: 'TRADER',
            alertRadius: 5,
            chaseRadius: 8,
            linkedCityId: city.id,
            destinationCityId: targetCity.id,
            wanderCooldown: 5 + Math.random() * 5
        });
    });
    
    return ents;
};

// --- 战斗结果生成 ---
const generateBattleResult = (
  victory: boolean,
  survivors: CombatUnit[],
  enemyUnits: CombatUnit[],
  rounds: number,
  enemyName: string,
  playerUnitsBeforeCombat: Character[],
  bossLootIds: string[] = []  // Boss巢穴掉落池（红装ID列表）
): BattleResult => {
  const enemiesKilled = enemyUnits.filter(u => u.isDead).length;
  const enemiesRouted = enemyUnits.filter(u => !u.isDead && u.morale === MoraleStatus.FLEEING).length;

  // 阵亡己方
  const deadPlayerIds = new Set(
    playerUnitsBeforeCombat
      .filter(m => m.formationIndex !== null)
      .filter(m => !survivors.find(s => s.id === m.id))
      .map(m => m.id)
  );

  const casualties = playerUnitsBeforeCombat
    .filter(m => deadPlayerIds.has(m.id))
    .map(m => ({
      name: m.name,
      background: BACKGROUNDS[m.background]?.name || m.background,
    }));

  // XP 计算: 基础25 + 击杀 * 15 + 回合 * 2
  const xpPerSurvivor = victory ? 25 + enemiesKilled * 15 + rounds * 2 : 0;

  const survivorData = survivors.map(s => {
    const beforeMerc = playerUnitsBeforeCombat.find(m => m.id === s.id);
    return {
      id: s.id,
      name: s.name,
      background: BACKGROUNDS[s.background]?.name || s.background,
      hpBefore: beforeMerc?.hp ?? s.maxHp,
      hpAfter: s.hp,
      maxHp: s.maxHp,
      xpGained: xpPerSurvivor,
    };
  });

  // --- 战利品生成 ---
  const lootItems: Item[] = [];
  
  if (victory) {
    enemyUnits.forEach(enemy => {
      if (!enemy.isDead) return; // 溃逃敌人不掉落

      const equipment = [enemy.equipment.mainHand, enemy.equipment.armor, enemy.equipment.helmet, enemy.equipment.offHand];
      
      equipment.forEach(item => {
        if (!item) return;
        // 天然武器（野兽爪牙等）不掉落
        if (item.value <= 0) return;
        // 40% 掉落几率
        if (Math.random() > 0.4) return;
        
        // 战损：耐久减损 20%-50%
        const damageFraction = 0.5 + Math.random() * 0.3; // 剩余 50%-80%
        const newDurability = Math.max(1, Math.floor(item.durability * damageFraction));
        
        lootItems.push({
          ...item,
          id: `loot-${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          durability: newDurability,
        });
      });
    });

    // 保底机制：如果没有掉落任何装备，从死亡敌人中强制掉落一件
    if (lootItems.length === 0) {
      const deadEnemies = enemyUnits.filter(u => u.isDead);
      for (const enemy of deadEnemies) {
        const droppable = [enemy.equipment.mainHand, enemy.equipment.armor, enemy.equipment.helmet, enemy.equipment.offHand]
          .filter((item): item is Item => item !== null && item !== undefined && item.value > 0);
        if (droppable.length > 0) {
          const item = droppable[Math.floor(Math.random() * droppable.length)];
          const damageFraction = 0.5 + Math.random() * 0.3;
          const newDurability = Math.max(1, Math.floor(item.durability * damageFraction));
          lootItems.push({
            ...item,
            id: `loot-${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            durability: newDurability,
          });
          break; // 只保底掉落一件
        }
      }
    }

    // 15% 概率额外掉落消耗品（消耗品不再进入lootItems，直接在战斗结算时加到资源池）
    // 注：消耗品掉落在 App 的 onCombatEnd 回调中处理，直接加到 party.medicine/repairSupplies/food

    // --- 传世红装特殊掉落（仅Boss巢穴） ---
    // 击败Boss巢穴守卫后，100%从绑定掉落池中获得一件全耐久红装
    if (bossLootIds.length > 0) {
      const allUniqueItems: Item[] = [
        ...UNIQUE_WEAPON_TEMPLATES,
        ...UNIQUE_ARMOR_TEMPLATES,
        ...UNIQUE_HELMET_TEMPLATES,
        ...UNIQUE_SHIELD_TEMPLATES,
      ];
      // 从掉落池中随机选一个ID
      const chosenId = bossLootIds[Math.floor(Math.random() * bossLootIds.length)];
      const uniqueItem = allUniqueItems.find(item => item.id === chosenId);
      if (uniqueItem) {
        lootItems.push({
          ...uniqueItem,
          id: `loot-unique-${uniqueItem.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          durability: uniqueItem.maxDurability, // 全耐久
        });
      }
    }
  }

  // --- 金钱奖励（从 CSV 配置读取） ---
  let goldReward = 0;
  if (victory) {
    enemyUnits.forEach(enemy => {
      const aiType = enemy.aiType || 'BANDIT';
      const reward = GOLD_REWARDS[aiType] || GOLD_REWARDS['BANDIT'] || { goldMin: 20, goldMax: 50 };
      goldReward += reward.goldMin + Math.floor(Math.random() * (reward.goldMax - reward.goldMin));
    });
  }

  return {
    victory,
    roundsTotal: rounds,
    enemyName,
    casualties,
    survivors: survivorData,
    enemiesKilled,
    enemiesRouted,
    lootItems,
    goldReward,
  };
};

// --- 难度曲线与装备系统（仿战场兄弟） ---

/** 根据AI类型、价值上限和难度阶段为敌人分配合适装备（排除传世红装）
 *  tier 参数控制护甲/头盔价值上限和穿戴概率，使敌人强度随天数增长 */
const getEquipmentForAIType = (aiType: AIType, valueLimit: number, tier: number = 0): {
  mainHand: Item | null; offHand: Item | null; armor: Item | null; helmet: Item | null;
} => {
  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const uid = () => Math.random().toString(36).slice(2, 6);
  const cloneItem = (item: Item) => ({ ...item, id: `e-${item.id}-${uid()}` });
  // 排除 UNIQUE 品质物品（红装只通过特殊掉落获得）
  const noUnique = (items: Item[]) => items.filter(i => i.rarity !== 'UNIQUE');

  // --- 动态护甲/头盔价值上限（随 tier 增长，替代原有硬编码上限） ---
  // 每个tier的基准值：初期廉价装备 → 末期可穿重甲
  const TIER_ARMOR_BASE = [180, 420, 900, 1800];
  const TIER_HELMET_BASE = [120, 260, 600, 1200];
  const tierIdx = Math.min(tier, TIER_ARMOR_BASE.length - 1);

  // AI类型系数：不同定位穿不同档次的护甲
  const ARMOR_COEFF: Record<string, number> = {
    BANDIT: 1.0, ARCHER: 0.4, BERSERKER: 0.35, SKIRMISHER: 0.3, ARMY: 1.0, TANK: 1.2,
  };
  const HELMET_COEFF: Record<string, number> = {
    BANDIT: 0.7, ARCHER: 0.35, BERSERKER: 0.3, SKIRMISHER: 0.25, ARMY: 1.0, TANK: 1.0,
  };

  const armorCap = Math.min(valueLimit, Math.floor(TIER_ARMOR_BASE[tierIdx] * (ARMOR_COEFF[aiType] || 1.0)));
  const helmetCap = Math.min(valueLimit, Math.floor(TIER_HELMET_BASE[tierIdx] * (HELMET_COEFF[aiType] || 1.0)));

  // --- 穿戴概率（随 tier 提升，后期敌人更多穿甲） ---
  const clampProb = (p: number) => Math.max(0, Math.min(0.95, p));

  // [基础概率, 每tier增量]
  const ARMOR_PROB: Record<string, [number, number]> = {
    BANDIT: [0.45, 0.12],     // tier0=45% → tier3=81%
    ARCHER: [0.25, 0.10],     // tier0=25% → tier3=55%
    BERSERKER: [0.20, 0.10],  // tier0=20% → tier3=50%
    SKIRMISHER: [0.12, 0.08], // tier0=12% → tier3=36%
    ARMY: [0.60, 0.10],       // tier0=60% → tier3=90%
    TANK: [0.75, 0.08],       // tier0=75% → tier3=99%
  };
  const HELMET_PROB: Record<string, [number, number]> = {
    BANDIT: [0.25, 0.12],     // tier0=25% → tier3=61%
    ARCHER: [0.12, 0.10],     // tier0=12% → tier3=42%
    BERSERKER: [0.10, 0.10],  // tier0=10% → tier3=40%
    SKIRMISHER: [0.05, 0.08], // tier0=5%  → tier3=29%
    ARMY: [0.40, 0.12],       // tier0=40% → tier3=76%
    TANK: [0.70, 0.10],       // tier0=70% → tier3=95%
  };
  const SHIELD_PROB: Record<string, [number, number]> = {
    BANDIT: [0.30, 0.10],     // tier0=30% → tier3=60%
    ARMY: [0.60, 0.12],       // tier0=60% → tier3=96%
    TANK: [1.0, 0],           // 盾卫始终持盾
  };

  const armorProb = clampProb((ARMOR_PROB[aiType]?.[0] ?? 0.5) + tier * (ARMOR_PROB[aiType]?.[1] ?? 0.1));
  const helmetProb = clampProb((HELMET_PROB[aiType]?.[0] ?? 0.3) + tier * (HELMET_PROB[aiType]?.[1] ?? 0.1));
  const shieldProb = clampProb((SHIELD_PROB[aiType]?.[0] ?? 0) + tier * (SHIELD_PROB[aiType]?.[1] ?? 0));

  switch (aiType) {
    case 'ARCHER': {
      // 弓手必须拿远程武器
      const rangedWeapons = noUnique(WEAPON_TEMPLATES).filter(w =>
        (w.name.includes('弓') || w.name.includes('弩') || w.weaponClass === 'bow' || w.weaponClass === 'crossbow') && w.value <= valueLimit
      );
      const weapon = rangedWeapons.length > 0 ? pick(rangedWeapons) : WEAPON_TEMPLATES.find(w => w.id === 'w_bow_3') || WEAPON_TEMPLATES.find(w => w.name.includes('弓'))!;
      const lightArmors = noUnique(ARMOR_TEMPLATES).filter(a => a.value <= armorCap);
      const lightHelmets = noUnique(HELMET_TEMPLATES).filter(h => h.value <= helmetCap);
      return {
        mainHand: cloneItem(weapon),
        offHand: null,
        armor: lightArmors.length > 0 && Math.random() < armorProb ? cloneItem(pick(lightArmors)) : null,
        helmet: lightHelmets.length > 0 && Math.random() < helmetProb ? cloneItem(pick(lightHelmets)) : null,
      };
    }
    case 'BANDIT': {
      // 匪徒拿各类近战武器，可能有盾
      const weapons = noUnique(WEAPON_TEMPLATES).filter(w =>
        !w.name.includes('弓') && !w.name.includes('弩') &&
        !w.name.includes('飞石') && !w.name.includes('飞蝗') && !w.name.includes('标枪') && !w.name.includes('投矛') && !w.name.includes('飞斧') &&
        !(w.name.includes('爪') || w.name.includes('牙') || w.name.includes('獠')) &&
        w.value <= valueLimit && w.value > 0
      );
      const weapon = weapons.length > 0 ? pick(weapons) : WEAPON_TEMPLATES.find(w => w.id === 'w_sword_1')!;
      const shields = noUnique(SHIELD_TEMPLATES).filter(s => s.value <= valueLimit);
      const armors = noUnique(ARMOR_TEMPLATES).filter(a => a.value <= armorCap);
      const helmets = noUnique(HELMET_TEMPLATES).filter(h => h.value <= helmetCap);
      return {
        mainHand: cloneItem(weapon),
        offHand: shields.length > 0 && Math.random() < shieldProb ? cloneItem(pick(shields)) : null,
        armor: armors.length > 0 && Math.random() < armorProb ? cloneItem(pick(armors)) : null,
        helmet: helmets.length > 0 && Math.random() < helmetProb ? cloneItem(pick(helmets)) : null,
      };
    }
    case 'ARMY': {
      // 军队拿制式军事武器 + 高概率盾牌 + 中重甲
      const armyKeywords = ['矛', '枪', '剑', '戈', '戟', '殳', '刀'];
      const weapons = noUnique(WEAPON_TEMPLATES).filter(w =>
        armyKeywords.some(k => w.name.includes(k)) &&
        !w.name.includes('飞') && !w.name.includes('投') && !w.name.includes('标枪') && !w.name.includes('匕') && !w.name.includes('厨') &&
        !(w.name.includes('爪') || w.name.includes('牙') || w.name.includes('獠')) &&
        w.value <= valueLimit && w.value > 0
      );
      const weapon = weapons.length > 0 ? pick(weapons) : WEAPON_TEMPLATES.find(w => w.id === 'w_spear_2')!;
      const shields = noUnique(SHIELD_TEMPLATES).filter(s => s.value <= valueLimit);
      const minArmyArmorValue = tier <= 0 ? 0 : 80;
      const armors = noUnique(ARMOR_TEMPLATES).filter(a => a.value <= armorCap && a.value >= minArmyArmorValue);
      const helmets = noUnique(HELMET_TEMPLATES).filter(h => h.value <= helmetCap);
      return {
        mainHand: cloneItem(weapon),
        offHand: shields.length > 0 && Math.random() < shieldProb ? cloneItem(pick(shields)) : null,
        armor: armors.length > 0 && Math.random() < armorProb ? cloneItem(pick(armors)) : null,
        helmet: helmets.length > 0 && Math.random() < helmetProb ? cloneItem(pick(helmets)) : null,
      };
    }
    case 'BERSERKER': {
      // 狂战士拿重型双手武器，轻甲或无甲，无盾
      const heavyKeywords = ['斧', '锤', '殳', '棒', '鞭', '锏', '铁链', '刀'];
      const weapons = noUnique(WEAPON_TEMPLATES).filter(w =>
        heavyKeywords.some(k => w.name.includes(k)) &&
        !w.name.includes('飞') && !w.name.includes('投') && !w.name.includes('匕') && !w.name.includes('厨') &&
        !(w.name.includes('爪') || w.name.includes('牙') || w.name.includes('獠')) &&
        w.value <= valueLimit && w.value >= 80
      );
      const weapon = weapons.length > 0 ? pick(weapons) : WEAPON_TEMPLATES.find(w => w.id === 'w_axe_1')!;
      const lightArmors = noUnique(ARMOR_TEMPLATES).filter(a => a.value <= armorCap);
      const lightHelmets = noUnique(HELMET_TEMPLATES).filter(h => h.value <= helmetCap);
      return {
        mainHand: cloneItem(weapon),
        offHand: null,
        armor: lightArmors.length > 0 && Math.random() < armorProb ? cloneItem(pick(lightArmors)) : null,
        helmet: lightHelmets.length > 0 && Math.random() < helmetProb ? cloneItem(pick(lightHelmets)) : null,
      };
    }
    case 'TANK': {
      // 盾卫：必须有盾牌，拿单手矛/剑，中重甲+头盔
      const tankKeywords = ['矛', '枪', '剑', '刀'];
      const weapons = noUnique(WEAPON_TEMPLATES).filter(w =>
        tankKeywords.some(k => w.name.includes(k)) &&
        !w.twoHanded && // 盾卫必须单手武器
        !w.name.includes('飞') && !w.name.includes('投') && !w.name.includes('标枪') && !w.name.includes('匕') && !w.name.includes('厨') &&
        !(w.name.includes('爪') || w.name.includes('牙') || w.name.includes('獠')) &&
        w.value <= valueLimit && w.value > 0
      );
      const weapon = weapons.length > 0 ? pick(weapons) : WEAPON_TEMPLATES.find(w => w.id === 'w_spear_2')!;
      const shields = noUnique(SHIELD_TEMPLATES).filter(s => s.value <= valueLimit);
      const shield = shields.length > 0 ? pick(shields) : SHIELD_TEMPLATES[0];
      const minTankArmorValue = tier <= 0 ? 0 : 80;
      const armors = noUnique(ARMOR_TEMPLATES).filter(a => a.value <= armorCap && a.value >= minTankArmorValue);
      const helmets = noUnique(HELMET_TEMPLATES).filter(h => h.value <= helmetCap);
      return {
        mainHand: cloneItem(weapon),
        offHand: shield ? cloneItem(shield) : null, // 盾卫必有盾
        armor: armors.length > 0 && Math.random() < armorProb ? cloneItem(pick(armors)) : null,
        helmet: helmets.length > 0 && Math.random() < helmetProb ? cloneItem(pick(helmets)) : null,
      };
    }
    case 'SKIRMISHER': {
      // 游击手：优先投掷武器，轻甲或无甲，无盾
      const throwWeapons = noUnique(WEAPON_TEMPLATES).filter(w =>
        (w.name.includes('飞石') || w.name.includes('飞蝗') || w.name.includes('标枪') || w.name.includes('投矛') || w.name.includes('飞斧')) &&
        w.value <= valueLimit
      );
      // 如果找不到投掷武器，退而使用匕首/短剑等轻武器
      const lightMelee = noUnique(WEAPON_TEMPLATES).filter(w =>
        (w.name.includes('匕') || w.name.includes('短剑') || w.name.includes('厨刀') || w.name.includes('环首刀')) &&
        w.value <= valueLimit && w.value > 0
      );
      const weapon = throwWeapons.length > 0 ? pick(throwWeapons) : (lightMelee.length > 0 ? pick(lightMelee) : WEAPON_TEMPLATES.find(w => w.id === 'w_throw_1')!);
      const lightArmors = noUnique(ARMOR_TEMPLATES).filter(a => a.value <= armorCap);
      const lightHelmets = noUnique(HELMET_TEMPLATES).filter(h => h.value <= helmetCap);
      return {
        mainHand: cloneItem(weapon),
        offHand: null,
        armor: lightArmors.length > 0 && Math.random() < armorProb ? cloneItem(pick(lightArmors)) : null,
        helmet: lightHelmets.length > 0 && Math.random() < helmetProb ? cloneItem(pick(lightHelmets)) : null,
      };
    }
    default: // BEAST 由单独逻辑处理
      return { mainHand: null, offHand: null, armor: null, helmet: null };
  }
};

/** 多阶段敌人编制表（从 CSV 加载） */
interface EnemyComp { name: string; bg: string; aiType: AIType }

export const App: React.FC = () => {
  const [view, setView] = useState<GameView>('MAIN_MENU');
  const [gameInitialized, setGameInitialized] = useState(false);
  
  // 游戏状态 - 延迟到"新战役"或"读档"时初始化
  const [tiles, setTiles] = useState<WorldTile[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [entities, setEntities] = useState<WorldEntity[]>([]);
  const [camps, setCamps] = useState<EnemyCamp[]>([]);
  const [timeScale, setTimeScale] = useState<number>(0); 
  const [preCombatEntity, setPreCombatEntity] = useState<WorldEntity | null>(null);
  const [battleResult, setBattleResult] = useState<BattleResult | null>(null);
  const combatEnemyNameRef = useRef<string>('');
  const combatEntityIdRef = useRef<string>(''); // 记录战斗实体ID，用于判断是否击杀了任务目标
  const combatBossLootIdsRef = useRef<string[]>([]); // Boss战斗掉落池（红装ID列表）
  const combatBossCampIdRef = useRef<string>(''); // Boss巢穴ID（用于胜利后标记cleared）

  const [party, setParty] = useState<Party>({
    x: 0, y: 0, targetX: null, targetY: null, gold: 0, food: 0,
    medicine: 0, repairSupplies: 0,
    mercenaries: [], inventory: [], day: 1.0, activeQuest: null,
    reputation: 0, ambitionState: { ...DEFAULT_AMBITION_STATE }, moraleModifier: 0,
    shownTips: []
  });

  const [combatState, setCombatState] = useState<CombatState | null>(null);
  const [currentCity, setCurrentCity] = useState<City | null>(null);
  const lastUpdateRef = useRef<number>(performance.now());
  const [hasSave, setHasSave] = useState<boolean>(hasAnySaveData());
  const [saveLoadMode, setSaveLoadMode] = useState<'SAVE' | 'LOAD' | null>(null);
  const [showContact, setShowContact] = useState(false);
  const [showSystemMenu, setShowSystemMenu] = useState(false);
  const [showReturnMainMenuConfirm, setShowReturnMainMenuConfirm] = useState(false);
  const systemMenuRef = useRef<HTMLDivElement | null>(null);

  // 每日消耗/恢复追踪
  const lastProcessedDayRef = useRef<number>(1);

  // 野心目标系统状态
  const [showAmbitionPopup, setShowAmbitionPopup] = useState(false);
  const [ambitionNotification, setAmbitionNotification] = useState<string | null>(null);
  const ambitionNotifTimerRef = useRef<number | null>(null);

  // 玩法提示系统状态
  const [activeTip, setActiveTip] = useState<GameTipData | null>(null);
  const tipQueueRef = useRef<GameTipData[]>([]);

  // 叙事流程状态
  const [selectedOrigin, setSelectedOrigin] = useState<OriginConfig | null>(null);
  const [leaderName, setLeaderName] = useState<string>('');
  const [introStoryLines, setIntroStoryLines] = useState<string[]>([]);
  const [introLineIndex, setIntroLineIndex] = useState(0);
  const [introCharIndex, setIntroCharIndex] = useState(0);
  const [introDisplayed, setIntroDisplayed] = useState<string[]>([]);
  const [introComplete, setIntroComplete] = useState(false);
  const [introFade, setIntroFade] = useState<'in' | 'visible' | 'out'>('in');
  const introTimerRef = useRef<number | null>(null);
  const [isIntroCompactLandscape, setIsIntroCompactLandscape] = useState(false);
  const [introCompactFontScale, setIntroCompactFontScale] = useState(1);

  // 预生成地图数据 (在起源选择阶段就准备好)
  const pendingMapRef = useRef<{ tiles: WorldTile[], cities: City[] } | null>(null);

  // --- 音频管理 (BGM播放与切换) ---
  const bgmRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // 初始化音频对象
    if (!bgmRef.current) {
      bgmRef.current = new Audio();
      bgmRef.current.loop = true;
      bgmRef.current.volume = 0.3;
    }

    const audio = bgmRef.current;
    
    // 战斗中使用特定的战斗音乐，其他界面使用主音乐
    const isCombat = view === 'COMBAT';
    const targetSrc = isCombat ? '/audio/combat_bgm.mp3' : '/audio/main_bgm.mp3';
    
    // 检查 src 是否变化
    const currentSrc = audio.src.split('/').pop();
    const newSrc = targetSrc.split('/').pop();

    if (currentSrc !== newSrc) {
      audio.src = targetSrc;
      audio.load();
      
      const playBgm = () => {
        audio.play().catch(() => {
          // 浏览器自动播放拦截处理：监听用户点击后播放
          const retryPlay = () => {
            audio.play().catch(() => {});
            window.removeEventListener('click', retryPlay);
          };
          window.addEventListener('click', retryPlay);
        });
      };
      playBgm();
    }
  }, [view]);

  // --- 从装备ID池中随机选取一件装备 ---
  const resolveItemFromPool = (ids: string[] | undefined, templates: Item[]): Item | null => {
    if (!ids || ids.length === 0) return null;
    const chosenId = ids[Math.floor(Math.random() * ids.length)];
    const found = templates.find(t => t.id === chosenId);
    return found ? { ...found } : null;
  };

  // --- 新战役：根据起源生成初始队伍 ---
  const initGameWithOrigin = useCallback((origin: OriginConfig, name: string, mapData: { tiles: WorldTile[], cities: City[] }) => {
    setTiles(mapData.tiles);
    setCities(mapData.cities);
    const newCamps = generateCamps(mapData.tiles);
    setCamps(newCamps);
    setEntities(generateEntities(mapData.cities, mapData.tiles, newCamps));

    const mercs = origin.mercenaries.map((m, i) => {
      const merc = createMercenary(`${i + 1}`, i === 0 ? name : m.name, m.bg, m.formationIndex);
      // 如果起源配置了固定装备池，覆盖随机装备
      if (m.equipment) {
        const eq = m.equipment;
        merc.equipment.mainHand = resolveItemFromPool(eq.mainHand, WEAPON_TEMPLATES);
        merc.equipment.offHand = resolveItemFromPool(eq.offHand, SHIELD_TEMPLATES);
        merc.equipment.armor = resolveItemFromPool(eq.armor, ARMOR_TEMPLATES);
        merc.equipment.helmet = resolveItemFromPool(eq.helmet, HELMET_TEMPLATES);
      }
      return merc;
    });

    // 初始补给：2个金创药 + 1个修甲工具
    const startingInventory: Item[] = [
      { ...CONSUMABLE_TEMPLATES.find(c => c.id === 'c_med1')!, id: 'start_med_1' },
      { ...CONSUMABLE_TEMPLATES.find(c => c.id === 'c_med1')!, id: 'start_med_2' },
      { ...CONSUMABLE_TEMPLATES.find(c => c.id === 'c_rep1')!, id: 'start_rep_1' },
    ];

    setParty({
      x: mapData.cities[0].x, y: mapData.cities[0].y,
      targetX: null, targetY: null,
      gold: origin.gold, food: origin.food,
      medicine: 40,          // 2个金创药 × 20 = 40
      repairSupplies: 50,    // 1个修甲工具 × 50 = 50
      mercenaries: mercs,
      inventory: [], day: 1.0, activeQuest: null,
      reputation: 0, ambitionState: { ...DEFAULT_AMBITION_STATE }, moraleModifier: 0,
      shownTips: []
    });
    lastProcessedDayRef.current = 1; // 新游戏从第1天开始
    setGameInitialized(true);
    setTimeScale(0);
  }, []);

  // --- 玩法提示系统 ---
  const triggerTip = useCallback((tipId: string) => {
    setParty(prev => {
      if (prev.shownTips.includes(tipId)) return prev;
      const tipData = GAME_TIPS[tipId];
      if (!tipData) return prev;
      // 标记已显示
      const newShownTips = markTipShown(prev.shownTips, tipId);
      // 延迟设置activeTip，避免在setParty回调中嵌套setState
      setTimeout(() => {
        setActiveTip(current => {
          if (current) {
            tipQueueRef.current.push(tipData);
            return current;
          }
          return tipData;
        });
      }, 0);
      return { ...prev, shownTips: newShownTips };
    });
  }, []);

  const handleTipDismiss = useCallback(() => {
    const next = tipQueueRef.current.shift();
    setActiveTip(next || null);
  }, []);

  // --- SAVE & LOAD SYSTEM (多栏位) ---
  const saveGame = useCallback((slotIndex: number) => {
    const saveData = {
        tiles,
        cities,
        entities,
        camps,
        party,
        day: party.day,
        view: view === 'COMBAT' ? 'WORLD_MAP' : view // 不保存战斗状态，退回地图
    };
    try {
        localStorage.setItem(getSaveSlotKey(slotIndex), JSON.stringify(saveData));
        // 更新元数据
        const metas = getAllSaveMetas();
        metas[slotIndex] = {
          slotIndex,
          timestamp: Date.now(),
          day: party.day,
          gold: party.gold,
          mercCount: party.mercenaries.length,
          leaderName: party.mercenaries[0]?.name || '无名',
          view: saveData.view as string,
        };
        saveMetas(metas);
        setHasSave(true);
    } catch (e) {
        alert("简牍告罄，无法刻录（存档失败）。");
    }
  }, [tiles, cities, entities, camps, party, view]);

  const loadGame = useCallback((slotIndex: number) => {
    const raw = localStorage.getItem(getSaveSlotKey(slotIndex));
    if (!raw) {
        return;
    }
    try {
        const data = JSON.parse(raw);
        setTiles(data.tiles);

        // 旧存档兼容：为城市市场补充消耗品/盾牌/头盔 + 商店刷新字段
        const loadedCities: City[] = (data.cities || []).map((city: City) => {
            let updated = { ...city };
            // 补充缺失的商店刷新字段
            if (updated.lastMarketRefreshDay == null) updated.lastMarketRefreshDay = 1;
            if (updated.priceModifier == null) updated.priceModifier = rollPriceModifier();
            // 补充缺失的任务刷新字段和区域信息
            if (updated.lastQuestRefreshDay == null) updated.lastQuestRefreshDay = 1;
            if (!updated.biome) updated.biome = getBiome(updated.y, MAP_SIZE);

            const hasConsumables = updated.market.some((item: Item) => item.type === 'CONSUMABLE' && item.subType);
            const hasHelmets = updated.market.some((item: Item) => item.type === 'HELMET');
            const hasShields = updated.market.some((item: Item) => item.type === 'SHIELD');
            if (!hasConsumables || !hasHelmets || !hasShields) {
                const foodItems = CONSUMABLE_TEMPLATES.filter(c => c.subType === 'FOOD');
                const medItems = CONSUMABLE_TEMPLATES.filter(c => c.subType === 'MEDICINE');
                const repairItems = CONSUMABLE_TEMPLATES.filter(c => c.subType === 'REPAIR_KIT');
                const newItems: Item[] = [
                    ...(!hasHelmets ? HELMET_TEMPLATES.sort(() => 0.5 - Math.random()).slice(0, 2) : []),
                    ...(!hasShields ? SHIELD_TEMPLATES.sort(() => 0.5 - Math.random()).slice(0, 2) : []),
                    ...(!hasConsumables ? [
                        ...foodItems.sort(() => 0.5 - Math.random()).slice(0, 2 + Math.floor(Math.random() * 3)),
                        ...medItems.sort(() => 0.5 - Math.random()).slice(0, 1 + Math.floor(Math.random() * 2)),
                        ...(Math.random() > 0.4 ? [repairItems[Math.floor(Math.random() * repairItems.length)]] : []),
                    ] : []),
                ];
                updated = { ...updated, market: [...updated.market, ...newItems] };
            }
            return updated;
        });
        setCities(loadedCities);

        setEntities(data.entities);
        // 旧存档兼容：巢穴系统
        setCamps(data.camps || []);
        // 旧存档兼容：补充缺失的野心/声望字段 + 医药/修甲资源池迁移
        const oldInventory: Item[] = data.party.inventory || [];
        // 如果旧存档没有 medicine/repairSupplies 字段，从库存中的消耗品转换
        let migratedMedicine = data.party.medicine ?? 0;
        let migratedRepair = data.party.repairSupplies ?? 0;
        let migratedInventory = oldInventory;
        if (data.party.medicine == null || data.party.repairSupplies == null) {
          // 将库存中的 MEDICINE/REPAIR_KIT 物品转换为资源池数值
          const medItems = oldInventory.filter((it: Item) => it.type === 'CONSUMABLE' && it.subType === 'MEDICINE');
          const repItems = oldInventory.filter((it: Item) => it.type === 'CONSUMABLE' && it.subType === 'REPAIR_KIT');
          migratedMedicine = medItems.reduce((sum: number, it: Item) => sum + (it.effectValue || 20), 0);
          migratedRepair = repItems.reduce((sum: number, it: Item) => sum + (it.effectValue || 50), 0);
          // 从库存中移除这些消耗品
          migratedInventory = oldInventory.filter((it: Item) => !(it.type === 'CONSUMABLE' && (it.subType === 'MEDICINE' || it.subType === 'REPAIR_KIT')));
        }
        const loadedParty: Party = {
          ...data.party,
          medicine: migratedMedicine,
          repairSupplies: migratedRepair,
          inventory: migratedInventory,
          reputation: data.party.reputation ?? 0,
          ambitionState: data.party.ambitionState ?? { ...DEFAULT_AMBITION_STATE },
          moraleModifier: data.party.moraleModifier ?? 0,
          shownTips: data.party.shownTips ?? [],
        };
        setParty(loadedParty);
        // 同步每日消耗追踪，避免读档瞬间触发大量天数消耗
        lastProcessedDayRef.current = Math.floor(loadedParty.day);
        setGameInitialized(true);
        setView(data.view || 'WORLD_MAP');
        setTimeScale(0);
    } catch (e) {
        alert("简牍残破，无法辨识（读档失败）。");
    }
  }, []);

  // 兼容旧存档：迁移到新的多栏位系统
  useEffect(() => {
    const oldSave = localStorage.getItem('zhanguo_with_five_save');
    if (oldSave && !hasAnySaveData()) {
      try {
        localStorage.setItem(getSaveSlotKey(0), oldSave);
        const data = JSON.parse(oldSave);
        const metas = getAllSaveMetas();
        metas[0] = {
          slotIndex: 0,
          timestamp: Date.now(),
          day: data.party?.day || 1,
          gold: data.party?.gold || 0,
          mercCount: data.party?.mercenaries?.length || 0,
          leaderName: data.party?.mercenaries?.[0]?.name || '无名',
          view: data.view || 'WORLD_MAP',
        };
        saveMetas(metas);
        localStorage.removeItem('zhanguo_with_five_save');
        setHasSave(true);
      } catch { /* 忽略迁移失败 */ }
    }
  }, []);

  // 战争迷雾更新
  useEffect(() => {
      if (!gameInitialized) return;
      const px = Math.floor(party.x), py = Math.floor(party.y);
      setTiles(prev => {
          let hasChange = false;
          const newTiles = [...prev];
          for (let y = py - VISION_RADIUS; y <= py + VISION_RADIUS; y++) {
              for (let x = px - VISION_RADIUS; x <= px + VISION_RADIUS; x++) {
                  if (x >= 0 && x < MAP_SIZE && y >= 0 && y < MAP_SIZE) {
                      const idx = y * MAP_SIZE + x;
                      if (!newTiles[idx].explored && Math.hypot(x-px, y-py) <= VISION_RADIUS) {
                          newTiles[idx] = { ...newTiles[idx], explored: true };
                          hasChange = true;
                      }
                  }
              }
          }
          return hasChange ? newTiles : prev;
      });
  }, [party.x, party.y, gameInitialized]);

  const startCombat = useCallback((entity: WorldEntity) => {
    setTimeScale(0);
    
    // --- 难度曲线：根据天数决定敌人强度 ---
    const day = party.day;
    const { tier, valueLimit, statMult } = getDifficultyTier(day);
    
    // Boss实体检测：如果是Boss实体，使用Boss专属编制和掉落
    const isBoss = !!entity.isBossEntity;
    let bossCamp: EnemyCamp | undefined;
    if (isBoss && entity.campId) {
      bossCamp = camps.find(c => c.id === entity.campId && c.isBoss);
    }
    
    // 设置Boss掉落池
    combatBossLootIdsRef.current = bossCamp?.uniqueLootIds || [];
    combatBossCampIdRef.current = bossCamp?.id || '';
    
    // 获取当前实体类型对应的阶段编制
    let compositions: { name: string; bg: string; aiType: AIType }[];
    if (isBoss && bossCamp?.bossCompositionKey) {
      // Boss使用专属编制（始终使用tier 0，因为boss compositions只有一个tier）
      const bossComps = TIERED_ENEMY_COMPOSITIONS[bossCamp.bossCompositionKey];
      compositions = bossComps ? bossComps[0] : (TIERED_ENEMY_COMPOSITIONS['BANDIT']?.[3] || TIERED_ENEMY_COMPOSITIONS['BANDIT']?.[0] || []);
    } else {
      const tierComps = TIERED_ENEMY_COMPOSITIONS[entity.type] || TIERED_ENEMY_COMPOSITIONS['BANDIT'];
      compositions = tierComps[Math.min(tier, tierComps.length - 1)];
    }
    
    const ENEMY_STAT_NERF = 0.9;
    const enemies: CombatUnit[] = compositions.map((comp, i) => {
      const baseChar = createMercenary(`e${i}`, comp.name, comp.bg);
      
      // BEAST类型敌人及猛虎/野猪：使用天然武器，不穿装备
      const isBeastCreature = comp.aiType === 'BEAST' || comp.name === '猛虎' || comp.name === '野猪';
      if (isBeastCreature) {
        const beastStatMult = statMult * ENEMY_STAT_NERF;
        // 根据不同野兽类型设置不同天然武器
        let weaponName = '利爪';
        let weaponDesc = '野兽锋利的爪子。';
        let dmgMin = 20, dmgMax = 35;
        let armorPen = 0.15, armorDmg = 0.5;
        let fatCost = 8, hitMod = 10;
        
        if (comp.name === '猛虎') {
          weaponName = '虎爪';
          weaponDesc = '猛虎锋利的巨爪，一击可致命。';
          dmgMin = 40; dmgMax = 65;
          armorPen = 0.35; armorDmg = 0.8;
          fatCost = 10; hitMod = 12;
          // 猛虎额外加成HP和攻击
          baseChar.maxHp = Math.floor(baseChar.maxHp * 1.35);
          baseChar.hp = baseChar.maxHp;
          baseChar.stats.meleeSkill = Math.floor(baseChar.stats.meleeSkill * 1.2);
        } else if (comp.name === '野猪') {
          weaponName = '獠牙';
          weaponDesc = '野猪尖锐的獠牙，冲撞力十足。';
          dmgMin = 25; dmgMax = 40;
          armorPen = 0.2; armorDmg = 0.6;
          fatCost = 8; hitMod = 8;
          // 野猪额外HP加成（坦克型）
          baseChar.maxHp = Math.floor(baseChar.maxHp * 1.2);
          baseChar.hp = baseChar.maxHp;
        } else if (comp.name.includes('头狼')) {
          weaponName = '狼牙';
          weaponDesc = '头狼锋利的獠牙，撕咬力惊人。';
          dmgMin = 30; dmgMax = 50;
          armorPen = 0.3; armorDmg = 0.5;
          fatCost = 8; hitMod = 15;
        }
        
        baseChar.equipment = {
          mainHand: {
            id: `beast-claw-${i}`,
            name: weaponName,
            type: 'WEAPON' as const,
            value: 0,
            weight: 0,
            durability: 999,
            maxDurability: 999,
            description: weaponDesc,
            damage: [Math.floor(dmgMin * beastStatMult), Math.floor(dmgMax * beastStatMult)] as [number, number],
            armorPen,
            armorDmg,
            fatigueCost: fatCost,
            range: 1,
            hitChanceMod: hitMod,
          },
          offHand: null,
          armor: null,
          helmet: null,
          ammo: null,
          accessory: null,
        };
      } else {
        // 非野兽敌人：根据AI类型、天数和难度阶段分配合适装备
        const equip = getEquipmentForAIType(comp.aiType, valueLimit, tier);
        baseChar.equipment = {
          mainHand: equip.mainHand,
          offHand: equip.offHand,
          armor: equip.armor,
          helmet: equip.helmet,
          ammo: null,
          accessory: null,
        };
      }
      
      // --- 属性缩放：天数越高敌人基础属性越强 ---
      // Boss实体保底1.2倍属性
      const nerfedStatMult = statMult * ENEMY_STAT_NERF;
      const effectiveMult = isBoss ? Math.max(1.2, nerfedStatMult) : nerfedStatMult;
      if (effectiveMult > 1.0) {
        baseChar.maxHp = Math.floor(baseChar.maxHp * effectiveMult);
        baseChar.hp = baseChar.maxHp;
        baseChar.stats.meleeSkill = Math.floor(baseChar.stats.meleeSkill * effectiveMult);
        baseChar.stats.rangedSkill = Math.floor(baseChar.stats.rangedSkill * effectiveMult);
        baseChar.stats.meleeDefense = Math.floor(baseChar.stats.meleeDefense * effectiveMult);
        baseChar.stats.rangedDefense = Math.floor(baseChar.stats.rangedDefense * effectiveMult);
        baseChar.stats.resolve = Math.floor(baseChar.stats.resolve * effectiveMult);
      }
      
      // --- 敌人开场士气：根据tier和AI类型决定 ---
      let enemyStartMorale = MoraleStatus.STEADY;
      const confidentBaseChance = [0, 0.15, 0.30, 0.50][tier] || 0;
      const confidentBonus = (comp.aiType === 'ARMY' || comp.aiType === 'TANK') ? 0.20 : 0;
      if (comp.aiType === 'BERSERKER') {
        enemyStartMorale = MoraleStatus.CONFIDENT;
      } else if (Math.random() < confidentBaseChance + confidentBonus) {
        enemyStartMorale = MoraleStatus.CONFIDENT;
      }

      return {
        ...baseChar,
        team: 'ENEMY' as const,
        combatPos: { q: 2, r: i - Math.floor(compositions.length / 2) },
        currentAP: 9,
        isDead: false,
        isShieldWall: false,
        isHalberdWall: false,
        movedThisTurn: false,
        waitCount: 0,
        freeSwapUsed: false,
        hasUsedFreeAttack: false,
        aiType: comp.aiType,
        morale: enemyStartMorale
      };
    });
    
    // 根据士气修正决定开场士气状态
    const startMorale = party.moraleModifier > 0 ? MoraleStatus.CONFIDENT
      : party.moraleModifier < 0 ? MoraleStatus.WAVERING
      : MoraleStatus.STEADY;
    
    const playerUnits: CombatUnit[] = party.mercenaries.filter(m => m.formationIndex !== null).map((m, idx) => {
        // 调整玩家位置：前排 q=-2，后排 q=-3
        const row = m.formationIndex! >= 9 ? 1 : 0; // 0=前排, 1=后排
        const col = m.formationIndex! % 9;
        const q = -2 - row;
        const r = col - 4; // 不再 clamp，每个编队位置映射到唯一的 r（-4 到 4）
        let unit: CombatUnit = { ...m, morale: startMorale, team: 'PLAYER' as const, combatPos: { q, r }, currentAP: 9, isDead: false, isShieldWall: false, isHalberdWall: false, movedThisTurn: false, waitCount: 0, freeSwapUsed: false, hasUsedFreeAttack: false };
        // === 入场被动：应用专精效果 ===
        unit = applyColossus(unit);       // 强体：+25% HP
        unit = applyFortifiedMind(unit);  // 定胆：+25% 胆识
        unit = applyBrawny(unit);         // 负重者：减少护甲疲劳惩罚
        return unit;
    });
    const allUnits = [...playerUnits, ...enemies];
    
    // 根据先手值排序回合顺序
    const sortedTurnOrder = allUnits
      .map(u => ({ id: u.id, init: u.stats.initiative + Math.random() * 10 }))
      .sort((a, b) => b.init - a.init)
      .map(u => u.id);
    
    // 根据玩家当前位置获取世界地图地形
    const tileIndex = Math.floor(party.y) * MAP_SIZE + Math.floor(party.x);
    const worldTerrain = tiles[tileIndex]?.type || 'PLAINS';
    
    combatEnemyNameRef.current = entity.name;
    combatEntityIdRef.current = entity.id;
    setCombatState({
      units: allUnits, 
      turnOrder: sortedTurnOrder,
      currentUnitIndex: 0, 
      round: 1, 
      combatLog: [`与 ${entity.name} 激战开始！（第${Math.floor(day)}天，${['初期', '中期', '后期', '末期'][tier]}难度）`], 
      terrainType: worldTerrain
    });
    setEntities(prev => prev.filter(e => e.id !== entity.id));
    // 巢穴计数减少
    if (entity.campId) {
      setCamps(prev => prev.map(c => c.id === entity.campId ? { ...c, currentAlive: Math.max(0, c.currentAlive - 1) } : c));
    }
    // 士气修正已应用到开场士气，重置为0
    if (party.moraleModifier !== 0) {
      setParty(p => ({ ...p, moraleModifier: 0 }));
    }
    setView('COMBAT');
  }, [party.mercenaries, party.x, party.y, party.day, party.moraleModifier, tiles, camps]);

  // 主循环处理 AI 与位移
  useEffect(() => {
    if (!gameInitialized) return;
    let anim: number;
    const loop = (time: number) => {
      const dt = (time - lastUpdateRef.current) / 1000;
      lastUpdateRef.current = time;
      if (view === 'WORLD_MAP') {
        const activeEscortQuest = party.activeQuest && party.activeQuest.type === 'ESCORT' && !party.activeQuest.isCompleted
          ? party.activeQuest
          : null;
        const activePatrolQuest = party.activeQuest && party.activeQuest.type === 'PATROL' && !party.activeQuest.isCompleted
          ? party.activeQuest
          : null;
        if (activeEscortQuest?.targetEntityId) {
          if (timeScale <= 0) {
            setTimeScale(1);
          }
          const escortEntity = entities.find(e => e.id === activeEscortQuest.targetEntityId);
          if (escortEntity) {
            const distToEscort = Math.hypot(escortEntity.x - party.x, escortEntity.y - party.y);
            const followMinDist = 0.45;
            if (distToEscort > followMinDist) {
              if (party.targetX !== escortEntity.x || party.targetY !== escortEntity.y) {
                setParty(p => ({ ...p, targetX: escortEntity.x, targetY: escortEntity.y }));
              }
            } else if (party.targetX !== null || party.targetY !== null) {
              setParty(p => ({ ...p, targetX: null, targetY: null }));
            }
          }
        }
        if (
          activePatrolQuest &&
          !activePatrolQuest.patrolArrived &&
          typeof activePatrolQuest.patrolTargetX === 'number' &&
          typeof activePatrolQuest.patrolTargetY === 'number'
        ) {
          const patrolRadius = activePatrolQuest.patrolRadius ?? 1.4;
          const distToPatrol = Math.hypot(party.x - activePatrolQuest.patrolTargetX, party.y - activePatrolQuest.patrolTargetY);
          if (distToPatrol <= patrolRadius) {
            setParty(prevParty => {
              if (
                !prevParty.activeQuest ||
                prevParty.activeQuest.id !== activePatrolQuest.id ||
                prevParty.activeQuest.type !== 'PATROL' ||
                prevParty.activeQuest.isCompleted ||
                prevParty.activeQuest.patrolArrived
              ) {
                return prevParty;
              }
              return {
                ...prevParty,
                activeQuest: { ...prevParty.activeQuest, patrolArrived: true }
              };
            });
          }
        }
      }

      if (view === 'WORLD_MAP' && timeScale > 0) {
        // 玩家移动
        if (party.targetX !== null && party.targetY !== null) {
            const dx = party.targetX - party.x, dy = party.targetY - party.y, dist = Math.hypot(dx, dy);
            if (dist > 0.1) {
                const step = 1.8 * timeScale * dt;
                setParty(p => ({ ...p, x: p.x + (dx/dist)*step, y: p.y + (dy/dist)*step, day: p.day + 0.0015 * timeScale }));
            } else {
                setParty(p => ({ ...p, targetX: null, targetY: null }));
                const city = cities.find(c => Math.hypot(c.x - party.x, c.y - party.y) < 0.6);
                if (city) {
                  if (party.activeQuest && !party.activeQuest.isCompleted && party.activeQuest.type === 'DELIVERY' && party.activeQuest.targetCityId === city.id) {
                    setParty(prevParty => {
                      if (
                        !prevParty.activeQuest ||
                        prevParty.activeQuest.type !== 'DELIVERY' ||
                        prevParty.activeQuest.isCompleted ||
                        prevParty.activeQuest.targetCityId !== city.id
                      ) {
                        return prevParty;
                      }
                      return {
                        ...prevParty,
                        activeQuest: {
                          ...prevParty.activeQuest,
                          isCompleted: true,
                        }
                      };
                    });
                  }
                  setCurrentCity(city);
                  setView('CITY');
                  setTimeScale(0);
                  // 记录访问过的城市（野心目标追踪）
                  setParty(p => {
                    const visited = p.ambitionState.citiesVisited;
                    if (!visited.includes(city.id)) {
                      return { ...p, ambitionState: { ...p.ambitionState, citiesVisited: [...visited, city.id] } };
                    }
                    return p;
                  });
                }
            }
        }
        
        // === 每日粮食消耗 + 工资扣除 + 自然恢复 HP + 自动修复装备 ===
        const currentDay = Math.floor(party.day);
        if (currentDay > lastProcessedDayRef.current) {
          lastProcessedDayRef.current = currentDay;
          let questFailedTitle: string | null = null;
          let wagePenaltyTriggered = false;
          setParty(p => {
            const headcount = p.mercenaries.length;
            const foodCost = headcount; // 每人每天消耗1份粮食
            const newFood = Math.max(0, p.food - foodCost);
            const isStarving = newFood <= 0;

            // === 每日工资扣除 ===
            const totalWages = p.mercenaries.reduce((sum, m) => sum + m.salary, 0);
            const newGold = Math.max(0, p.gold - totalWages);
            const isUnderpaid = p.gold < totalWages; // 工资支付不足：触发下次战斗士气低落
            if (isUnderpaid && headcount > 0) wagePenaltyTriggered = true;

            // === 医药资源池消耗：每个受伤佣兵消耗5点medicine，获得额外5HP恢复 ===
            let remainingMedicine = p.medicine;

            // === 修甲资源池消耗：每件受损装备消耗3点repairSupplies，修复10点耐久 ===
            let remainingRepair = p.repairSupplies;

            // 自然恢复 + 自动修复装备
            const updatedMercs = p.mercenaries.map(m => {
              let updated = m;
              // HP恢复/断粮惩罚
              if (isStarving) {
                const hpLoss = 2 + Math.floor(Math.random() * 3);
                updated = { ...updated, hp: Math.max(1, updated.hp - hpLoss) };
              } else if (updated.hp < updated.maxHp) {
                const baseHeal = 1 + Math.floor(Math.random() * 2); // 基础 1~2
                // 消耗医药：每个受伤佣兵消耗5点，获得额外5HP
                let medicineBonusHeal = 0;
                if (remainingMedicine >= 5) {
                  remainingMedicine -= 5;
                  medicineBonusHeal = 5;
                }
                const heal = baseHeal + medicineBonusHeal;
                updated = { ...updated, hp: Math.min(updated.maxHp, updated.hp + heal) };
              }
              // 自动修复装备耐久
              let newEquip = { ...updated.equipment };
              let changed = false;
              (['armor', 'helmet', 'offHand', 'mainHand'] as (keyof typeof newEquip)[]).forEach(slot => {
                const item = newEquip[slot];
                if (item && item.maxDurability > 0 && item.durability < item.maxDurability) {
                  const baseRepair = 2; // 无修甲材料时基础修复2点
                  let repairAmount = baseRepair;
                  // 消耗修甲材料：每件受损装备消耗3点，修复10点
                  if (remainingRepair >= 3) {
                    remainingRepair -= 3;
                    repairAmount = 10;
                  }
                  const newDur = Math.min(item.maxDurability, item.durability + repairAmount);
                  newEquip = { ...newEquip, [slot]: { ...item, durability: newDur } };
                  changed = true;
                }
              });
              if (changed) updated = { ...updated, equipment: newEquip };
              return updated;
            });

            // 同时自动修复库存中的装备（使用剩余修甲材料）
            const updatedInv = p.inventory.map(item => {
              if (item.type !== 'CONSUMABLE' && item.maxDurability > 0 && item.durability < item.maxDurability) {
                const baseRepair = 2;
                let repairAmount = baseRepair;
                if (remainingRepair >= 3) {
                  remainingRepair -= 3;
                  repairAmount = 10;
                }
                return { ...item, durability: Math.min(item.maxDurability, item.durability + repairAmount) };
              }
              return item;
            });

            // === 任务天数倒计时 ===
            let updatedQuest = p.activeQuest;
            if (updatedQuest && !updatedQuest.isCompleted) {
              const newDaysLeft = updatedQuest.daysLeft - 1;
              if (newDaysLeft <= 0) {
                // 任务超时失败：清除任务，扣声望
                questFailedTitle = updatedQuest.title;
                updatedQuest = null;
              } else {
                updatedQuest = { ...updatedQuest, daysLeft: newDaysLeft };
              }
            }

            return {
              ...p,
              gold: newGold,
              food: newFood,
              medicine: remainingMedicine,
              repairSupplies: remainingRepair,
              mercenaries: updatedMercs,
              inventory: updatedInv,
              moraleModifier: (isStarving || isUnderpaid) ? -1 : p.moraleModifier,
              activeQuest: updatedQuest,
              reputation: updatedQuest === null && p.activeQuest ? Math.max(0, p.reputation - 3) : p.reputation, // 任务失败扣3声望
            };
          });
          if (questFailedTitle) {
            if (ambitionNotifTimerRef.current) {
              clearTimeout(ambitionNotifTimerRef.current);
            }
            setAmbitionNotification(`契约失败「${questFailedTitle}」：已超时（声望 -3）`);
            ambitionNotifTimerRef.current = window.setTimeout(() => setAmbitionNotification(null), 4000);
          } else if (wagePenaltyTriggered) {
            if (ambitionNotifTimerRef.current) {
              clearTimeout(ambitionNotifTimerRef.current);
            }
            setAmbitionNotification('军饷不足：全员士气受挫（下次战斗动摇）');
            ambitionNotifTimerRef.current = window.setTimeout(() => setAmbitionNotification(null), 3000);
          }

          // === 商店库存 & 佣兵招募池定期刷新（每 3 天） ===
          setCities(prevCities => {
            let changed = false;
            const updated = prevCities.map(c => {
              let city = c;
              // 商店刷新
              if (currentDay - (c.lastMarketRefreshDay || 1) >= 3) {
                changed = true;
                city = {
                  ...city,
                  market: generateCityMarket(c.type),
                  recruits: Array.from({ length: 4 }).map((_, j) => createMercenary(`rec-${c.id}-${currentDay}-${j}`)),
                  lastMarketRefreshDay: currentDay,
                  priceModifier: rollPriceModifier(),
                };
              }
              // 任务刷新：村庄每5天，城镇每4天，王都每3天
              const questRefreshInterval = c.type === 'VILLAGE' ? 5 : c.type === 'TOWN' ? 4 : 3;
              if (currentDay - (c.lastQuestRefreshDay || 1) >= questRefreshInterval) {
                changed = true;
                const cityIndex = parseInt(c.id.replace('city-', ''), 10) || 0;
                const biome = (c.biome || 'CENTRAL_PLAINS') as any;
                const newQuests = generateCityQuests(biome, c.type, c.id, cityIndex);
                city = {
                  ...city,
                  quests: newQuests,
                  lastQuestRefreshDay: currentDay,
                };
              }
              return city;
            });
            return changed ? updated : prevCities;
          });
        }

        // 使用行为树系统更新实体 AI
        setEntities(prev => {
            let combatTriggered = false;
            let combatEntity: WorldEntity | null = null;
            
            const updatedEntities = prev.map(ent => {
                // 使用行为树更新 AI
                const updatedEnt = updateWorldEntityAI(ent, party, prev, tiles, cities, dt * timeScale);
                
                // 碰撞检测（玩家）
                const distToPlayer = Math.hypot(updatedEnt.x - party.x, updatedEnt.y - party.y);
                if (distToPlayer < 0.6 && updatedEnt.faction === 'HOSTILE' && !preCombatEntity && !combatTriggered) {
                    combatTriggered = true;
                    combatEntity = updatedEnt;
                }
                
                return updatedEnt;
            });
            
            // 触发战斗
            if (combatEntity) {
                setPreCombatEntity(combatEntity);
                setTimeScale(0);
            }
            
            // ===== 实体间碰撞互动（匪劫商队、军灭匪、兽袭商队） =====
            const toRemoveIds = new Set<string>();
            const campDecrements = new Map<string, number>(); // campId -> decrement count
            let escortArrived = false;
            let escortFailed = false;
            const activeEscortQuest = party.activeQuest && party.activeQuest.type === 'ESCORT' && !party.activeQuest.isCompleted
              ? party.activeQuest
              : null;
            
            for (let i = 0; i < updatedEntities.length; i++) {
              const a = updatedEntities[i];
              if (toRemoveIds.has(a.id)) continue;
              
              for (let j = i + 1; j < updatedEntities.length; j++) {
                const b = updatedEntities[j];
                if (toRemoveIds.has(b.id)) continue;
                
                const dist = Math.hypot(a.x - b.x, a.y - b.y);
                if (dist > 0.8) continue;
                
                // 只在玩家视野外处理NPC间碰撞
                const distAPlayer = Math.hypot(a.x - party.x, a.y - party.y);
                const distBPlayer = Math.hypot(b.x - party.x, b.y - party.y);
                if (distAPlayer < VISION_RADIUS || distBPlayer < VISION_RADIUS) continue;
                
                // 土匪/野兽/游牧(敌对) vs 商队 -> 商队被劫
                const isHostileA = a.faction === 'HOSTILE' && (a.type === 'BANDIT' || a.type === 'BEAST' || a.type === 'NOMAD' || a.type === 'CULT');
                const isHostileB = b.faction === 'HOSTILE' && (b.type === 'BANDIT' || b.type === 'BEAST' || b.type === 'NOMAD' || b.type === 'CULT');
                
                if (isHostileA && b.type === 'TRADER') {
                  toRemoveIds.add(b.id);
                  continue;
                }
                if (isHostileB && a.type === 'TRADER') {
                  toRemoveIds.add(a.id);
                  continue;
                }
                
                // 军队 vs 土匪/野兽(敌对) -> 匪被剿
                if (a.type === 'ARMY' && isHostileB) {
                  toRemoveIds.add(b.id);
                  if (b.campId) campDecrements.set(b.campId, (campDecrements.get(b.campId) || 0) + 1);
                  continue;
                }
                if (b.type === 'ARMY' && isHostileA) {
                  toRemoveIds.add(a.id);
                  if (a.campId) campDecrements.set(a.campId, (campDecrements.get(a.campId) || 0) + 1);
                  continue;
                }
              }
            }
            
            // 更新巢穴计数
            if (campDecrements.size > 0) {
              setCamps(prevCamps => prevCamps.map(c => {
                const dec = campDecrements.get(c.id);
                return dec ? { ...c, currentAlive: Math.max(0, c.currentAlive - dec) } : c;
              }));
            }
            
            // 移除被消灭的实体
            if (activeEscortQuest?.targetEntityId && toRemoveIds.has(activeEscortQuest.targetEntityId)) {
              escortFailed = true;
            }
            if (activeEscortQuest?.targetEntityId && activeEscortQuest.targetCityId) {
              const escortEnt = updatedEntities.find(e => e.id === activeEscortQuest.targetEntityId && !toRemoveIds.has(e.id));
              const destinationCity = cities.find(c => c.id === activeEscortQuest.targetCityId);
              if (escortEnt && destinationCity) {
                const distToDest = Math.hypot(escortEnt.x - destinationCity.x, escortEnt.y - destinationCity.y);
                if (distToDest < 0.9) {
                  toRemoveIds.add(escortEnt.id);
                  escortArrived = true;
                }
              }
            }

            if (toRemoveIds.size > 0) {
              const survivors = updatedEntities.filter(e => !toRemoveIds.has(e.id));
              if (escortArrived) {
                setParty(prevParty => {
                  if (!prevParty.activeQuest || prevParty.activeQuest.id !== activeEscortQuest?.id || prevParty.activeQuest.isCompleted) {
                    return prevParty;
                  }
                  return {
                    ...prevParty,
                    activeQuest: { ...prevParty.activeQuest, isCompleted: true },
                  };
                });
              } else if (escortFailed) {
                setParty(prevParty => {
                  if (!prevParty.activeQuest || prevParty.activeQuest.id !== activeEscortQuest?.id || prevParty.activeQuest.isCompleted) {
                    return prevParty;
                  }
                  return {
                    ...prevParty,
                    activeQuest: null,
                    reputation: Math.max(0, prevParty.reputation - 3),
                  };
                });
              }
              return survivors;
            }

            if (escortArrived) {
              setParty(prevParty => {
                if (!prevParty.activeQuest || prevParty.activeQuest.id !== activeEscortQuest?.id || prevParty.activeQuest.isCompleted) {
                  return prevParty;
                }
                return {
                  ...prevParty,
                  activeQuest: { ...prevParty.activeQuest, isCompleted: true },
                };
              });
            }
            
            return updatedEntities;
        });
        
        // ===== 巢穴定期刷怪 =====
        const dayNow = Math.floor(party.day);
        setCamps(prevCamps => {
          let anyChanged = false;
          // 普通巢穴数量（Boss巢穴追加在后面）
          const normalCampCount = CAMP_TEMPLATES.length;
          const newCamps = prevCamps.map((camp, campIdx) => {
            if (camp.destroyed) return camp;
            // Boss巢穴不重生（已cleared或被摧毁后不再刷怪）
            if (camp.isBoss) {
              // Boss巢穴：如果当前存活=0且未cleared，重新产出一个Boss实体
              if (camp.cleared) return camp;
              if (camp.currentAlive >= camp.maxAlive) return camp;
              const distToPlayer = Math.hypot(camp.x - party.x, camp.y - party.y);
              if (distToPlayer < 10) return camp;
              const bossEnt = spawnBossEntity(camp);
              setEntities(prev => [...prev, bossEnt]);
              anyChanged = true;
              return { ...camp, currentAlive: 1, lastSpawnDay: dayNow };
            }
            if (camp.currentAlive >= camp.maxAlive) return camp;
            if (dayNow - camp.lastSpawnDay < camp.spawnCooldown) return camp;
            
            // 检查巢穴是否远离玩家（>10格）
            const distToPlayer = Math.hypot(camp.x - party.x, camp.y - party.y);
            if (distToPlayer < 10) return camp;
            
            // 找到对应的模板（只对普通巢穴有效）
            const template = campIdx < normalCampCount ? CAMP_TEMPLATES[campIdx] : null;
            if (!template) return camp;
            
            // 产出一个新实体
            const newEnt = spawnEntityFromCamp(camp, template, Date.now(), tiles);
            setEntities(prev => [...prev, newEnt]);
            
            anyChanged = true;
            return { ...camp, currentAlive: camp.currentAlive + 1, lastSpawnDay: dayNow };
          });
          
          return anyChanged ? newCamps : prevCamps;
        });
      }
      anim = requestAnimationFrame(loop);
    };
    anim = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(anim);
  }, [view, timeScale, party, cities, camps, preCombatEntity, gameInitialized]);

  // --- INTRO STORY 逐字显示逻辑 ---
  useEffect(() => {
    const detect = () => {
      const vw = window.visualViewport?.width ?? window.innerWidth;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const coarse = window.matchMedia('(pointer: coarse)').matches;
      const landscape = vw > vh;
      const compact = coarse && landscape;
      const dpr = window.devicePixelRatio || 1;
      const BASELINE_DPR = 1.7;
      const shortest = Math.min(vw, vh);
      const scale = Math.max(0.58, Math.min(1.08, (shortest / 440) * (BASELINE_DPR / dpr)));
      setIsIntroCompactLandscape(compact);
      setIntroCompactFontScale(scale);
    };
    detect();
    window.addEventListener('resize', detect);
    window.visualViewport?.addEventListener('resize', detect);
    return () => {
      window.removeEventListener('resize', detect);
      window.visualViewport?.removeEventListener('resize', detect);
    };
  }, []);

  useEffect(() => {
    if (view !== 'INTRO_STORY' || introComplete || introFade !== 'visible') return;

    const lines = introStoryLines;
    if (introLineIndex >= lines.length) {
      setIntroComplete(true);
      return;
    }

    const currentLine = lines[introLineIndex];

    if (currentLine === '') {
      introTimerRef.current = window.setTimeout(() => {
        setIntroDisplayed(prev => [...prev, '']);
        setIntroLineIndex(prev => prev + 1);
        setIntroCharIndex(0);
      }, 300);
      return () => { if (introTimerRef.current) clearTimeout(introTimerRef.current); };
    }

    if (introCharIndex === 0) {
      setIntroDisplayed(prev => [...prev, '']);
    }

    if (introCharIndex < currentLine.length) {
      introTimerRef.current = window.setTimeout(() => {
        setIntroDisplayed(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = currentLine.substring(0, introCharIndex + 1);
          return updated;
        });
        setIntroCharIndex(prev => prev + 1);
      }, 50);
    } else {
      introTimerRef.current = window.setTimeout(() => {
        setIntroLineIndex(prev => prev + 1);
        setIntroCharIndex(0);
      }, 200);
    }

    return () => { if (introTimerRef.current) clearTimeout(introTimerRef.current); };
  }, [view, introLineIndex, introCharIndex, introStoryLines, introComplete, introFade]);

  // Intro fade in
  useEffect(() => {
    if (view === 'INTRO_STORY' && introFade === 'in') {
      const t = setTimeout(() => setIntroFade('visible'), 100);
      return () => clearTimeout(t);
    }
  }, [view, introFade]);

  // --- 野心目标：完成检测 ---
  useEffect(() => {
    if (!gameInitialized) return;
    if (!party.ambitionState.currentAmbition) return;
    
    if (checkAmbitionComplete(party)) {
      const completedName = party.ambitionState.currentAmbition.name;
      const rep = party.ambitionState.currentAmbition.reputationReward;
      const gold = party.ambitionState.currentAmbition.goldReward ?? 0;
      setParty(p => ({
        ...p,
        reputation: p.reputation + rep,
        gold: p.gold + gold,
        ambitionState: completeAmbition(p),
        moraleModifier: 1, // 下次战斗全员自信开场
      }));
      // 显示通知
      setAmbitionNotification(`目标达成「${completedName}」！声望 +${rep}${gold ? `，金币 +${gold}` : ''}`);
      if (ambitionNotifTimerRef.current) clearTimeout(ambitionNotifTimerRef.current);
      ambitionNotifTimerRef.current = window.setTimeout(() => setAmbitionNotification(null), 4000);
    }
  }, [party.gold, party.mercenaries.length, party.ambitionState.battlesWon, party.ambitionState.citiesVisited.length, party.day, party.inventory.length, party.reputation, party.ambitionState.contractsCompleted, party.ambitionState.campsDestroyed, party.ambitionState.totalCompleted, gameInitialized]);

  // --- 野心目标：弹出选择界面 ---
  useEffect(() => {
    if (!gameInitialized) return;
    if (view !== 'WORLD_MAP') return;
    if (showAmbitionPopup) return;
    if (preCombatEntity) return;
    if (saveLoadMode) return;
    
    if (shouldShowAmbitionSelect(party)) {
      // 小延迟后弹出，避免页面切换时立即弹出
      const t = setTimeout(() => setShowAmbitionPopup(true), 800);
      return () => clearTimeout(t);
    }
  }, [view, party.ambitionState.currentAmbition, party.day, gameInitialized, showAmbitionPopup, preCombatEntity, saveLoadMode]);

  // --- 玩法提示触发 ---
  // 视图切换触发
  useEffect(() => {
    if (!gameInitialized) return;
    if (view === 'WORLD_MAP') triggerTip('world_map_intro');
    if (view === 'COMBAT')    triggerTip('combat_first_start');
    if (view === 'CITY')      triggerTip('city_first_enter');
    if (view === 'CAMP')      triggerTip('squad_first_open');
  }, [view, gameInitialized]);

  // 粮草不足触发
  const prevFoodRef = useRef(party.food);
  useEffect(() => {
    if (!gameInitialized || view !== 'WORLD_MAP') return;
    const threshold = party.mercenaries.length * 3;
    if (prevFoodRef.current > threshold && party.food <= threshold && party.food > 0) {
      triggerTip('world_map_food_low');
    }
    prevFoodRef.current = party.food;
  }, [party.food, gameInitialized, view]);

  // 遭遇敌人触发
  useEffect(() => {
    if (preCombatEntity) triggerTip('world_map_enemy_nearby');
  }, [preCombatEntity]);

  // --- 野心目标：选择/取消处理 ---
  const handleAmbitionSelect = useCallback((ambitionId: string) => {
    setParty(p => ({ ...p, ambitionState: selectAmbition(p, ambitionId) }));
    setShowAmbitionPopup(false);
    setTimeScale(0);
  }, []);

  const handleAmbitionNoAmbition = useCallback(() => {
    setParty(p => ({ ...p, ambitionState: selectNoAmbition(p) }));
    setShowAmbitionPopup(false);
    setTimeScale(0);
  }, []);

  const handleAmbitionCancel = useCallback(() => {
    const cancelledName = party.ambitionState.currentAmbition?.name;
    setParty(p => ({
      ...p,
      ambitionState: cancelAmbition(p),
      moraleModifier: -1, // 下次战斗全员动摇开场
    }));
    if (cancelledName) {
      setAmbitionNotification(`放弃了「${cancelledName}」，全员士气低落……`);
      if (ambitionNotifTimerRef.current) clearTimeout(ambitionNotifTimerRef.current);
      ambitionNotifTimerRef.current = window.setTimeout(() => setAmbitionNotification(null), 3000);
    }
  }, [party.ambitionState.currentAmbition]);

  const handleIntroClick = useCallback(() => {
    if (!introComplete) {
      // 快速完成
      if (introTimerRef.current) clearTimeout(introTimerRef.current);
      setIntroDisplayed(introStoryLines);
      setIntroLineIndex(introStoryLines.length);
      setIntroComplete(true);
      return;
    }
    // 完成 -> 进入世界地图
    setIntroFade('out');
    setTimeout(() => setView('WORLD_MAP'), 800);
  }, [introComplete, introStoryLines]);

  // 是否是游戏前的菜单/叙事阶段
  const isPreGameView = view === 'MAIN_MENU' || view === 'PROLOGUE' || view === 'ORIGIN_SELECT' || view === 'INTRO_STORY';

  useEffect(() => {
    if (!showSystemMenu) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (systemMenuRef.current && !systemMenuRef.current.contains(event.target as Node)) {
        setShowSystemMenu(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [showSystemMenu]);

  return (
    <div className="game-canvas flex flex-col bg-black text-slate-200 overflow-hidden font-serif">
      {/* 游戏中导航栏 - 仅在游戏内视图显示 */}
      {!isPreGameView && view !== 'COMBAT' && view !== 'BATTLE_RESULT' && view !== 'CAMP' && (
          <nav className="bg-black border-b border-amber-900/40 px-3 sm:px-6 py-2 sm:py-0 sm:h-14 z-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
             <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                <button
                  onClick={() => setView('CAMP')}
                  className="px-3 sm:px-4 py-1 text-[11px] sm:text-xs font-bold transition-all border text-amber-500 border-amber-900/40 hover:border-amber-500 hover:bg-amber-900/20"
                >
                  战团营地
                </button>
                <button
                  onClick={() => setView('WORLD_MAP')}
                  className="px-3 sm:px-4 py-1 text-[11px] sm:text-xs font-bold transition-all border text-amber-500 border-amber-900/40 hover:border-amber-500 hover:bg-amber-900/20"
                >
                  返回地图
                </button>
                <div className="relative sm:ml-2" ref={systemMenuRef}>
                  <button
                    onClick={() => setShowSystemMenu(v => !v)}
                    className={`px-3 sm:px-4 py-1 text-[11px] sm:text-xs font-bold transition-all border uppercase tracking-[0.25em] ${
                      showSystemMenu
                        ? 'bg-amber-600 text-white border-amber-500'
                        : 'text-amber-500 border-amber-700/60 hover:border-amber-500 hover:bg-amber-900/20'
                    }`}
                  >
                    系统
                  </button>
                  {showSystemMenu && (
                    <div className="absolute top-full left-0 mt-2 min-w-40 bg-[#120d09]/95 border border-amber-900/50 shadow-2xl z-[120] p-1.5 flex flex-col gap-1">
                      <button
                        onClick={() => {
                          setSaveLoadMode('SAVE');
                          setShowSystemMenu(false);
                        }}
                        className="px-3 py-1.5 text-left text-[11px] text-emerald-400 border border-transparent hover:border-emerald-700/50 hover:bg-emerald-900/20 transition-all"
                      >
                        存档
                      </button>
                      <button
                        onClick={() => {
                          setSaveLoadMode('LOAD');
                          setShowSystemMenu(false);
                        }}
                        className="px-3 py-1.5 text-left text-[11px] text-blue-400 border border-transparent hover:border-blue-700/50 hover:bg-blue-900/20 transition-all"
                      >
                        读档
                      </button>
                      <button
                        onClick={() => {
                          setShowContact(true);
                          setShowSystemMenu(false);
                        }}
                        className="px-3 py-1.5 text-left text-[11px] text-amber-400 border border-transparent hover:border-amber-700/50 hover:bg-amber-900/20 transition-all"
                      >
                        联系开发者
                      </button>
                      <div className="my-1 border-t border-amber-900/40" />
                      <button
                        onClick={() => {
                          setShowSystemMenu(false);
                          setShowReturnMainMenuConfirm(true);
                        }}
                        className="px-3 py-1.5 text-left text-[11px] text-slate-400 border border-transparent hover:border-slate-600 hover:bg-slate-800/40 transition-all"
                      >
                        返回主菜单
                      </button>
                    </div>
                  )}
                </div>
             </div>

             {/* 当前野心 */}
             {party.ambitionState.currentAmbition && (
               <div className="flex items-center gap-2 text-xs">
                 <span className="text-[9px] text-amber-700 uppercase tracking-widest hidden sm:inline">志向</span>
                 <div className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] sm:text-xs text-amber-400 border border-amber-900/40 bg-amber-950/20">
                   <span className="flex items-center gap-1">
                     {getAmbitionTypeInfo(party.ambitionState.currentAmbition.type).icon} {party.ambitionState.currentAmbition.name}
                     {(() => {
                       const progress = getAmbitionProgress(party);
                       return progress ? <span className="ml-1 text-[10px] text-amber-600">({progress})</span> : null;
                     })()}
                   </span>
                   <div className="w-px h-3 bg-amber-900/40 mx-0.5" />
                   <button
                     onClick={() => {
                       if (window.confirm('确定要放弃当前的志向吗？这会降低全员士气。')) {
                         handleAmbitionCancel();
                       }
                     }}
                     className="text-[10px] text-red-700 hover:text-red-500 transition-colors uppercase tracking-tighter"
                     title="放弃当前志向（会降低全员士气）"
                   >
                     放弃
                   </button>
                 </div>
               </div>
             )}

             <div className="flex items-center justify-end gap-3 sm:gap-6">
                 <div className="flex bg-slate-900/50 rounded-sm border border-white/5 p-1 shrink-0">
                     {[0, 1, 2].map(s => (
                         <button key={s} onClick={() => setTimeScale(s)} className={`w-7 sm:w-8 h-6 flex items-center justify-center text-[10px] transition-all ${timeScale === s ? 'bg-amber-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                             {s === 0 ? '⏸' : s === 1 ? '▶' : '▶▶'}
                         </button>
                     ))}
                 </div>
             </div>
          </nav>
      )}

      <main className="flex-1 relative overflow-hidden flex flex-col">
        {/* ===== 主菜单 ===== */}
        {view === 'MAIN_MENU' && (
          <MainMenu
            hasSaveData={hasSave}
            onNewGame={() => setView('PROLOGUE')}
            onLoadGame={() => setSaveLoadMode('LOAD')}
          />
        )}

        {/* ===== 开场序幕 ===== */}
        {view === 'PROLOGUE' && (
          <Prologue onComplete={() => {
            // 在进入起源选择前预生成地图
            pendingMapRef.current = generateMap();
            setView('ORIGIN_SELECT');
          }} />
        )}

        {/* ===== 起源选择 ===== */}
        {view === 'ORIGIN_SELECT' && (
          <OriginSelect onSelect={(origin, name) => {
            setSelectedOrigin(origin);
            setLeaderName(name);
            // 准备过场叙事
            const cityName = pendingMapRef.current?.cities[0]?.name || '城邑';
            const storyLines = [
              ...origin.introStory,
              '',
              `你们来到了${cityName}，决定在此暂歇整顿。`,
              '新的征途，即将开始……',
            ];
            setIntroStoryLines(storyLines);
            setIntroDisplayed([]);
            setIntroLineIndex(0);
            setIntroCharIndex(0);
            setIntroComplete(false);
            setIntroFade('in');
            // 同时初始化游戏数据
            if (pendingMapRef.current) {
              initGameWithOrigin(origin, name, pendingMapRef.current);
            }
            setView('INTRO_STORY');
          }} />
        )}

        {/* ===== 过场叙事 ===== */}
        {view === 'INTRO_STORY' && (
          <div
            className={`w-full h-full bg-black flex flex-col items-center justify-center relative overflow-hidden select-none cursor-pointer transition-opacity duration-[800ms] ${
              introFade === 'out' ? 'opacity-0' : introFade === 'in' ? 'opacity-0' : 'opacity-100'
            }`}
            onClick={handleIntroClick}
          >
            {/* 背景氛围 */}
            <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
              style={{ backgroundImage: `radial-gradient(ellipse 600px 400px at 50% 50%, rgba(139, 90, 43, 0.4), transparent)` }}
            />

            {/* 起源标题 */}
            <div className={`absolute ${isIntroCompactLandscape ? 'top-4' : 'top-[10%]'}`}>
              <div className={`flex items-center ${isIntroCompactLandscape ? 'gap-2' : 'gap-4'}`}>
                <div className={`${isIntroCompactLandscape ? 'w-10' : 'w-20'} h-px bg-gradient-to-r from-transparent to-amber-800/40`} />
                <span
                  className={`${isIntroCompactLandscape ? 'text-[10px] tracking-[0.22em]' : 'text-sm tracking-[0.5em]'} text-amber-700/60 font-serif`}
                  style={isIntroCompactLandscape ? { fontSize: `clamp(0.56rem, ${1.1 * introCompactFontScale}vw, 0.72rem)` } : undefined}
                >
                  {selectedOrigin?.name} · {selectedOrigin?.subtitle}
                </span>
                <div className={`${isIntroCompactLandscape ? 'w-10' : 'w-20'} h-px bg-gradient-to-l from-transparent to-amber-800/40`} />
              </div>
            </div>

            {/* 叙事文字 */}
            <div className="absolute inset-0 flex items-center justify-center px-2">
              <div
                className={`${isIntroCompactLandscape ? 'w-full max-w-[95vw] px-4' : 'max-w-2xl px-8'}`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className={`${isIntroCompactLandscape ? 'space-y-1.5 max-h-[58vh] overflow-y-auto pr-1' : 'space-y-3'}`}>
                {introDisplayed.map((line, i) => (
                  <p
                    key={i}
                    className={`${isIntroCompactLandscape ? 'text-[14px] leading-relaxed tracking-[0.08em]' : 'text-lg leading-loose tracking-[0.12em]'} font-serif ${
                      line === '' ? (isIntroCompactLandscape ? 'h-2' : 'h-4') : 'text-amber-100/80'
                    }`}
                    style={{
                      textShadow: '0 0 20px rgba(217, 119, 6, 0.1)',
                      fontSize: isIntroCompactLandscape ? `clamp(0.76rem, ${1.9 * introCompactFontScale}vw, 0.95rem)` : undefined,
                    }}
                  >
                    {line}
                    {i === introDisplayed.length - 1 && !introComplete && line !== '' && (
                      <span className={`inline-block w-px bg-amber-500 ml-1 animate-pulse ${isIntroCompactLandscape ? 'h-4' : 'h-5'}`} />
                    )}
                  </p>
                ))}
                </div>
              </div>
            </div>

            {/* 继续提示 */}
            {introComplete && (
              <div className={`absolute animate-pulse ${isIntroCompactLandscape ? 'bottom-[14%]' : 'bottom-[18%]'}`}>
                <p className={`${isIntroCompactLandscape ? 'text-[10px] tracking-[0.22em]' : 'text-xs tracking-[0.3em]'} text-amber-700/60`}>— 点击进入世界 —</p>
              </div>
            )}

            {/* 跳过按钮 */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (introTimerRef.current) clearTimeout(introTimerRef.current);
                setIntroFade('out');
                setTimeout(() => setView('WORLD_MAP'), 400);
              }}
              className={`absolute text-slate-700 hover:text-slate-500 transition-colors z-10 ${
                isIntroCompactLandscape ? 'bottom-3 right-3 text-[10px] tracking-[0.2em]' : 'bottom-8 right-8 text-xs tracking-widest'
              }`}
            >
              跳过 →
            </button>
          </div>
        )}

        {/* ===== 世界地图 ===== */}
        {view === 'WORLD_MAP' && gameInitialized && (
            <WorldMap 
                tiles={tiles} 
                party={party} 
                entities={entities} 
                cities={cities}
                onSetTarget={(x, y) => {
                  // 护送任务期间禁止手动设置目标，强制跟随任务商队
                  if (party.activeQuest && party.activeQuest.type === 'ESCORT' && !party.activeQuest.isCompleted) {
                    return;
                  }
                  setParty(p => ({ ...p, targetX: x, targetY: y }));
                  setTimeScale(1);
                }} 
            />
        )}
        {view === 'COMBAT' && combatState && (
            <CombatView
                initialState={combatState}
                onTriggerTip={triggerTip}
                onCombatEnd={(victory, survivors, enemyUnits, rounds) => {
                    const result = generateBattleResult(
                      victory,
                      survivors,
                      enemyUnits,
                      rounds,
                      combatEnemyNameRef.current || '未知敌人',
                      party.mercenaries,
                      combatBossLootIdsRef.current // 传入Boss掉落池
                    );
                    setBattleResult(result);
                    // 先更新存活者的 HP（从战斗状态同步回来）+ 战斗胜利计数 + 任务目标击杀判定
                    if (victory) {
                      // 标记Boss巢穴为已清除 + 营地摧毁计数
                      if (combatBossCampIdRef.current) {
                        setCamps(prev => prev.map(c =>
                          c.id === combatBossCampIdRef.current
                            ? { ...c, cleared: true, destroyed: true }
                            : c
                        ));
                        // 营地摧毁计数（用于宏愿系统）
                        setParty(p => ({
                          ...p,
                          ambitionState: {
                            ...p.ambitionState,
                            campsDestroyed: (p.ambitionState.campsDestroyed || 0) + 1,
                          },
                        }));
                      }
                      // 15% 概率掉落消耗品，直接加到资源池
                      let dropMedicine = 0;
                      let dropRepair = 0;
                      let dropFood = 0;
                      if (Math.random() < 0.15 && CONSUMABLE_TEMPLATES.length > 0) {
                        const consumable = CONSUMABLE_TEMPLATES[Math.floor(Math.random() * CONSUMABLE_TEMPLATES.length)];
                        if (consumable.subType === 'MEDICINE') dropMedicine = consumable.effectValue || 0;
                        else if (consumable.subType === 'REPAIR_KIT') dropRepair = consumable.effectValue || 0;
                        else if (consumable.subType === 'FOOD') dropFood = consumable.effectValue || 0;
                      }
                      setParty(p => {
                        // 检查是否击杀了任务目标（仿战场兄弟：击杀后标记完成，需返回接取城市交付）
                        let updatedQuest = p.activeQuest;
                        if (updatedQuest && updatedQuest.type === 'HUNT' && !updatedQuest.isCompleted) {
                          const defeatedEntityId = combatEntityIdRef.current;
                          if (updatedQuest.targetEntityId === defeatedEntityId) {
                            updatedQuest = { ...updatedQuest, isCompleted: true };
                          }
                        } else if (updatedQuest && updatedQuest.type === 'PATROL' && !updatedQuest.isCompleted) {
                          const patrolTargetX = updatedQuest.patrolTargetX;
                          const patrolTargetY = updatedQuest.patrolTargetY;
                          const patrolRadius = updatedQuest.patrolRadius ?? 1.4;
                          const isInPatrolArea =
                            typeof patrolTargetX === 'number' &&
                            typeof patrolTargetY === 'number' &&
                            Math.hypot(p.x - patrolTargetX, p.y - patrolTargetY) <= patrolRadius + 1.2;
                          if (updatedQuest.patrolArrived && isInPatrolArea) {
                            const defeatedThisBattle = Math.max(1, result.enemiesKilled + result.enemiesRouted);
                            const requiredKills = updatedQuest.patrolKillsRequired ?? (updatedQuest.difficulty === 1 ? 4 : updatedQuest.difficulty === 2 ? 6 : 8);
                            const currentKills = updatedQuest.patrolKillsDone || 0;
                            const nextKills = Math.min(requiredKills, currentKills + defeatedThisBattle);
                            updatedQuest = {
                              ...updatedQuest,
                              patrolKillsDone: nextKills,
                              isCompleted: nextKills >= requiredKills,
                            };
                          }
                        }
                        return {
                          ...p,
                          activeQuest: updatedQuest,
                          medicine: p.medicine + dropMedicine,
                          repairSupplies: p.repairSupplies + dropRepair,
                          food: p.food + dropFood,
                          mercenaries: p.mercenaries.map(m => {
                            const sur = survivors.find(s => s.id === m.id);
                            if (sur) return { ...m, hp: sur.hp, fatigue: 0 };
                            return m; // 阵亡者暂时保留，在结算完成后移除
                          }),
                          ambitionState: {
                            ...p.ambitionState,
                            battlesWon: p.ambitionState.battlesWon + 1,
                          }
                        };
                      });
                    }
                    // 清理Boss引用
                    combatBossLootIdsRef.current = [];
                    combatBossCampIdRef.current = '';
                    setCombatState(null);
                    setView('BATTLE_RESULT');
                    setTimeScale(0);
                }} 
            />
        )}
        {view === 'BATTLE_RESULT' && battleResult && (
            <BattleResultView
                result={battleResult}
                party={party}
                onComplete={(selectedLoot, goldReward, xpMap) => {
                    setParty(p => {
                      // 移除阵亡者
                      const deadIds = new Set(battleResult.casualties.map(c => {
                        const merc = p.mercenaries.find(m => m.name === c.name);
                        return merc?.id;
                      }).filter(Boolean));

                      const updatedMercs = p.mercenaries
                        .filter(m => !deadIds.has(m.id))
                        .map(m => {
                          const baseXp = xpMap[m.id] || 0;
                          // 学徒(student) XP 加成
                          const xp = applyStudentXPBonus(baseXp, m.perks);
                          const withXp = { ...m, xp: m.xp + xp };
                          // 自动检测升级（可能连升多级）
                          const { char: leveled } = checkLevelUp(withXp);
                          return leveled;
                        });

                      return {
                        ...p,
                        mercenaries: updatedMercs,
                        gold: p.gold + goldReward,
                        inventory: [...p.inventory, ...selectedLoot],
                      };
                    });
                    setBattleResult(null);
                    setView('WORLD_MAP');
                    setTimeScale(0);
                }}
            />
        )}
        {view === 'CAMP' && (
            <SquadManagement
                party={party}
                onUpdateParty={setParty}
                onClose={() => setView('WORLD_MAP')}
                onTriggerTip={triggerTip}
            />
        )}
        {view === 'CITY' && currentCity && (
            <CityView
                city={currentCity}
                party={party}
                onLeave={() => { setView('WORLD_MAP'); setTimeScale(0); }}
                onUpdateParty={setParty}
                onTriggerTip={triggerTip}
                onUpdateCity={(newCity) => { setCities(prev => prev.map(c => c.id === newCity.id ? newCity : c)); setCurrentCity(newCity); }}
                onCompleteQuest={() => {
                    // 交付已完成的任务：获得金币奖励 + 声望 + 清除activeQuest + 契约完成计数
                    setParty(p => {
                      if (!p.activeQuest || !p.activeQuest.isCompleted) return p;
                      const rewardGold = p.activeQuest.rewardGold;
                      const repGain = p.activeQuest.difficulty * 3 + 2; // 声望奖励：难度*3+2
                      return {
                        ...p,
                        gold: p.gold + rewardGold,
                        reputation: p.reputation + repGain,
                        activeQuest: null,
                        ambitionState: {
                          ...p.ambitionState,
                          contractsCompleted: (p.ambitionState.contractsCompleted || 0) + 1,
                        },
                      };
                    });
                }}
                onAcceptQuest={(q) => {
                    // 为不同任务类型生成接取时的绑定数据
                    let linkedQuest = { ...q };
                    if (q.type === 'HUNT' && q.targetEntityName) {
                        const sourceCity = cities.find(c => c.id === q.sourceCityId);
                        const cx = sourceCity?.x ?? party.x;
                        const cy = sourceCity?.y ?? party.y;
                        let bestDist = Infinity;
                        let bestId: string | undefined;
                        for (const ent of entities) {
                            if (ent.faction !== 'HOSTILE') continue;
                            if (ent.name !== q.targetEntityName) continue;
                            const d = Math.hypot(ent.x - cx, ent.y - cy);
                            if (d < bestDist) { bestDist = d; bestId = ent.id; }
                        }
                        
                        const MAX_QUEST_DIST = 10; // 任务目标最大距离（缩小搜索范围确保目标在附近）
                        if (bestId && bestDist <= MAX_QUEST_DIST) {
                            // 附近有匹配的敌人，直接绑定
                            linkedQuest.targetEntityId = bestId;
                        } else {
                            // 附近没有匹配的敌人，在城市附近生成一个任务专属目标
                            const spawnDist = 3 + Math.random() * 5; // 距城市3-8格（确保任务目标在附近）
                            const spawnAngle = Math.random() * Math.PI * 2;
                            const spawnX = Math.max(1, Math.min(MAP_SIZE - 2, cx + Math.cos(spawnAngle) * spawnDist));
                            const spawnY = Math.max(1, Math.min(MAP_SIZE - 2, cy + Math.sin(spawnAngle) * spawnDist));
                            const questEntId = `quest-target-${q.id}-${Date.now()}`;
                            
                            // 根据目标名称推断实体类型
                            const beastNames = ['北疆狼群', '雪狼', '冻土野狼'];
                            const isBeast = beastNames.includes(q.targetEntityName);
                            const entityType = isBeast ? 'BEAST' : 'BANDIT';
                            const worldAIType = isBeast ? 'BEAST' : 'BANDIT';
                            
                            const newEntity: WorldEntity = {
                                id: questEntId,
                                name: q.targetEntityName,
                                type: entityType as any,
                                faction: 'HOSTILE',
                                x: spawnX,
                                y: spawnY,
                                targetX: null,
                                targetY: null,
                                speed: 0.6 + Math.random() * 0.3,
                                aiState: 'WANDER',
                                homeX: spawnX,
                                homeY: spawnY,
                                worldAIType: worldAIType as any,
                                alertRadius: 4,
                                chaseRadius: 8,
                                isQuestTarget: true,
                                wanderCooldown: Math.random() * 5,
                                territoryRadius: 4 + Math.random() * 3,
                            };
                            setEntities(prev => [...prev, newEntity]);
                            linkedQuest.targetEntityId = questEntId;
                        }
                    }
                    if (q.type === 'PATROL') {
                        const sourceCity = cities.find(c => c.id === q.sourceCityId);
                        const cx = sourceCity?.x ?? party.x;
                        const cy = sourceCity?.y ?? party.y;
                        const patrolDistBase = 6 + q.difficulty * 1.5 + Math.random() * 3;
                        let patrolX = cx;
                        let patrolY = cy;
                        let found = false;

                        for (let i = 0; i < 20; i++) {
                          const angle = Math.random() * Math.PI * 2;
                          const dist = patrolDistBase + (Math.random() - 0.5) * 2;
                          const tryX = Math.max(2, Math.min(MAP_SIZE - 3, cx + Math.cos(angle) * dist));
                          const tryY = Math.max(2, Math.min(MAP_SIZE - 3, cy + Math.sin(angle) * dist));
                          const tile = tiles[Math.floor(tryY) * MAP_SIZE + Math.floor(tryX)];
                          if (!tile || tile.type === 'MOUNTAIN' || tile.type === 'CITY') continue;
                          patrolX = tryX;
                          patrolY = tryY;
                          found = true;
                          break;
                        }

                        if (!found) {
                          patrolX = Math.max(2, Math.min(MAP_SIZE - 3, cx + 5));
                          patrolY = cy;
                        }

                        const dx = patrolX - cx;
                        const dy = patrolY - cy;
                        const dir = Math.abs(dx) > Math.abs(dy)
                          ? (dx >= 0 ? '东侧' : '西侧')
                          : (dy >= 0 ? '南侧' : '北侧');
                        const patrolKillsRequired = q.patrolKillsRequired ?? (q.difficulty === 1 ? 4 : q.difficulty === 2 ? 6 : 8);
                        const patrolRadius = 1.2 + q.difficulty * 0.4;

                        linkedQuest = {
                          ...linkedQuest,
                          targetEntityId: undefined,
                          patrolTargetX: patrolX,
                          patrolTargetY: patrolY,
                          patrolTargetName: `${sourceCity?.name || '城镇'}${dir}官道`,
                          patrolRadius,
                          patrolKillsRequired,
                          patrolKillsDone: 0,
                          patrolArrived: false,
                        };

                        if (q.targetEntityName) {
                          const patrolPackCount = q.difficulty >= 2 ? 2 : 1;
                          const beastNames = ['北疆狼群', '雪狼', '冻土野狼'];
                          const isBeast = beastNames.includes(q.targetEntityName);
                          const entityType = isBeast ? 'BEAST' : 'BANDIT';
                          const worldAIType = isBeast ? 'BEAST' : 'BANDIT';
                          const spawned: WorldEntity[] = [];

                          for (let i = 0; i < patrolPackCount; i++) {
                            const spawnAngle = Math.random() * Math.PI * 2;
                            const spawnDist = 0.8 + Math.random() * 1.6;
                            const spawnX = Math.max(1, Math.min(MAP_SIZE - 2, patrolX + Math.cos(spawnAngle) * spawnDist));
                            const spawnY = Math.max(1, Math.min(MAP_SIZE - 2, patrolY + Math.sin(spawnAngle) * spawnDist));
                            spawned.push({
                              id: `patrol-hostile-${q.id}-${Date.now()}-${i}`,
                              name: q.targetEntityName,
                              type: entityType as any,
                              faction: 'HOSTILE',
                              x: spawnX,
                              y: spawnY,
                              targetX: null,
                              targetY: null,
                              speed: 0.58 + Math.random() * 0.22,
                              aiState: 'WANDER',
                              homeX: patrolX,
                              homeY: patrolY,
                              worldAIType: worldAIType as any,
                              alertRadius: 4,
                              chaseRadius: 8,
                              wanderCooldown: Math.random() * 4,
                              territoryRadius: 3 + Math.random() * 2,
                            });
                          }
                          if (spawned.length > 0) {
                            setEntities(prev => [...prev, ...spawned]);
                          }
                        }
                    }
                    if (q.type === 'ESCORT') {
                        const sourceCity = cities.find(c => c.id === q.sourceCityId);
                        if (sourceCity) {
                            const destinationCity = cities
                                .filter(c => c.id !== sourceCity.id)
                                .sort((a, b) => {
                                    const da = Math.hypot(a.x - sourceCity.x, a.y - sourceCity.y);
                                    const db = Math.hypot(b.x - sourceCity.x, b.y - sourceCity.y);
                                    return da - db;
                                })[0];
                            if (destinationCity) {
                                const escortEntityId = `escort-trader-${q.id}-${Date.now()}`;
                                const escortEntity: WorldEntity = {
                                    id: escortEntityId,
                                    name: '护送商队',
                                    type: 'TRADER',
                                    faction: 'NEUTRAL',
                                    x: sourceCity.x,
                                    y: sourceCity.y,
                                    targetX: destinationCity.x,
                                    targetY: destinationCity.y,
                                    speed: 0.52,
                                    aiState: 'TRAVEL',
                                    homeX: sourceCity.x,
                                    homeY: sourceCity.y,
                                    worldAIType: 'TRADER',
                                    alertRadius: 5,
                                    chaseRadius: 8,
                                    linkedCityId: sourceCity.id,
                                    destinationCityId: destinationCity.id,
                                    wanderCooldown: 0,
                                };
                                setEntities(prev => [...prev, escortEntity]);
                                linkedQuest.targetEntityId = escortEntityId;
                                linkedQuest.targetCityId = destinationCity.id;
                                linkedQuest.targetCityName = destinationCity.name;
                            }
                        }
                    }
                    if (q.type === 'DELIVERY') {
                        const sourceCity = cities.find(c => c.id === q.sourceCityId);
                        const fromX = sourceCity?.x ?? party.x;
                        const fromY = sourceCity?.y ?? party.y;
                        const destinationCity = cities
                          .filter(c => c.id !== (sourceCity?.id || q.sourceCityId))
                          .sort((a, b) => {
                            const da = Math.hypot(a.x - fromX, a.y - fromY);
                            const db = Math.hypot(b.x - fromX, b.y - fromY);
                            return da - db;
                          })[0];
                        if (destinationCity) {
                          linkedQuest.targetCityId = destinationCity.id;
                          linkedQuest.targetCityName = destinationCity.name;
                        }
                    }
                    setParty(p => ({ ...p, activeQuest: linkedQuest }));
                }}
            />
        )}

        {/* Post-Combat UI / Interaction Dialogs */}
        {/* ===== 存档/读档面板 ===== */}
        {saveLoadMode && (
          <SaveLoadPanel
            mode={saveLoadMode}
            onSave={(slot) => saveGame(slot)}
            onLoad={(slot) => loadGame(slot)}
            onClose={() => setSaveLoadMode(null)}
          />
        )}

        {/* 联系我们面板 */}
        {showContact && (
          <ContactModal onClose={() => setShowContact(false)} />
        )}

        <ConfirmDialog
          open={showReturnMainMenuConfirm}
          title="返回主菜单"
          message="返回主菜单将结束当前游戏，未保存的进度会丢失。确定继续？"
          confirmText="确定返回"
          cancelText="继续游戏"
          onCancel={() => setShowReturnMainMenuConfirm(false)}
          onConfirm={() => {
            setShowReturnMainMenuConfirm(false);
            setView('MAIN_MENU');
          }}
        />

        {/* ===== 野心目标选择弹窗 ===== */}
        {showAmbitionPopup && !preCombatEntity && !saveLoadMode && (
          <AmbitionSelect
            party={party}
            onSelect={handleAmbitionSelect}
            onSelectNoAmbition={handleAmbitionNoAmbition}
          />
        )}

        {/* ===== 野心通知横幅 ===== */}
        {ambitionNotification && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[200] animate-pulse">
            <div className="bg-[#1a110a]/95 border border-amber-600/60 px-6 py-3 shadow-2xl backdrop-blur-sm">
              <p className="text-amber-400 text-sm font-bold tracking-wider text-center">
                {ambitionNotification}
              </p>
            </div>
          </div>
        )}

        {/* ===== 玩法提示浮窗 ===== */}
        <GameTip tip={activeTip} onDismiss={handleTipDismiss} />

        {preCombatEntity && (
            <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-10">
                <div className="w-full max-w-md bg-[#1a110a] border border-amber-900/50 p-8 shadow-2xl relative">
                    <div className="absolute inset-0 opacity-10 pointer-events-none" style={{backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(139,69,19,0.3) 2px, rgba(139,69,19,0.3) 4px)'}} />
                    <h2 className="text-2xl font-bold text-amber-500 mb-4 tracking-widest text-center">
                      {preCombatEntity.isBossEntity ? `发现 ${preCombatEntity.name}` : `遭遇 ${preCombatEntity.name}`}
                    </h2>
                    <p className="text-slate-400 text-center mb-8 italic">
                      {preCombatEntity.isBossEntity
                        ? `你已深入${preCombatEntity.name}的腹地，前方的守卫已经发现了你。`
                        : `一支${preCombatEntity.name}正在逼近，由于距离过近，战斗已不可避免。`}
                    </p>
                    <div className="flex flex-col gap-3">
                        <button 
                            onClick={() => { startCombat(preCombatEntity); setPreCombatEntity(null); }}
                            className="w-full py-3 bg-amber-800 hover:bg-amber-600 text-white font-bold tracking-[0.3em] uppercase transition-all shadow-lg border border-amber-500"
                        >
                            进入战场
                        </button>
                        <button 
                            onClick={() => { setPreCombatEntity(null); setTimeScale(0); }}
                            className="w-full py-2 text-slate-500 hover:text-slate-300 text-xs uppercase tracking-widest transition-all"
                        >
                            尝试交涉 (暂不可用)
                        </button>
                    </div>
                </div>
            </div>
        )}
      </main>
    </div>
  );
};
