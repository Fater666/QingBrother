/**
 * 士气系统服务 - 《战场兄弟》风格的士气溃散机制
 * 
 * 核心功能：
 * 1. 士气检定 - 基于胆识(resolve)属性
 * 2. 连锁恐惧 - 友军逃跑时引发周围单位检定
 * 3. 士气状态效果 - 不同士气状态对战斗属性的影响
 */

import { CombatState, CombatUnit, MoraleStatus } from '../types';
import { getHexDistance, MORALE_EFFECTS_DATA } from '../constants';

// ==================== 常量配置 ====================

/** 士气状态顺序（从高到低） */
export const MORALE_ORDER: MoraleStatus[] = [
  MoraleStatus.CONFIDENT,
  MoraleStatus.STEADY,
  MoraleStatus.WAVERING,
  MoraleStatus.BREAKING,
  MoraleStatus.FLEEING
];

/** 士气检定基础难度 */
const BASE_MORALE_CHECK_DIFFICULTY = 40;

/** 连锁恐惧影响范围（格数） */
const CHAIN_FEAR_RADIUS = 3;

/** 友军死亡影响范围（格数） */
const ALLY_DEATH_RADIUS = 3;

/** 队伍伤亡触发全员检定的阈值（百分比） */
const MASS_CASUALTY_THRESHOLD = 0.5;

/** 旗手光环范围（格数） */
const BANNER_AURA_RADIUS = 4;
/** 旗手光环：士气检定难度下调（负值代表更容易通过） */
const BANNER_AURA_DIFFICULTY_MOD = -10;

/** 士气状态图标 */
export const MORALE_ICONS: Record<MoraleStatus, string> = {
  [MoraleStatus.CONFIDENT]: '😤',
  [MoraleStatus.STEADY]: '😐',
  [MoraleStatus.WAVERING]: '😰',
  [MoraleStatus.BREAKING]: '😱',
  [MoraleStatus.FLEEING]: '🏃'
};

/** 士气状态颜色 */
export const MORALE_COLORS: Record<MoraleStatus, string> = {
  [MoraleStatus.CONFIDENT]: '#22c55e', // green
  [MoraleStatus.STEADY]: '#94a3b8',    // slate
  [MoraleStatus.WAVERING]: '#eab308',  // yellow
  [MoraleStatus.BREAKING]: '#f97316',  // orange
  [MoraleStatus.FLEEING]: '#ef4444'    // red
};

// ==================== 士气状态效果 ====================

export interface MoraleEffects {
  hitChanceMod: number;      // 命中修正（百分比）
  damageMod: number;         // 伤害修正（百分比）
  defenseMod: number;        // 防御修正（百分比）
  skipActionChance: number;  // 跳过行动的概率
  isControllable: boolean;   // 是否可控制
}

/**
 * 获取士气状态对战斗属性的影响（从 CSV 配置读取）
 */
export const getMoraleEffects = (morale: MoraleStatus): MoraleEffects => {
  const data = MORALE_EFFECTS_DATA[morale];
  if (data) {
    return {
      hitChanceMod: data.hitChanceMod,
      damageMod: data.damageMod,
      defenseMod: data.defenseMod,
      skipActionChance: data.skipActionChance,
      isControllable: data.isControllable,
    };
  }
  // 默认值
  return { hitChanceMod: 0, damageMod: 0, defenseMod: 0, skipActionChance: 0, isControllable: true };
};

// ==================== 士气检定事件类型 ====================

export type MoraleCheckTrigger = 
  | 'ALLY_DEATH'           // 友军死亡
  | 'HEAVY_DAMAGE'         // 自己受重伤
  | 'MASS_CASUALTY'        // 队伍伤亡过大
  | 'ALLY_FLEEING'         // 友军逃跑（连锁恐惧）
  | 'ENEMY_KILLED'         // 击杀敌人（士气提升）
  | 'TURN_START';          // 回合开始（自然恢复）

export interface MoraleCheckResult {
  unitId: string;
  unitName: string;
  previousMorale: MoraleStatus;
  newMorale: MoraleStatus;
  trigger: MoraleCheckTrigger;
  success: boolean;
  roll: number;
  difficulty: number;
}

// ==================== 核心检定逻辑 ====================

/**
 * 获取士气状态的索引（用于比较和计算）
 */
const getMoraleIndex = (morale: MoraleStatus): number => {
  return MORALE_ORDER.indexOf(morale);
};

/**
 * 根据索引获取士气状态
 */
const getMoraleByIndex = (index: number): MoraleStatus => {
  if (index < 0) return MoraleStatus.CONFIDENT;
  if (index >= MORALE_ORDER.length) return MoraleStatus.FLEEING;
  return MORALE_ORDER[index];
};

/**
 * 玩家侧旗手光环判定
 * 规则：仅玩家队伍生效；旗手本人或4格内友军生效
 */
const hasPlayerBannerAura = (unit: CombatUnit, state: CombatState): boolean => {
  if (unit.team !== 'PLAYER' || unit.isDead || unit.hasEscaped) return false;
  const bannermen = state.units.filter(u =>
    u.team === 'PLAYER' &&
    !u.isDead &&
    !u.hasEscaped &&
    u.isBannerman
  );
  if (bannermen.length === 0) return false;
  return bannermen.some(b => getHexDistance(b.combatPos, unit.combatPos) <= BANNER_AURA_RADIUS);
};

/**
 * 计算士气检定的难度修正
 */
export const calculateMoraleModifier = (
  unit: CombatUnit,
  state: CombatState,
  trigger: MoraleCheckTrigger
): number => {
  let modifier = 0;
  
  const allies = state.units.filter(u => u.team === unit.team && !u.isDead && u.id !== unit.id);
  const enemies = state.units.filter(u => u.team !== unit.team && !u.isDead);
  const deadAllies = state.units.filter(u => u.team === unit.team && u.isDead);
  const totalAllies = state.units.filter(u => u.team === unit.team);
  
  // 1. 数量劣势修正
  if (enemies.length > allies.length + 1) {
    modifier += (enemies.length - allies.length) * 5;
  }
  
  // 2. 伤亡比例修正
  const casualtyRate = deadAllies.length / totalAllies.length;
  modifier += Math.floor(casualtyRate * 15);
  
  // 3. 自身血量修正
  const hpPercent = unit.hp / unit.maxHp;
  if (hpPercent < 0.25) {
    modifier += 20;
  } else if (hpPercent < 0.5) {
    modifier += 10;
  }
  
  // 4. 周围有逃跑友军的修正
  const nearbyFleeing = allies.filter(a => 
    a.morale === MoraleStatus.FLEEING && 
    getHexDistance(unit.combatPos, a.combatPos) <= CHAIN_FEAR_RADIUS
  );
  modifier += nearbyFleeing.length * 5;
  
  // 5. 触发类型修正
  switch (trigger) {
    case 'ALLY_DEATH':
      modifier += 5;
      break;
    case 'HEAVY_DAMAGE':
      modifier += 10;
      break;
    case 'MASS_CASUALTY':
      modifier += 10;
      break;
    case 'ALLY_FLEEING':
      modifier += 8;
      break;
    case 'TURN_START':
      modifier -= 10; // 回合开始恢复检定更容易
      break;
    case 'ENEMY_KILLED':
      modifier -= 20; // 击杀敌人时检定更容易
      break;
  }

  // 旗手光环：降低士气检定难度（仅玩家队伍）
  if (hasPlayerBannerAura(unit, state)) {
    modifier += BANNER_AURA_DIFFICULTY_MOD;
  }
  
  // 6. 被包围修正
  const adjacentEnemies = enemies.filter(e => 
    getHexDistance(unit.combatPos, e.combatPos) === 1
  );
  if (adjacentEnemies.length >= 3) {
    modifier += 10;
  } else if (adjacentEnemies.length >= 2) {
    modifier += 3;
  }
  
  return modifier;
};

/**
 * 执行单个单位的士气检定
 */
export const performMoraleCheck = (
  unit: CombatUnit,
  state: CombatState,
  trigger: MoraleCheckTrigger
): MoraleCheckResult => {
  const previousMorale = unit.morale;
  
  // 士气免疫走配置驱动：仅亡灵类型或显式配置 MORALE_IMMUNE
  const hasMoraleImmuneFlag = (unit.aiConfig || []).includes('MORALE_IMMUNE');
  const isMoraleImmuneByType = unit.unitType === 'UNDEAD';
  if (isMoraleImmuneByType || hasMoraleImmuneFlag) {
    return {
      unitId: unit.id,
      unitName: unit.name,
      previousMorale,
      newMorale: previousMorale,
      trigger,
      success: true,
      roll: 999,
      difficulty: 0
    };
  }
  
  // 已经在逃跑状态的单位不需要再检定（除非是恢复检定）
  if (previousMorale === MoraleStatus.FLEEING && trigger !== 'TURN_START' && trigger !== 'ENEMY_KILLED') {
    return {
      unitId: unit.id,
      unitName: unit.name,
      previousMorale,
      newMorale: previousMorale,
      trigger,
      success: false,
      roll: 0,
      difficulty: 0
    };
  }
  
  // 计算检定值：胆识 + 随机(0-30)，AI单位获得+5韧性加成
  const resolve = unit.stats.resolve;
  const resolveBonus = unit.team === 'ENEMY' ? 5 : 0;
  const roll = resolve + resolveBonus + Math.floor(Math.random() * 31);
  
  // 计算难度值
  const modifier = calculateMoraleModifier(unit, state, trigger);
  const difficulty = BASE_MORALE_CHECK_DIFFICULTY + modifier;
  
  // 判定成功与否
  const success = roll >= difficulty;
  
  let newMorale = previousMorale;
  const currentIndex = getMoraleIndex(previousMorale);
  
  if (trigger === 'TURN_START' || trigger === 'ENEMY_KILLED') {
    // 恢复类检定
    if (success && currentIndex > 0) {
      // 成功则士气提升一级
      newMorale = getMoraleByIndex(currentIndex - 1);
    }
    // 失败则保持不变
  } else {
    // 负面事件检定
    if (!success) {
      // 失败则士气下降
      // 大失败（差距超过20）下降两级
      const failMargin = difficulty - roll;
      let dropLevels = failMargin > 20 ? 2 : 1;
      // 旗手防崩：光环内负面检定失败时，降级幅度 -1（最低不降）
      if (hasPlayerBannerAura(unit, state)) {
        dropLevels = Math.max(0, dropLevels - 1);
      }
      newMorale = getMoraleByIndex(currentIndex + dropLevels);
    }
    // 成功则保持不变
  }
  
  return {
    unitId: unit.id,
    unitName: unit.name,
    previousMorale,
    newMorale,
    trigger,
    success,
    roll,
    difficulty
  };
};

// ==================== 批量检定与连锁恐惧 ====================

/**
 * 处理友军死亡事件 - 对附近单位触发士气检定
 */
export const handleAllyDeath = (
  deadUnit: CombatUnit,
  state: CombatState
): MoraleCheckResult[] => {
  const results: MoraleCheckResult[] = [];
  
  // 获取同队存活单位
  const allies = state.units.filter(u => 
    u.team === deadUnit.team && 
    !u.isDead && 
    u.id !== deadUnit.id
  );
  
  // 检查是否触发大规模伤亡检定
  const totalAllies = state.units.filter(u => u.team === deadUnit.team);
  const deadAllies = state.units.filter(u => u.team === deadUnit.team && u.isDead);
  // 注意：deadUnit 已在 state 中标记为 isDead: true，不需要额外 +1
  const casualtyRate = deadAllies.length / totalAllies.length;
  
  const isMassCasualty = casualtyRate >= MASS_CASUALTY_THRESHOLD;
  
  for (const ally of allies) {
    const distance = getHexDistance(deadUnit.combatPos, ally.combatPos);
    
    // 附近单位（3格内）需要检定
    if (distance <= ALLY_DEATH_RADIUS) {
      const result = performMoraleCheck(ally, state, 'ALLY_DEATH');
      results.push(result);
    }
    // 大规模伤亡时全员检定
    else if (isMassCasualty) {
      const result = performMoraleCheck(ally, state, 'MASS_CASUALTY');
      results.push(result);
    }
  }
  
  return results;
};

/**
 * 处理单位受到重伤事件
 */
export const handleHeavyDamage = (
  unit: CombatUnit,
  previousHp: number,
  state: CombatState
): MoraleCheckResult | null => {
  const hpPercent = unit.hp / unit.maxHp;
  const previousPercent = previousHp / unit.maxHp;
  
  // 只有当血量跌破50%阈值时才触发检定
  if (previousPercent >= 0.5 && hpPercent < 0.5) {
    return performMoraleCheck(unit, state, 'HEAVY_DAMAGE');
  }
  
  // 血量跌破25%时再次触发检定
  if (previousPercent >= 0.25 && hpPercent < 0.25) {
    return performMoraleCheck(unit, state, 'HEAVY_DAMAGE');
  }
  
  return null;
};

/**
 * 触发连锁恐惧 - 当单位开始逃跑时调用
 * 返回所有因连锁恐惧而需要检定的结果
 */
export const triggerChainFear = (
  fleeingUnit: CombatUnit,
  state: CombatState,
  alreadyChecked: Set<string> = new Set()
): MoraleCheckResult[] => {
  const results: MoraleCheckResult[] = [];
  alreadyChecked.add(fleeingUnit.id);
  
  // 获取附近的同队友军
  const nearbyAllies = state.units.filter(u => 
    u.team === fleeingUnit.team && 
    !u.isDead && 
    u.id !== fleeingUnit.id &&
    !alreadyChecked.has(u.id) &&
    u.morale !== MoraleStatus.FLEEING &&
    getHexDistance(fleeingUnit.combatPos, u.combatPos) <= CHAIN_FEAR_RADIUS
  );
  
  for (const ally of nearbyAllies) {
    alreadyChecked.add(ally.id);
    const result = performMoraleCheck(ally, state, 'ALLY_FLEEING');
    results.push(result);
    
    // 如果这个单位也开始逃跑，递归触发连锁恐惧
    if (result.newMorale === MoraleStatus.FLEEING) {
      // 更新state中该单位的士气以便后续计算
      const unitInState = state.units.find(u => u.id === ally.id);
      if (unitInState) {
        unitInState.morale = MoraleStatus.FLEEING;
      }
      
      const chainResults = triggerChainFear(ally, state, alreadyChecked);
      results.push(...chainResults);
    }
  }
  
  return results;
};

/**
 * 处理击杀敌人事件 - 提升士气
 */
export const handleEnemyKilled = (
  killer: CombatUnit,
  state: CombatState
): MoraleCheckResult | null => {
  // 只有士气低于稳定的单位才能通过击杀恢复
  if (getMoraleIndex(killer.morale) > getMoraleIndex(MoraleStatus.STEADY)) {
    return performMoraleCheck(killer, state, 'ENEMY_KILLED');
  }
  
  // 士气已经稳定或自信的单位，直接提升到自信
  if (killer.morale === MoraleStatus.STEADY) {
    return {
      unitId: killer.id,
      unitName: killer.name,
      previousMorale: killer.morale,
      newMorale: MoraleStatus.CONFIDENT,
      trigger: 'ENEMY_KILLED',
      success: true,
      roll: 100,
      difficulty: 0
    };
  }
  
  return null;
};

/**
 * 回合开始时的士气恢复检定
 */
export const handleTurnStartRecovery = (
  unit: CombatUnit,
  state: CombatState
): MoraleCheckResult | null => {
  // 只有士气低于稳定的单位才需要恢复检定
  if (getMoraleIndex(unit.morale) <= getMoraleIndex(MoraleStatus.STEADY)) {
    return null;
  }
  
  return performMoraleCheck(unit, state, 'TURN_START');
};

// ==================== 应用检定结果 ====================

/**
 * 将士气检定结果应用到战斗状态
 * 返回更新后的units数组和所有连锁恐惧的结果
 */
export const applyMoraleResults = (
  state: CombatState,
  results: MoraleCheckResult[]
): { updatedUnits: CombatUnit[]; chainResults: MoraleCheckResult[] } => {
  const updatedUnits = [...state.units];
  const allChainResults: MoraleCheckResult[] = [];
  
  for (const result of results) {
    const unitIndex = updatedUnits.findIndex(u => u.id === result.unitId);
    if (unitIndex === -1) continue;
    
    const unit = updatedUnits[unitIndex];
    const previousMorale = unit.morale;
    
    // 更新士气
    updatedUnits[unitIndex] = { ...unit, morale: result.newMorale };
    
    // 如果单位刚刚开始逃跑，触发连锁恐惧
    if (previousMorale !== MoraleStatus.FLEEING && result.newMorale === MoraleStatus.FLEEING) {
      const tempState = { ...state, units: updatedUnits };
      const chainResults = triggerChainFear(updatedUnits[unitIndex], tempState, new Set([result.unitId]));
      
      // 应用连锁恐惧结果
      for (const chainResult of chainResults) {
        const chainUnitIndex = updatedUnits.findIndex(u => u.id === chainResult.unitId);
        if (chainUnitIndex !== -1) {
          updatedUnits[chainUnitIndex] = { 
            ...updatedUnits[chainUnitIndex], 
            morale: chainResult.newMorale 
          };
        }
      }
      
      allChainResults.push(...chainResults);
    }
  }
  
  return { updatedUnits, chainResults: allChainResults };
};

// ==================== 逃跑行为 ====================

const MORALE_GRID_RANGE = 15;

/** 将坐标钳制到战场边界内 */
const clampToGrid = (pos: { q: number; r: number }): { q: number; r: number } => {
  let { q, r } = pos;
  q = Math.max(-MORALE_GRID_RANGE, Math.min(MORALE_GRID_RANGE, q));
  const minR = Math.max(-MORALE_GRID_RANGE, -q - MORALE_GRID_RANGE);
  const maxR = Math.min(MORALE_GRID_RANGE, -q + MORALE_GRID_RANGE);
  r = Math.max(minR, Math.min(maxR, r));
  return { q, r };
};

/**
 * 获取逃跑单位的移动目标位置
 * 逃跑单位会尝试远离所有敌人
 */
export const getFleeTargetPosition = (
  unit: CombatUnit,
  state: CombatState
): { q: number; r: number } | null => {
  const enemies = state.units.filter(u => u.team !== unit.team && !u.isDead);
  if (enemies.length === 0) return null;

  // 计算所有敌人的平均位置
  const avgEnemyPos = enemies.reduce(
    (acc, e) => ({ q: acc.q + e.combatPos.q, r: acc.r + e.combatPos.r }),
    { q: 0, r: 0 }
  );
  avgEnemyPos.q /= enemies.length;
  avgEnemyPos.r /= enemies.length;

  // 计算远离敌人的方向
  const dirQ = unit.combatPos.q - avgEnemyPos.q;
  const dirR = unit.combatPos.r - avgEnemyPos.r;

  // 归一化方向并计算目标位置（移动2-3格）
  const length = Math.sqrt(dirQ * dirQ + dirR * dirR);
  if (length < 0.1) {
    // 如果在敌人中心，随机选一个方向
    return clampToGrid({
      q: unit.combatPos.q + Math.floor(Math.random() * 3) - 1,
      r: unit.combatPos.r + Math.floor(Math.random() * 3) - 1
    });
  }

  const moveDistance = 2;
  return clampToGrid({
    q: Math.round(unit.combatPos.q + (dirQ / length) * moveDistance),
    r: Math.round(unit.combatPos.r + (dirR / length) * moveDistance)
  });
};

/**
 * 获取主动撤退单位的移动目标位置
 * 撤退单位会优先朝战场边缘方向移动
 */
export const getRetreatTargetPosition = (
  unit: CombatUnit
): { q: number; r: number } => {
  const dirQ = unit.combatPos.q;
  const dirR = unit.combatPos.r;
  const length = Math.sqrt(dirQ * dirQ + dirR * dirR);

  if (length < 0.1) {
    const retreatDirections = [
      { q: 1, r: 0 },
      { q: 1, r: -1 },
      { q: 0, r: -1 },
      { q: -1, r: 0 },
      { q: -1, r: 1 },
      { q: 0, r: 1 },
    ];
    const randomDirection = retreatDirections[Math.floor(Math.random() * retreatDirections.length)];
    return clampToGrid({
      q: unit.combatPos.q + randomDirection.q * 2,
      r: unit.combatPos.r + randomDirection.r * 2,
    });
  }

  const moveDistance = 2;
  return clampToGrid({
    q: Math.round(unit.combatPos.q + (dirQ / length) * moveDistance),
    r: Math.round(unit.combatPos.r + (dirR / length) * moveDistance),
  });
};

/**
 * 检查崩溃状态单位是否跳过行动
 */
export const shouldSkipAction = (unit: CombatUnit): boolean => {
  const effects = getMoraleEffects(unit.morale);
  if (effects.skipActionChance <= 0) return false;
  return Math.random() < effects.skipActionChance;
};

// ==================== 辅助函数 ====================

/**
 * 获取士气状态的显示文本
 */
export const getMoraleDisplayText = (result: MoraleCheckResult): string => {
  if (result.newMorale === result.previousMorale) {
    if (result.success) {
      return `${result.unitName} 保持镇定。`;
    }
    return '';
  }
  
  const isImproved = getMoraleIndex(result.newMorale) < getMoraleIndex(result.previousMorale);
  
  if (isImproved) {
    return `${result.unitName} 的士气恢复至${result.newMorale}！`;
  } else {
    if (result.newMorale === MoraleStatus.FLEEING) {
      return `${result.unitName} 恐惧溃逃！`;
    }
    return `${result.unitName} 士气${result.newMorale}！`;
  }
};

/**
 * 检查一方是否全部逃跑或死亡
 */
export const checkTeamRouted = (team: 'PLAYER' | 'ENEMY', state: CombatState): boolean => {
  const teamUnits = state.units.filter(u => u.team === team);
  const activeUnits = teamUnits.filter(u => !u.isDead && !u.hasEscaped && u.morale !== MoraleStatus.FLEEING);
  return activeUnits.length === 0;
};
