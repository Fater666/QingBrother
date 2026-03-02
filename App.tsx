
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GameView, Party, WorldTile, CombatState, MoraleStatus, Character, CombatUnit, WorldEntity, City, CityFacility, Quest, WorldAIType, OriginConfig, BattleResult, Item, AIType, EnemyUnitType, EnemyAIConfigFlag, AmbitionState, EnemyCamp, CampRegion, GameDifficulty } from './types.ts';
import { MAP_SIZE, WEAPON_TEMPLATES, ARMOR_TEMPLATES, SHIELD_TEMPLATES, HELMET_TEMPLATES, TERRAIN_DATA, CITY_NAMES, SURNAMES, NAMES_MALE, BACKGROUNDS, BackgroundTemplate, QUEST_FLAVOR_TEXTS, VISION_RADIUS, CONSUMABLE_TEMPLATES, assignTraits, getTraitStatMods, TRAIT_TEMPLATES, UNIQUE_WEAPON_TEMPLATES, UNIQUE_ARMOR_TEMPLATES, UNIQUE_HELMET_TEMPLATES, UNIQUE_SHIELD_TEMPLATES, getDifficultyTier, TIERED_ENEMY_COMPOSITIONS, GOLD_REWARDS, CAMP_TEMPLATES_DATA, BOSS_CAMP_CONFIGS, checkLevelUp, getPerkEffect, BANNER_AMBITION_ID, BANNER_WEAPON_ID, isBannerWeapon, BEAST_QUEST_TARGET_NAMES, getIncomeMultiplierByDifficulty, getEnemyCountMultiplierByDifficulty, getEnemyStatMultiplierByDifficulty, rollLegendaryHero } from './constants';
import { applyStudentXPBonus, applyFortifiedMind, applyBrawny } from './services/perkService';
import { WorldMap } from './components/WorldMap.tsx';
import { CombatView } from './components/CombatView.tsx';
import { SquadManagement } from './components/SquadManagement.tsx';
import { CityView } from './components/CityView.tsx';
import { MainMenu } from './components/MainMenu.tsx';
import { Prologue } from './components/Prologue.tsx';
import { OriginSelect, ORIGIN_CONFIGS } from './components/OriginSelect.tsx';
import { BattleResultView } from './components/BattleResultView.tsx';
import { SaveLoadPanel, getSaveSlotKey, getAllSaveMetas, saveMetas, hasAnySaveData, SaveSlotMeta, getAutoSaveKey, saveAutoMeta } from './components/SaveLoadPanel.tsx';
import { updateWorldEntityAI, generateRoadPatrolPoints, generateCityPatrolPoints } from './services/worldMapAI.ts';
import { generateWorldMap, getBiome, BIOME_CONFIGS, generateCityMarket, rollPriceModifier, generateCityQuests } from './services/mapGenerator.ts';
import { calculateRecruitHireCost } from './services/recruitPricing.ts';
import { AmbitionSelect } from './components/AmbitionSelect.tsx';
import { ContactModal } from './components/ContactModal.tsx';
import { ConfirmDialog } from './components/ConfirmDialog.tsx';
import { DEFAULT_AMBITION_STATE, selectAmbition, selectNoAmbition, completeAmbition, cancelAmbition, checkAmbitionComplete, shouldShowAmbitionSelect } from './services/ambitionService.ts';
import { GameTip } from './components/GameTip.tsx';
import { GameTipData, GAME_TIPS, markTipShown } from './services/tipService.ts';
import { GMPanel } from './components/GMPanel.tsx';

const BGM_VOLUME_STORAGE_KEY = 'zhanguo_bgm_volume';
const DIFFICULTY_OPTIONS: { value: GameDifficulty; label: string }[] = [
  { value: 'EASY', label: '简单' },
  { value: 'NORMAL', label: '普通' },
  { value: 'HARD', label: '困难' },
  { value: 'EXPERT', label: '专家' },
];

const ENEMY_TYPE_LABELS: Record<string, string> = {
  BANDIT: '匪徒',
  BEAST: '野兽',
  ARMY: '军士',
  NOMAD: '游骑',
  CULT: '教团',
  TRADER: '商队',
  QUEST_TARGET: '任务目标',
};

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

const createMercenary = (id: string, fixedName?: string, forcedBgKey?: string, formationIndex: number | null = null, forcedTraits?: string[], forcedStars?: Character['stars'], legendaryStory?: string): Character => {
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
  const traits = forcedTraits || assignTraits(bgKey!);
  const traitMods = getTraitStatMods(traits);

  const baseHp = roll(50, 70) + rollMod(bg.hpMod) + traitMods.hpMod;
  const baseFat = roll(90, 110) + rollMod(bg.fatigueMod) + traitMods.fatigueMod;
  const baseRes = roll(30, 50) + rollMod(bg.resolveMod) + traitMods.resolveMod;
  const baseInit = roll(100, 110) + rollMod(bg.initMod) + traitMods.initMod;
  const baseMSkill = roll(47, 57) + rollMod(bg.meleeSkillMod) + traitMods.meleeSkillMod;
  const baseRSkill = roll(37, 47) + rollMod(bg.rangedSkillMod) + traitMods.rangedSkillMod;
  const baseMDef = roll(0, 5) + rollMod(bg.defMod) + traitMods.meleeDefMod;
  const baseRDef = roll(0, 5) + rollMod(bg.defMod) + traitMods.rangedDefMod;

  let stars: Character['stars'];
  if (forcedStars) {
    stars = { ...forcedStars };
  } else {
    const starKeys: (keyof Character['stars'])[] = [
      'meleeSkill', 'rangedSkill', 'meleeDefense', 'rangedDefense',
      'resolve', 'initiative', 'hp', 'fatigue',
    ];
    const bgModMap: Record<string, [number, number]> = {
      meleeSkill: bg.meleeSkillMod, rangedSkill: bg.rangedSkillMod,
      meleeDefense: bg.defMod, rangedDefense: bg.defMod,
      resolve: bg.resolveMod, initiative: bg.initMod,
      hp: bg.hpMod, fatigue: bg.fatigueMod,
    };

    const getModMedian = (mod: [number, number]) => (mod[0] + mod[1]) / 2;
    const starWeight = (key: string) => {
      const median = getModMedian(bgModMap[key]);
      if (median >= 15) return 4;
      if (median >= 8) return 2;
      if (median < 0) return 0.3;
      return 1;
    };

    const starCountRoll = Math.random() * 100;
    const starCount = starCountRoll < 15 ? 0 : starCountRoll < 40 ? 1 : starCountRoll < 70 ? 2 : starCountRoll < 90 ? 3 : 4;

    const chosenStarKeys = new Set<string>();
    const pool = [...starKeys];
    for (let i = 0; i < starCount && pool.length > 0; i++) {
      const weights = pool.map(k => starWeight(k));
      const total = weights.reduce((a, b) => a + b, 0);
      let r = Math.random() * total;
      let picked = pool.length - 1;
      for (let j = 0; j < pool.length; j++) {
        r -= weights[j];
        if (r <= 0) { picked = j; break; }
      }
      chosenStarKeys.add(pool[picked]);
      pool.splice(picked, 1);
    }

    const rollStarLevel = (key: string): number => {
      const median = getModMedian(bgModMap[key]);
      const r = Math.random() * 100;
      if (median >= 15) return r < 20 ? 3 : r < 60 ? 2 : 1;
      return r < 10 ? 3 : r < 40 ? 2 : 1;
    };

    stars = {} as Character['stars'];
    for (const key of starKeys) {
      stars[key] = chosenStarKeys.has(key) ? rollStarLevel(key) : 0;
    }
  }

  let weaponPool = WEAPON_TEMPLATES.filter(w => w.value < 400 && w.rarity !== 'UNIQUE' && !isBannerWeapon(w));
  const weapon = weaponPool[Math.floor(Math.random() * weaponPool.length)];
  const armor = Math.random() > 0.4 ? ARMOR_TEMPLATES[Math.floor(Math.random() * 2)] : null;
  const helmet = Math.random() > 0.6 ? HELMET_TEMPLATES[Math.floor(Math.random() * 2)] : null;

  // 计算薪资和雇佣费用（与地图生成共用同一套定价逻辑）
  const { salary, hireCost } = calculateRecruitHireCost(bg.salaryMult, traits, TRAIT_TEMPLATES);

  return {
    id, name, background: bg.name, backgroundStory: legendaryStory || bg.desc, level: 1, xp: 0, hp: baseHp, maxHp: baseHp, fatigue: 0,
    maxFatigue: baseFat, morale: MoraleStatus.STEADY,
    stats: { meleeSkill: baseMSkill, rangedSkill: baseRSkill, meleeDefense: baseMDef, rangedDefense: baseRDef, resolve: baseRes, initiative: baseInit },
    stars,
    traits, perks: [], perkPoints: 0, pendingLevelUps: 0,
    equipment: { mainHand: weapon, offHand: null, armor, helmet, ammo: null, accessory: null },
    bag: [null, null, null, null], salary, hireCost, formationIndex,
    ...(legendaryStory ? { isLegendary: true } : {}),
  };
};

const generateMap = (): { tiles: WorldTile[], cities: City[] } => {
  // 使用新的柏林噪声地图生成器
  const result = generateWorldMap(MAP_SIZE, CITY_NAMES);
  console.log(`[地图生成] 种子: ${result.seed}, 城市数: ${result.cities.length}`);
  return { tiles: result.tiles, cities: result.cities };
};

const clampWorldCoord = (value: number): number => Math.max(0, Math.min(MAP_SIZE - 0.001, value));
const clampWorldTile = (value: number): number => Math.max(0, Math.min(MAP_SIZE - 1, Math.floor(value)));

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

const CHEATED_DEATH_CHANCE = 0.33;
const PERMANENT_INJURY_TRAIT_IDS = [
  'injury_skull_crack',
  'injury_broken_arm',
  'injury_broken_leg',
  'injury_missing_eye',
  'injury_deep_scar',
  'injury_crushed_ribs',
  'injury_shell_shocked',
  'injury_weak_spot',
];

// --- 战斗结果生成 ---
const generateBattleResult = (
  victory: boolean,
  survivors: CombatUnit[],
  enemyUnits: CombatUnit[],
  rounds: number,
  enemyName: string,
  playerUnitsBeforeCombat: Character[],
  bossLootIds: string[] = [],  // Boss巢穴掉落池（红装ID列表）
  isRetreat: boolean = false,
  xpMultiplier: number = 1
): BattleResult => {
  const enemiesKilled = enemyUnits.filter(u => u.isDead).length;
  // 逃离战场按“已脱离(hasEscaped)”统计，并兼容旧状态字段，避免巡逻进度漏算
  const enemiesRouted = enemyUnits.filter(u => !u.isDead && (u.hasEscaped || u.morale === MoraleStatus.FLEEING)).length;

  // 阵亡己方
  const deadPlayerIds = new Set(
    playerUnitsBeforeCombat
      .filter(m => m.formationIndex !== null)
      .filter(m => !survivors.find(s => s.id === m.id))
      .map(m => m.id)
  );

  const deadPlayers = playerUnitsBeforeCombat.filter(m => deadPlayerIds.has(m.id));
  const cheatedDeathById = new Map<string, string>();
  deadPlayers.forEach(m => {
    if (Math.random() >= CHEATED_DEATH_CHANCE) return;
    const ownedTraits = new Set(m.traits);
    const candidates = PERMANENT_INJURY_TRAIT_IDS.filter(id => !ownedTraits.has(id));
    const pool = candidates.length > 0 ? candidates : PERMANENT_INJURY_TRAIT_IDS;
    cheatedDeathById.set(m.id, pool[Math.floor(Math.random() * pool.length)]);
  });

  const trueDeadIds = new Set(
    deadPlayers
      .filter(m => !cheatedDeathById.has(m.id))
      .map(m => m.id)
  );

  const casualties = playerUnitsBeforeCombat
    .filter(m => trueDeadIds.has(m.id))
    .map(m => ({
      id: m.id,
      name: m.name,
      background: BACKGROUNDS[m.background]?.name || m.background,
    }));

  // XP 计算: 基础25 + 击杀 * 15 + 回合 * 2
  const baseXpPerSurvivor = victory ? 25 + enemiesKilled * 15 + rounds * 2 : 0;
  const xpPerSurvivor = Math.floor(baseXpPerSurvivor * Math.max(0, xpMultiplier));

  const survivorData: BattleResult['survivors'] = survivors.map(s => {
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
  deadPlayers
    .filter(m => cheatedDeathById.has(m.id))
    .forEach(m => {
      const injuryTraitId = cheatedDeathById.get(m.id)!;
      survivorData.push({
        id: m.id,
        name: m.name,
        background: BACKGROUNDS[m.background]?.name || m.background,
        hpBefore: m.hp,
        hpAfter: 1,
        maxHp: m.maxHp,
        xpGained: 0,
        cheatedDeath: true,
        injuryTraitId,
        injuryTraitName: TRAIT_TEMPLATES[injuryTraitId]?.name || '永久战伤',
      });
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
      ].filter(item => !isBannerWeapon(item));
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

    // 回收己方阵亡者装备（死里逃生者保留装备）
    deadPlayers
      .filter(m => trueDeadIds.has(m.id))
      .forEach(m => {
        const carriedItems = [
          m.equipment.mainHand,
          m.equipment.offHand,
          m.equipment.armor,
          m.equipment.helmet,
          m.equipment.ammo,
          m.equipment.accessory,
          ...m.bag,
        ].filter((item): item is Item => !!item);

        carriedItems.forEach(item => {
          if (item.value <= 0) return;
          const baseDurability = item.durability ?? item.maxDurability;
          const durabilityLoss = 0.1 + Math.random() * 0.2; // 10%-30%
          const recoveredDurability = Math.max(1, Math.floor(baseDurability * (1 - durabilityLoss)));
          lootItems.push({
            ...item,
            id: `loot-reclaim-${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            durability: item.maxDurability > 1 ? recoveredDurability : item.durability,
          });
        });
      });
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
    isRetreat,
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
interface EnemyComp {
  name: string;
  bg: string;
  aiType: AIType;
  unitType: EnemyUnitType;
  aiConfig: EnemyAIConfigFlag[];
}

export const App: React.FC = () => {
  const AUTO_SAVE_INTERVAL_MS = 120000;
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
  const patrolRespawnCooldownRef = useRef<Record<string, number>>({}); // 巡逻任务保底补位冷却

  const [party, setParty] = useState<Party>({
    x: 0, y: 0, targetX: null, targetY: null, gold: 0, food: 0,
    medicine: 0, repairSupplies: 0,
    mercenaries: [], inventory: [], day: 1.0, activeQuest: null,
    reputation: 0, ambitionState: { ...DEFAULT_AMBITION_STATE }, moraleModifier: 0,
    difficulty: 'NORMAL',
    battleXpMultiplier: 1,
    recruitCostMultiplier: 1,
    marketBuyPriceMultiplier: 1,
    worldMoveSpeedMultiplier: 1,
    dailyFoodConsumptionMultiplier: 1,
    moraleGainMultiplier: 1,
    shownTips: []
  });

  const [combatState, setCombatState] = useState<CombatState | null>(null);
  const [currentCity, setCurrentCity] = useState<City | null>(null);
  const lastUpdateRef = useRef<number>(performance.now());
  const [hasSave, setHasSave] = useState<boolean>(hasAnySaveData());
  const [saveLoadMode, setSaveLoadMode] = useState<'SAVE' | 'LOAD' | null>(null);
  const [showContact, setShowContact] = useState(false);
  const [showSystemMenu, setShowSystemMenu] = useState(false);
  const [bgmVolume, setBgmVolume] = useState<number>(() => {
    const raw = localStorage.getItem(BGM_VOLUME_STORAGE_KEY);
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.min(1, parsed));
    }
    return 0.3;
  });
  const [showReturnMainMenuConfirm, setShowReturnMainMenuConfirm] = useState(false);
  const [gmOpen, setGmOpen] = useState(false);
  const gmTapRef = useRef<{ count: number; timer: number | null }>({ count: 0, timer: null });
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
    }

    const audio = bgmRef.current;
    audio.volume = bgmVolume;
    
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
  }, [view, bgmVolume]);

  useEffect(() => {
    localStorage.setItem(BGM_VOLUME_STORAGE_KEY, String(bgmVolume));
  }, [bgmVolume]);

  // --- 从装备ID池中随机选取一件装备 ---
  const resolveItemFromPool = (ids: string[] | undefined, templates: Item[]): Item | null => {
    if (!ids || ids.length === 0) return null;
    const chosenId = ids[Math.floor(Math.random() * ids.length)];
    const found = templates.find(t => t.id === chosenId);
    return found ? { ...found } : null;
  };

  const buildBannerRewardItem = useCallback((): Item | null => {
    const bannerTemplate = WEAPON_TEMPLATES.find(w => w.id === BANNER_WEAPON_ID);
    if (!bannerTemplate) return null;
    return {
      ...bannerTemplate,
      id: `reward-${bannerTemplate.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      durability: bannerTemplate.maxDurability,
    };
  }, []);

  const pickOriginStartCity = useCallback((origin: OriginConfig, mapCities: City[]): City => {
    const pool = origin.startBiomePool || [];
    const filtered = mapCities.filter(c => pool.includes(c.biome));
    if (filtered.length > 0) {
      return filtered[Math.floor(Math.random() * filtered.length)];
    }
    return mapCities[Math.floor(Math.random() * mapCities.length)] || mapCities[0];
  }, []);

  // --- 新战役：根据起源生成初始队伍 ---
  const initGameWithOrigin = useCallback((
    origin: OriginConfig,
    name: string,
    mapData: { tiles: WorldTile[], cities: City[] },
    difficulty: GameDifficulty,
    startCityOverride?: City
  ) => {
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

    const startCity = startCityOverride || pickOriginStartCity(origin, mapData.cities);
    const modifiers = origin.modifiers || {};
    setParty({
      x: startCity.x, y: startCity.y,
      targetX: null, targetY: null,
      gold: origin.gold, food: origin.food,
      medicine: 40,          // 2个金创药 × 20 = 40
      repairSupplies: 50,    // 1个修甲工具 × 50 = 50
      mercenaries: mercs,
      inventory: [], day: 1.0, activeQuest: null,
      reputation: 0, ambitionState: { ...DEFAULT_AMBITION_STATE },
      moraleModifier: modifiers.initialMoraleModifier ?? 0,
      difficulty,
      originId: origin.id,
      originName: origin.name,
      battleXpMultiplier: modifiers.battleXpMultiplier ?? 1,
      recruitCostMultiplier: modifiers.recruitCostMultiplier ?? 1,
      marketBuyPriceMultiplier: modifiers.marketBuyPriceMultiplier ?? 1,
      worldMoveSpeedMultiplier: modifiers.worldMoveSpeedMultiplier ?? 1,
      dailyFoodConsumptionMultiplier: modifiers.dailyFoodConsumptionMultiplier ?? 1,
      moraleGainMultiplier: modifiers.moraleGainMultiplier ?? 1,
      shownTips: []
    });
    lastProcessedDayRef.current = 1; // 新游戏从第1天开始
    setGameInitialized(true);
    setTimeScale(0);
  }, [pickOriginStartCity]);

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

  const canApplyPositiveMoraleGain = useCallback((multiplier?: number): boolean => {
    const rate = Math.max(0, multiplier ?? 1);
    if (rate >= 1) return true;
    return Math.random() < rate;
  }, []);

  // --- SAVE & LOAD SYSTEM (多栏位 + 自动存档) ---
  const buildSaveData = useCallback(() => ({
    tiles,
    cities,
    entities,
    camps,
    party,
    day: party.day,
    view: view === 'COMBAT' ? 'WORLD_MAP' : view, // 不保存战斗状态，退回地图
  }), [tiles, cities, entities, camps, party, view]);

  const writeSaveData = useCallback((saveData: ReturnType<typeof buildSaveData>, slotIndex: number, isAuto = false) => {
    if (isAuto) {
      localStorage.setItem(getAutoSaveKey(), JSON.stringify(saveData));
      const autoMeta: SaveSlotMeta = {
        slotIndex: -1,
        timestamp: Date.now(),
        day: party.day,
        gold: party.gold,
        mercCount: party.mercenaries.length,
        leaderName: party.mercenaries[0]?.name || '无名',
        view: saveData.view as string,
      };
      saveAutoMeta(autoMeta);
      return;
    }

    localStorage.setItem(getSaveSlotKey(slotIndex), JSON.stringify(saveData));
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
  }, [party.day, party.gold, party.mercenaries]);

  const saveGame = useCallback((slotIndex: number) => {
    const saveData = buildSaveData();
    try {
      writeSaveData(saveData, slotIndex, false);
      setHasSave(true);
    } catch {
      alert("简牍告罄，无法刻录（存档失败）。");
    }
  }, [buildSaveData, writeSaveData]);

  const autoSaveGame = useCallback((trigger: 'combat' | 'timer') => {
    const saveData = buildSaveData();
    try {
      writeSaveData(saveData, -1, true);
      setHasSave(true);
      if (trigger === 'combat') {
        console.info('自动存档：战斗触发');
      }
    } catch {
      // 自动存档失败不打断流程，避免战斗或循环中弹窗打断体验
      console.warn('自动存档失败');
    }
  }, [buildSaveData, writeSaveData]);

  const applyLoadedData = useCallback((raw: string) => {
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
    const migrateMercenary = (merc: Character): Character => {
      // 旧存档兼容：强体从“战斗入场”改为“学习时永久生效”
      // 若角色已学强体但尚未结算永久效果，则在读档时补结算一次
      let migratedMerc: Character = {
        ...merc,
        hp: Math.min(merc.hp, merc.maxHp),
        pendingLevelUps: merc.pendingLevelUps ?? Math.max(0, (merc.level || 1) - 1),
      };
      if (migratedMerc.perks?.includes('colossus') && !migratedMerc.colossusPermanentApplied) {
        const hpMult = getPerkEffect('colossus', 'hpMult', 0.25);
        const bonus = Math.floor(migratedMerc.maxHp * hpMult);
        migratedMerc = {
          ...migratedMerc,
          maxHp: migratedMerc.maxHp + bonus,
          hp: migratedMerc.hp + bonus,
          colossusPermanentApplied: true,
        };
      }
      return migratedMerc;
    };

    const loadedParty: Party = {
      ...data.party,
      medicine: migratedMedicine,
      repairSupplies: migratedRepair,
      inventory: migratedInventory,
      mercenaries: (data.party.mercenaries || []).map((merc: Character) => migrateMercenary(merc)),
      reputation: data.party.reputation ?? 0,
      ambitionState: data.party.ambitionState ?? { ...DEFAULT_AMBITION_STATE },
      moraleModifier: data.party.moraleModifier ?? 0,
      difficulty: data.party.difficulty ?? 'EASY',
      originId: data.party.originId,
      originName: data.party.originName,
      battleXpMultiplier: data.party.battleXpMultiplier ?? 1,
      recruitCostMultiplier: data.party.recruitCostMultiplier ?? 1,
      marketBuyPriceMultiplier: data.party.marketBuyPriceMultiplier ?? 1,
      worldMoveSpeedMultiplier: data.party.worldMoveSpeedMultiplier ?? 1,
      dailyFoodConsumptionMultiplier: data.party.dailyFoodConsumptionMultiplier ?? 1,
      moraleGainMultiplier: data.party.moraleGainMultiplier ?? 1,
      shownTips: data.party.shownTips ?? [],
    };
    setParty(loadedParty);
    // 同步每日消耗追踪，避免读档瞬间触发大量天数消耗
    lastProcessedDayRef.current = Math.floor(loadedParty.day);
    setGameInitialized(true);
    setView(data.view || 'WORLD_MAP');
    setTimeScale(0);
  }, []);

  const loadGame = useCallback((slotIndex: number) => {
    const raw = localStorage.getItem(getSaveSlotKey(slotIndex));
    if (!raw) return;
    try {
      applyLoadedData(raw);
    } catch {
      alert("简牍残破，无法辨识（读档失败）。");
    }
  }, [applyLoadedData]);

  const loadAutoSave = useCallback(() => {
    const raw = localStorage.getItem(getAutoSaveKey());
    if (!raw) return;
    try {
      applyLoadedData(raw);
    } catch {
      alert("自动简牍残破，无法辨识（读档失败）。");
    }
  }, [applyLoadedData]);

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

  // 自动存档：定时触发（世界地图/战斗中）
  useEffect(() => {
    if (!gameInitialized) return;
    const timer = window.setInterval(() => {
      if (saveLoadMode) return;
      if (view !== 'WORLD_MAP' && view !== 'COMBAT') return;
      autoSaveGame('timer');
    }, AUTO_SAVE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [gameInitialized, view, saveLoadMode, autoSaveGame]);

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

  const getTierCompositions = useCallback((enemyType: string, tier: number): EnemyComp[] => {
    const normalizedTier = Math.max(0, Math.min(3, Math.floor(tier)));
    const typeComps = TIERED_ENEMY_COMPOSITIONS[enemyType];
    const typeTierComps = typeComps?.[Math.min(normalizedTier, Math.max(0, (typeComps?.length || 1) - 1))] || [];
    if (typeTierComps.length > 0) return typeTierComps;
    const banditComps = TIERED_ENEMY_COMPOSITIONS['BANDIT'];
    return banditComps?.[Math.min(normalizedTier, Math.max(0, (banditComps?.length || 1) - 1))] || [];
  }, []);

  const startCombat = useCallback((entity: WorldEntity, options?: {
    disableScaling?: boolean;
    forcedTier?: number;
    customEnemyType?: string;
    customEnemyName?: string;
    keepWorldEntity?: boolean;
  }) => {
    setTimeScale(0);
    // 进入战斗前自动存档（保留战前快照）
    autoSaveGame('combat');
    
    // --- 难度曲线：根据天数决定敌人强度 ---
    const day = party.day;
    const disableScaling = options?.disableScaling ?? false;
    const dayDifficulty = getDifficultyTier(day);
    const baselineDifficulty = getDifficultyTier(1);
    const tier = disableScaling
      ? Math.max(0, Math.min(3, Math.floor(options?.forcedTier ?? 0)))
      : dayDifficulty.tier;
    const valueLimit = disableScaling ? baselineDifficulty.valueLimit : dayDifficulty.valueLimit;
    const statMult = disableScaling ? 1 : dayDifficulty.statMult;
    const enemyCountMult = disableScaling ? 1 : getEnemyCountMultiplierByDifficulty(party.difficulty);
    const enemyStatMult = disableScaling ? 1 : getEnemyStatMultiplierByDifficulty(party.difficulty);
    const encounterEnemyType = options?.customEnemyType || entity.type;
    const encounterEnemyName = options?.customEnemyName || entity.name;
    
    // Boss实体检测：如果是Boss实体，使用Boss专属编制和掉落
    const isBoss = !disableScaling && !!entity.isBossEntity;
    let bossCamp: EnemyCamp | undefined;
    if (isBoss && entity.campId) {
      bossCamp = camps.find(c => c.id === entity.campId && c.isBoss);
    }
    
    // 设置Boss掉落池
    combatBossLootIdsRef.current = bossCamp?.uniqueLootIds || [];
    combatBossCampIdRef.current = bossCamp?.id || '';
    
    // 获取当前实体类型对应的阶段编制
    let compositions: EnemyComp[];
    if (isBoss && bossCamp?.bossCompositionKey) {
      // Boss使用专属分层编制：优先当前tier，缺失时回退到可用最高tier，再回退到bandit保底
      const bossComps = TIERED_ENEMY_COMPOSITIONS[bossCamp.bossCompositionKey];
      const banditFallback = TIERED_ENEMY_COMPOSITIONS['BANDIT']?.[3] || TIERED_ENEMY_COMPOSITIONS['BANDIT']?.[0] || [];
      if (bossComps && bossComps.length > 0) {
        const targetTier = Math.max(0, Math.min(3, tier));
        const highestAvailableTier = [...bossComps.keys()]
          .reverse()
          .find(t => (bossComps[t]?.length || 0) > 0);
        const resolvedTier = (bossComps[targetTier]?.length || 0) > 0
          ? targetTier
          : (highestAvailableTier ?? 0);
        compositions = bossComps[resolvedTier] || banditFallback;
      } else {
        compositions = banditFallback;
      }
    } else {
      compositions = getTierCompositions(encounterEnemyType, tier);
    }
    if (!compositions || compositions.length === 0) return;
    
    const ENEMY_STAT_NERF = 0.95;
    const targetEnemyCount = Math.max(1, Math.round(compositions.length * enemyCountMult));
    let scaledCompositions = [...compositions];
    if (targetEnemyCount < scaledCompositions.length) {
      while (scaledCompositions.length > targetEnemyCount) {
        const removeIndex = Math.floor(Math.random() * scaledCompositions.length);
        scaledCompositions.splice(removeIndex, 1);
      }
    } else if (targetEnemyCount > scaledCompositions.length && scaledCompositions.length > 0) {
      while (scaledCompositions.length < targetEnemyCount) {
        const extra = scaledCompositions[Math.floor(Math.random() * scaledCompositions.length)];
        scaledCompositions.push(extra);
      }
    }

    const enemies: CombatUnit[] = scaledCompositions.map((comp, i) => {
      const baseChar = createMercenary(`e${i}`, comp.name, comp.bg);
      
      // BEAST类型敌人及猛虎/野猪：使用天然武器，不穿装备
      const aiConfigSet = new Set(comp.aiConfig || []);
      const isBeastCreature = comp.unitType === 'BEAST' || comp.aiType === 'BEAST';
      if (isBeastCreature) {
        const beastStatMult = statMult * ENEMY_STAT_NERF * enemyStatMult;
        // 根据不同野兽类型设置不同天然武器
        let weaponName = '利爪';
        let weaponDesc = '野兽锋利的爪子。';
        let dmgMin = 20, dmgMax = 35;
        let armorPen = 0.15, armorDmg = 0.5;
        let fatCost = 8, hitMod = 10;
        
        if (aiConfigSet.has('BEAST_TIGER')) {
          weaponName = '虎爪';
          weaponDesc = '猛虎锋利的巨爪，一击可致命。';
          dmgMin = 40; dmgMax = 65;
          armorPen = 0.35; armorDmg = 0.8;
          fatCost = 10; hitMod = 12;
          // 猛虎额外加成HP和攻击
          baseChar.maxHp = Math.floor(baseChar.maxHp * 1.35);
          baseChar.hp = baseChar.maxHp;
          baseChar.stats.meleeSkill = Math.floor(baseChar.stats.meleeSkill * 1.2);
        } else if (aiConfigSet.has('BEAST_BOAR')) {
          weaponName = '獠牙';
          weaponDesc = '野猪尖锐的獠牙，冲撞力十足。';
          dmgMin = 25; dmgMax = 40;
          armorPen = 0.2; armorDmg = 0.6;
          fatCost = 8; hitMod = 8;
          // 野猪额外HP加成（坦克型）
          baseChar.maxHp = Math.floor(baseChar.maxHp * 1.2);
          baseChar.hp = baseChar.maxHp;
        } else if (aiConfigSet.has('BEAST_ALPHA_WOLF')) {
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
        const bossEquipValueMultiplier = 1.3;
        const effectiveValueLimit = isBoss ? Math.floor(valueLimit * bossEquipValueMultiplier) : valueLimit;
        const effectiveEquipTier = isBoss ? Math.min(3, tier + 1) : tier;
        const equip = getEquipmentForAIType(comp.aiType, effectiveValueLimit, effectiveEquipTier);
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
      // Boss实体给予适度属性增益，主要难度仍来自编制规模与装备质量
      const nerfedStatMult = statMult * ENEMY_STAT_NERF * enemyStatMult;
      const effectiveMult = isBoss ? Math.max(1.3, nerfedStatMult * 1.08) : nerfedStatMult;
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
      const bossMoraleBonus = isBoss ? 0.25 : 0;
      const confidentChance = Math.min(0.9, confidentBaseChance + confidentBonus + bossMoraleBonus);
      if (comp.aiType === 'BERSERKER') {
        enemyStartMorale = MoraleStatus.CONFIDENT;
      } else if (Math.random() < confidentChance) {
        enemyStartMorale = MoraleStatus.CONFIDENT;
      }

      const enemyR = i - Math.floor(scaledCompositions.length / 2);
      // 轴坐标里 r 变化会带来 x 偏移，这里对 q 做补偿，让开局队列在屏幕上更接近竖直
      const enemyQ = 5 - Math.trunc(enemyR / 2);
      // 计算装备负重惩罚（护甲+头盔的 maxFatiguePenalty 减少最大体力）
      const enemyEquipPenalty = (baseChar.equipment.armor?.maxFatiguePenalty || 0) + (baseChar.equipment.helmet?.maxFatiguePenalty || 0);
      return {
        ...baseChar,
        maxFatigue: baseChar.maxFatigue - enemyEquipPenalty,
        team: 'ENEMY' as const,
        // 敌我左右平行且竖直：敌方在右侧纵列，围绕中心线展开
        combatPos: { q: enemyQ, r: enemyR },
        currentAP: 9,
        isDead: false,
        crossbowLoaded: true,
        isShieldWall: false,
        isHalberdWall: false,
        movedThisTurn: false,
        waitCount: 0,
        freeSwapUsed: false,
        hasUsedFreeAttack: false,
        aiType: comp.aiType,
        unitType: comp.unitType,
        aiConfig: comp.aiConfig,
        morale: enemyStartMorale
      };
    });
    
    // 根据士气修正决定开场士气状态
    const startMorale = party.moraleModifier > 0 ? MoraleStatus.CONFIDENT
      : party.moraleModifier < 0 ? MoraleStatus.WAVERING
      : MoraleStatus.STEADY;
    
    const playerUnits: CombatUnit[] = party.mercenaries.filter(m => m.formationIndex !== null).map((m, idx) => {
        // 三排映射：前/中/后分别是基础 q=-2/-3/-4，r 由列号映射到中心线
        const row = Math.floor(m.formationIndex! / 9); // 0=前排, 1=中排, 2=后排
        const col = m.formationIndex! % 9;
        const r = col - 4; // 不再 clamp，每个编队位置映射到唯一的 r（-4 到 4）
        // 轴坐标补偿：抵消 r 带来的横向偏移，让列在视觉上更竖直
        const q = -2 - row - Math.trunc(r / 2);
        // 计算装备负重惩罚（护甲+头盔的 maxFatiguePenalty 减少最大体力）
        const equipFatiguePenalty = (m.equipment.armor?.maxFatiguePenalty || 0) + (m.equipment.helmet?.maxFatiguePenalty || 0);
        let unit: CombatUnit = { ...m, maxFatigue: m.maxFatigue - equipFatiguePenalty, morale: startMorale, team: 'PLAYER' as const, combatPos: { q, r }, currentAP: 9, isDead: false, crossbowLoaded: true, isShieldWall: false, isHalberdWall: false, movedThisTurn: false, waitCount: 0, freeSwapUsed: false, hasUsedFreeAttack: false };
        const isBannerman = isBannerWeapon(unit.equipment.mainHand);
        unit = { ...unit, isBannerman, bannerAuraActive: isBannerman };
        // === 入场被动：应用专精效果 ===
        // 强体(colossus)改为”学习时永久生效”，不再在战斗入场时临时加成
        unit = applyFortifiedMind(unit);  // 定胆：+25% 胆识
        unit = applyBrawny(unit);         // 负重者：减少护甲疲劳惩罚（加回30%）
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
    
    combatEnemyNameRef.current = encounterEnemyName;
    combatEntityIdRef.current = options?.keepWorldEntity ? '' : entity.id;
    setCombatState({
      units: allUnits, 
      turnOrder: sortedTurnOrder,
      currentUnitIndex: 0, 
      round: 1, 
      combatLog: [disableScaling
        ? `GM战斗开始：${encounterEnemyName}（固定T${tier}编制）`
        : `与 ${encounterEnemyName} 激战开始！（第${Math.floor(day)}天，${['初期', '中期', '后期', '末期'][tier]}难度）`], 
      terrainType: worldTerrain,
      factionTactics: encounterEnemyType
    });
    if (!options?.keepWorldEntity) {
      setEntities(prev => prev.filter(e => e.id !== entity.id));
    }
    // 巢穴计数减少
    if (!options?.keepWorldEntity && entity.campId) {
      setCamps(prev => prev.map(c => c.id === entity.campId ? { ...c, currentAlive: Math.max(0, c.currentAlive - 1) } : c));
    }
    // 士气修正已应用到开场士气，重置为0
    if (party.moraleModifier !== 0) {
      setParty(p => ({ ...p, moraleModifier: 0 }));
    }
    setView('COMBAT');
  }, [party.mercenaries, party.x, party.y, party.day, party.moraleModifier, party.difficulty, tiles, camps, autoSaveGame, getTierCompositions]);

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
                const step = 1.8 * (party.worldMoveSpeedMultiplier ?? 1) * timeScale * dt;
                const ratio = Math.min(1, step / dist);
                setParty(p => ({
                  ...p,
                  x: clampWorldCoord(p.x + dx * ratio),
                  y: clampWorldCoord(p.y + dy * ratio),
                  day: p.day + 0.0015 * timeScale
                }));
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
            const foodCost = Math.ceil(headcount * 1.5 * (p.dailyFoodConsumptionMultiplier ?? 1));
            const newFood = Math.max(0, p.food - foodCost);
            const isStarving = newFood <= 0;

            // === 每日工资扣除 ===
            const totalWagesBase = p.mercenaries.reduce((sum, m) => sum + m.salary, 0);
            const totalWages = Math.ceil(totalWagesBase * 1.3); // 每日工资消耗提高30%
            const newGold = Math.max(0, p.gold - totalWages);
            const isUnderpaid = p.gold < totalWages; // 工资支付不足：触发下次战斗士气低落
            if (isUnderpaid && headcount > 0) wagePenaltyTriggered = true;

            // === 医药资源池消耗：每个受伤佣兵消耗5点medicine，获得额外5HP恢复 ===
            let remainingMedicine = p.medicine;

            // === 修甲资源池消耗：每件受损装备消耗3点repairSupplies，修复10点耐久 ===
            let remainingRepair = p.repairSupplies;

            // 自然恢复 + 自动修复装备
            const updatedMercs = p.mercenaries.map(m => {
              // 防御性修正：历史存档可能存在 hp > maxHp（旧版强体回写导致）
              let updated = m.hp > m.maxHp ? { ...m, hp: m.maxHp } : m;
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
                  recruits: (() => {
                    const recruitedLegendaryNames = party.mercenaries
                      .filter(m => m.isLegendary)
                      .map(m => m.name);
                    const usedNames: string[] = [...recruitedLegendaryNames];
                    return Array.from({ length: 4 }).map((_, j) => {
                      const hero = rollLegendaryHero(usedNames);
                      if (hero) {
                        usedNames.push(hero.name);
                        return createMercenary(`rec-${c.id}-${currentDay}-${j}`, hero.name, hero.bgKey, null, hero.traits, hero.stars, hero.story);
                      }
                      return createMercenary(`rec-${c.id}-${currentDay}-${j}`);
                    });
                  })(),
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
            const activeHuntQuest = party.activeQuest && party.activeQuest.type === 'HUNT' && !party.activeQuest.isCompleted
              ? party.activeQuest
              : null;
            const activePatrolQuest = party.activeQuest && party.activeQuest.type === 'PATROL' && !party.activeQuest.isCompleted
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
                const protectedHuntTargetA = !!activeHuntQuest?.targetEntityId && a.id === activeHuntQuest.targetEntityId;
                const protectedHuntTargetB = !!activeHuntQuest?.targetEntityId && b.id === activeHuntQuest.targetEntityId;

                if (a.type === 'ARMY' && isHostileB && !protectedHuntTargetB) {
                  toRemoveIds.add(b.id);
                  if (b.campId) campDecrements.set(b.campId, (campDecrements.get(b.campId) || 0) + 1);
                  continue;
                }
                if (b.type === 'ARMY' && isHostileA && !protectedHuntTargetA) {
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

            // 巡逻任务保底：到达巡逻区后，若区域内无敌方可战单位，则补位至少 1 个
            if (
              activePatrolQuest &&
              activePatrolQuest.patrolArrived &&
              typeof activePatrolQuest.patrolTargetX === 'number' &&
              typeof activePatrolQuest.patrolTargetY === 'number'
            ) {
              const respawnCooldownDays = 0.08; // 约两个小时游戏内时间
              const lastRespawnDay = patrolRespawnCooldownRef.current[activePatrolQuest.id] ?? -Infinity;
              if (party.day - lastRespawnDay >= respawnCooldownDays) {
                const patrolX = activePatrolQuest.patrolTargetX;
                const patrolY = activePatrolQuest.patrolTargetY;
                const patrolRadius = activePatrolQuest.patrolRadius ?? 1.4;
                const hasHostileInPatrolArea = updatedEntities.some(ent =>
                  !toRemoveIds.has(ent.id) &&
                  ent.faction === 'HOSTILE' &&
                  Math.hypot(ent.x - patrolX, ent.y - patrolY) <= patrolRadius + 1.6
                );
                if (!hasHostileInPatrolArea) {
                  const isBeast = !!activePatrolQuest.targetEntityName && BEAST_QUEST_TARGET_NAMES.has(activePatrolQuest.targetEntityName);
                  const entityType: WorldEntity['type'] = isBeast ? 'BEAST' : 'BANDIT';
                  const worldAIType: WorldAIType = isBeast ? 'BEAST' : 'BANDIT';
                  const spawnAngle = Math.random() * Math.PI * 2;
                  const spawnDist = 0.6 + Math.random() * 1.2;
                  const spawnX = Math.max(1, Math.min(MAP_SIZE - 2, patrolX + Math.cos(spawnAngle) * spawnDist));
                  const spawnY = Math.max(1, Math.min(MAP_SIZE - 2, patrolY + Math.sin(spawnAngle) * spawnDist));
                  updatedEntities.push({
                    id: `patrol-hostile-respawn-${activePatrolQuest.id}-${Date.now()}`,
                    name: activePatrolQuest.targetEntityName || '流窜匪众',
                    type: entityType,
                    faction: 'HOSTILE',
                    x: spawnX,
                    y: spawnY,
                    targetX: null,
                    targetY: null,
                    speed: 0.58 + Math.random() * 0.22,
                    aiState: 'WANDER',
                    homeX: patrolX,
                    homeY: patrolY,
                    worldAIType,
                    alertRadius: 4,
                    chaseRadius: 8,
                    wanderCooldown: Math.random() * 4,
                    territoryRadius: 3 + Math.random() * 2,
                  });
                  patrolRespawnCooldownRef.current[activePatrolQuest.id] = party.day;
                }
              }
            } else {
              patrolRespawnCooldownRef.current = {};
            }

            // 讨伐任务保底：如果目标被剿灭/丢失，为当前任务重绑或补刷目标
            if (activeHuntQuest && activeHuntQuest.targetEntityName) {
              const hasBoundTarget =
                !!activeHuntQuest.targetEntityId &&
                updatedEntities.some(e => e.id === activeHuntQuest.targetEntityId && !toRemoveIds.has(e.id));

              if (!hasBoundTarget) {
                const sourceCity = cities.find(c => c.id === activeHuntQuest.sourceCityId);
                const anchorX = sourceCity?.x ?? party.x;
                const anchorY = sourceCity?.y ?? party.y;

                let bestCandidate: WorldEntity | null = null;
                let bestDist = Infinity;
                for (const ent of updatedEntities) {
                  if (toRemoveIds.has(ent.id)) continue;
                  if (ent.faction !== 'HOSTILE' || ent.name !== activeHuntQuest.targetEntityName) continue;
                  const d = Math.hypot(ent.x - anchorX, ent.y - anchorY);
                  if (d < bestDist) {
                    bestDist = d;
                    bestCandidate = ent;
                  }
                }

                if (bestCandidate) {
                  const bestCandidateId = bestCandidate.id;
                  const candidateIdx = updatedEntities.findIndex(ent => ent.id === bestCandidateId);
                  if (candidateIdx >= 0) {
                    updatedEntities[candidateIdx] = {
                      ...updatedEntities[candidateIdx],
                      isQuestTarget: true,
                    };
                  }
                  setParty(prevParty => {
                    if (!prevParty.activeQuest || prevParty.activeQuest.id !== activeHuntQuest.id || prevParty.activeQuest.isCompleted) {
                      return prevParty;
                    }
                    if (prevParty.activeQuest.targetEntityId === bestCandidateId) return prevParty;
                    return {
                      ...prevParty,
                      activeQuest: {
                        ...prevParty.activeQuest,
                        targetEntityId: bestCandidateId,
                      },
                    };
                  });
                } else {
                  const spawnDist = 3 + Math.random() * 5;
                  const spawnAngle = Math.random() * Math.PI * 2;
                  const spawnX = Math.max(1, Math.min(MAP_SIZE - 2, anchorX + Math.cos(spawnAngle) * spawnDist));
                  const spawnY = Math.max(1, Math.min(MAP_SIZE - 2, anchorY + Math.sin(spawnAngle) * spawnDist));
                  const questEntId = `quest-target-rebind-${activeHuntQuest.id}-${Date.now()}`;
                  const isBeast = BEAST_QUEST_TARGET_NAMES.has(activeHuntQuest.targetEntityName);
                  const entityType: WorldEntity['type'] = isBeast ? 'BEAST' : 'BANDIT';
                  const worldAIType: WorldAIType = isBeast ? 'BEAST' : 'BANDIT';

                  updatedEntities.push({
                    id: questEntId,
                    name: activeHuntQuest.targetEntityName,
                    type: entityType,
                    faction: 'HOSTILE',
                    x: spawnX,
                    y: spawnY,
                    targetX: null,
                    targetY: null,
                    speed: 0.6 + Math.random() * 0.3,
                    aiState: 'WANDER',
                    homeX: spawnX,
                    homeY: spawnY,
                    worldAIType,
                    alertRadius: 4,
                    chaseRadius: 8,
                    isQuestTarget: true,
                    wanderCooldown: Math.random() * 5,
                    territoryRadius: 4 + Math.random() * 3,
                  });

                  setParty(prevParty => {
                    if (!prevParty.activeQuest || prevParty.activeQuest.id !== activeHuntQuest.id || prevParty.activeQuest.isCompleted) {
                      return prevParty;
                    }
                    if (prevParty.activeQuest.targetEntityId === questEntId) return prevParty;
                    return {
                      ...prevParty,
                      activeQuest: {
                        ...prevParty.activeQuest,
                        targetEntityId: questEntId,
                      },
                    };
                  });
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
      const completedId = party.ambitionState.currentAmbition.id;
      const rep = party.ambitionState.currentAmbition.reputationReward;
      const baseGold = party.ambitionState.currentAmbition.goldReward ?? 0;
      const gold = Math.floor(baseGold * getIncomeMultiplierByDifficulty(party.difficulty));
      setParty(p => {
        const moraleGainSuccess = canApplyPositiveMoraleGain(p.moraleGainMultiplier);
        const base: Party = {
          ...p,
          reputation: p.reputation + rep,
          gold: p.gold + gold,
          ambitionState: completeAmbition(p),
          moraleModifier: moraleGainSuccess ? 1 : p.moraleModifier, // 受起源士气增益倍率影响
        };
        if (completedId !== BANNER_AMBITION_ID) return base;
        const alreadyHasBanner =
          p.inventory.some(item => isBannerWeapon(item)) ||
          p.mercenaries.some(m => isBannerWeapon(m.equipment.mainHand) || isBannerWeapon(m.equipment.offHand));
        if (alreadyHasBanner) return base;
        const reward = buildBannerRewardItem();
        if (!reward) return base;
        return { ...base, inventory: [...base.inventory, reward] };
      });
      // 显示通知
      const bannerText = completedId === BANNER_AMBITION_ID ? '，获得战团战旗 ×1' : '';
      setAmbitionNotification(`目标达成「${completedName}」！声望 +${rep}${gold ? `，金币 +${gold}` : ''}${bannerText}`);
      if (ambitionNotifTimerRef.current) clearTimeout(ambitionNotifTimerRef.current);
      ambitionNotifTimerRef.current = window.setTimeout(() => setAmbitionNotification(null), 4000);
    }
  }, [party.gold, party.mercenaries.length, party.ambitionState.battlesWon, party.ambitionState.citiesVisited.length, party.day, party.inventory.length, party.reputation, party.difficulty, party.ambitionState.contractsCompleted, party.ambitionState.campsDestroyed, party.ambitionState.totalCompleted, gameInitialized, buildBannerRewardItem, canApplyPositiveMoraleGain]);

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

  const handleGmTap = useCallback(() => {
    gmTapRef.current.count += 1;
    if (gmTapRef.current.timer) {
      window.clearTimeout(gmTapRef.current.timer);
    }
    if (gmTapRef.current.count >= 5) {
      setGmOpen(true);
      gmTapRef.current.count = 0;
      gmTapRef.current.timer = null;
      return;
    }
    gmTapRef.current.timer = window.setTimeout(() => {
      gmTapRef.current.count = 0;
      gmTapRef.current.timer = null;
    }, 2000);
  }, []);

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

  useEffect(() => {
    return () => {
      if (gmTapRef.current.timer) {
        window.clearTimeout(gmTapRef.current.timer);
      }
    };
  }, []);

  const dailyWages = Math.ceil(party.mercenaries.reduce((sum, m) => sum + m.salary, 0) * 1.3);
  const dailyFood = Math.ceil(party.mercenaries.length * 1.5 * (party.dailyFoodConsumptionMultiplier ?? 1));
  const difficultyLabel = DIFFICULTY_OPTIONS.find(opt => opt.value === party.difficulty)?.label || '普通';

  return (
    <div className="game-canvas flex flex-col bg-black text-slate-200 overflow-hidden font-serif">
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
          <OriginSelect
            selectedDifficulty={party.difficulty}
            onDifficultyChange={(difficulty) => setParty(p => ({ ...p, difficulty }))}
            onSelect={(origin, name) => {
              setSelectedOrigin(origin);
              setLeaderName(name);
              // 准备过场叙事
              const startCity = pendingMapRef.current
                ? pickOriginStartCity(origin, pendingMapRef.current.cities)
                : null;
              const cityName = startCity?.name || pendingMapRef.current?.cities[0]?.name || '城邑';
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
                initGameWithOrigin(origin, name, pendingMapRef.current, party.difficulty, startCity || undefined);
              }
              setView('INTRO_STORY');
            }}
          />
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
                onCancelAmbition={() => {
                  if (window.confirm('确定要放弃当前的志向吗？这会降低全员士气。')) {
                    handleAmbitionCancel();
                  }
                }}
                onSetTarget={(x, y) => {
                  // 护送任务期间禁止手动设置目标，强制跟随任务商队
                  if (party.activeQuest && party.activeQuest.type === 'ESCORT' && !party.activeQuest.isCompleted) {
                    return;
                  }
                  setParty(p => ({ ...p, targetX: clampWorldTile(x), targetY: clampWorldTile(y) }));
                  setTimeScale(prev => (prev === 0 ? 1 : prev));
                }} 
            />
        )}
        {view === 'WORLD_MAP' && gameInitialized && (
          <>
            <div className="absolute top-0 left-0 right-0 z-[90] pointer-events-none">
              <div className="pointer-events-auto bg-black/75 border-b border-amber-900/40 px-2 sm:px-3 py-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 sm:gap-3 text-[11px] sm:text-xs font-mono whitespace-nowrap">
                  <span className="text-amber-500">第{Math.floor(party.day)}天</span>
                  <span className="text-amber-500">
                    💰 {party.gold}
                    {dailyWages > 0 && <span className="text-red-400/70 text-[10px] ml-0.5">-{dailyWages}</span>}
                  </span>
                  <span className="text-emerald-500">
                    🌾 {party.food}
                    {dailyFood > 0 && <span className="text-red-400/70 text-[10px] ml-0.5">-{dailyFood}</span>}
                  </span>
                  <span className={party.medicine > 0 ? 'text-sky-400' : 'text-slate-600'}>
                    💊 {party.medicine}
                  </span>
                  <span className={party.repairSupplies > 0 ? 'text-orange-400' : 'text-slate-600'}>
                    🔧 {party.repairSupplies}
                  </span>
                  <span className="text-slate-400 hidden sm:inline">伍: {party.mercenaries.length}人</span>
                  <span className="text-yellow-600">望: {party.reputation}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setView('CAMP')}
                    className="px-2.5 py-1 text-[10px] font-bold transition-all border text-amber-500 border-amber-900/40 bg-black/70 hover:border-amber-500 hover:bg-amber-900/20"
                  >
                    进入营地
                  </button>
                  <div className="relative" ref={systemMenuRef}>
                    <button
                      onClick={() => setShowSystemMenu(v => !v)}
                      className={`px-2.5 py-1 text-[10px] font-bold transition-all border uppercase tracking-[0.2em] ${
                        showSystemMenu
                          ? 'bg-amber-600 text-white border-amber-500'
                          : 'text-amber-500 border-amber-700/60 bg-black/70 hover:border-amber-500 hover:bg-amber-900/20'
                      }`}
                    >
                      系统
                    </button>
                    {showSystemMenu && (
                      <div className="absolute top-full right-0 mt-1.5 min-w-40 bg-[#120d09]/95 border border-amber-900/50 shadow-2xl z-[120] p-1.5 flex flex-col gap-1">
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
                        <div className="px-3 py-1.5 border border-transparent">
                          <div className="text-[10px] text-amber-300/80 mb-1 tracking-[0.12em]">
                            设置声音大小
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={Math.round(bgmVolume * 100)}
                              onChange={(e) => setBgmVolume(Number(e.target.value) / 100)}
                              className="w-24 accent-amber-500 cursor-pointer"
                            />
                            <span className="text-[10px] text-slate-300 w-9 text-right tabular-nums">
                              {Math.round(bgmVolume * 100)}%
                            </span>
                          </div>
                        </div>
                        <div className="px-3 py-1.5 border border-transparent">
                          <div className="text-[10px] text-amber-300/80 mb-1 tracking-[0.12em]">
                            游戏难度（当前：{difficultyLabel}）
                          </div>
                          <div className="grid grid-cols-4 gap-1">
                            {DIFFICULTY_OPTIONS.map(opt => (
                              <button
                                key={opt.value}
                                onClick={() => setParty(p => ({ ...p, difficulty: opt.value }))}
                                className={`px-1 py-1 text-[10px] border transition-all ${
                                  party.difficulty === opt.value
                                    ? 'bg-amber-600 text-white border-amber-500'
                                    : 'text-amber-400 border-amber-900/40 hover:border-amber-600 hover:bg-amber-900/20'
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
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
              </div>
            </div>

            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-[90] pointer-events-auto">
              <div
                className="flex bg-black/75 rounded-t-sm border border-b-0 border-amber-900/40 px-1 py-0.5"
                onClick={handleGmTap}
                title="调试模式隐藏触发区"
              >
                {[0, 1, 2].map(s => (
                  <button
                    key={s}
                    onClick={() => setTimeScale(s)}
                    className={`w-7 h-6 flex items-center justify-center text-[10px] transition-all ${
                      timeScale === s ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {s === 0 ? '⏸' : s === 1 ? '▶' : '▶▶'}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        {view === 'COMBAT' && combatState && (
            <CombatView
                initialState={combatState}
                onTriggerTip={triggerTip}
                onCombatEnd={(victory, survivors, enemyUnits, rounds, isRetreat = false) => {
                    const result = generateBattleResult(
                      victory,
                      survivors,
                      enemyUnits,
                      rounds,
                      combatEnemyNameRef.current || '未知敌人',
                      party.mercenaries,
                      combatBossLootIdsRef.current, // 传入Boss掉落池
                      isRetreat,
                      party.battleXpMultiplier ?? 1
                    );
                    const scaledGoldReward = Math.floor(result.goldReward * getIncomeMultiplierByDifficulty(party.difficulty));
                    setBattleResult({ ...result, goldReward: scaledGoldReward });
                    if (isRetreat) {
                      setParty(p => ({
                        ...p,
                        mercenaries: p.mercenaries.map(m => {
                          const sur = survivors.find(s => s.id === m.id);
                          if (sur) return { ...m, hp: Math.min(m.maxHp, sur.hp), fatigue: 0 };
                          return m;
                        }),
                      }));
                    }
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
                            if (sur) return { ...m, hp: Math.min(m.maxHp, sur.hp), fatigue: 0 };
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
                      const deadIds = new Set(battleResult.casualties.map(c => c.id));
                      const cheatedDeathInjuries = new Map<string, string>(
                        battleResult.survivors
                          .filter(s => s.cheatedDeath && !!s.injuryTraitId)
                          .map(s => [s.id, s.injuryTraitId as string])
                      );

                      const updatedMercs = p.mercenaries
                        .filter(m => !deadIds.has(m.id))
                        .map(m => {
                          const baseXp = xpMap[m.id] || 0;
                          // 学徒(student) XP 加成
                          const xp = applyStudentXPBonus(baseXp, m.perks);
                          const withXp = { ...m, xp: m.xp + xp };
                          // 自动检测升级（可能连升多级）
                          const { char: leveled } = checkLevelUp(withXp);
                          const injuryTraitId = cheatedDeathInjuries.get(m.id);
                          if (!injuryTraitId) return leveled;
                          return {
                            ...leveled,
                            hp: 1,
                            fatigue: 0,
                            traits: leveled.traits.includes(injuryTraitId) ? leveled.traits : [...leveled.traits, injuryTraitId],
                          };
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
                            setEntities(prev =>
                              prev.map(ent =>
                                ent.id === bestId ? { ...ent, isQuestTarget: true } : ent
                              )
                            );
                        } else {
                            // 附近没有匹配的敌人，在城市附近生成一个任务专属目标
                            const spawnDist = 3 + Math.random() * 5; // 距城市3-8格（确保任务目标在附近）
                            const spawnAngle = Math.random() * Math.PI * 2;
                            const spawnX = Math.max(1, Math.min(MAP_SIZE - 2, cx + Math.cos(spawnAngle) * spawnDist));
                            const spawnY = Math.max(1, Math.min(MAP_SIZE - 2, cy + Math.sin(spawnAngle) * spawnDist));
                            const questEntId = `quest-target-${q.id}-${Date.now()}`;
                            
                            // 根据目标名称推断实体类型
                            const isBeast = BEAST_QUEST_TARGET_NAMES.has(q.targetEntityName);
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
                          const isBeast = BEAST_QUEST_TARGET_NAMES.has(q.targetEntityName);
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

        {gmOpen && (
          <GMPanel
            party={party}
            cities={cities}
            entities={entities}
            onUpdateParty={setParty}
            onTeleport={(x, y) => {
              setParty((p) => ({ ...p, x, y, targetX: null, targetY: null }));
              setView('WORLD_MAP');
              setTimeScale(0);
            }}
            onKillAllEnemies={() => {
              setEntities((prev) => prev.filter((e) => e.faction !== 'HOSTILE'));
            }}
            onStartCustomBattle={(enemyType, tier) => {
              const fallbackComps = TIERED_ENEMY_COMPOSITIONS.BANDIT?.[Math.max(0, Math.min(3, tier))] || [];
              const chosenComps = TIERED_ENEMY_COMPOSITIONS[enemyType]?.[Math.max(0, Math.min(3, tier))] || [];
              if (chosenComps.length === 0 && fallbackComps.length === 0) return;
              const resolvedType = chosenComps.length > 0 ? enemyType : 'BANDIT';
              const typeLabel = ENEMY_TYPE_LABELS[resolvedType] || resolvedType;
              const customEnemyName = `GM-自定义-${typeLabel}-阶段${tier}`;
              const gmEntity: WorldEntity = {
                id: `gm-custom-${Date.now()}`,
                name: customEnemyName,
                type: resolvedType as WorldEntity['type'],
                faction: 'HOSTILE',
                x: party.x,
                y: party.y,
                targetX: null,
                targetY: null,
                speed: 0,
                aiState: 'IDLE',
                homeX: party.x,
                homeY: party.y,
                worldAIType: 'BANDIT',
                alertRadius: 0,
                chaseRadius: 0,
              };
              setPreCombatEntity(null);
              setGmOpen(false);
              startCombat(gmEntity, {
                disableScaling: true,
                forcedTier: tier,
                customEnemyType: resolvedType,
                customEnemyName,
                keepWorldEntity: true,
              });
            }}
            onCreateMercenary={(bgKey, forcedName) =>
              createMercenary(`gm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, forcedName, bgKey, null)
            }
            onClose={() => setGmOpen(false)}
          />
        )}

        {/* Post-Combat UI / Interaction Dialogs */}
        {/* ===== 存档/读档面板 ===== */}
        {saveLoadMode && (
          <SaveLoadPanel
            mode={saveLoadMode}
            onSave={(slot) => saveGame(slot)}
            onLoad={(slot) => loadGame(slot)}
            onLoadAuto={loadAutoSave}
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
