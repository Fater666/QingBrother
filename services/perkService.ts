/**
 * 专精技能效果服务
 *
 * 集中管理所有专精(Perk)的被动/主动效果计算。
 * 所有数值参数均从 csv/perk_effects.csv 读取，代码中不硬编码。
 */

import { CombatUnit } from '../types';
import { getPerkEffect } from '../constants';

// ==================== Tier 1 被动 ====================

/**
 * 强体 (colossus)
 * 效果：生命值上限提高 hpMult（CSV 配置，默认 25%）
 * 应用时机：进入战斗时
 */
export const applyColossus = (unit: CombatUnit): CombatUnit => {
  if (!unit.perks?.includes('colossus')) return unit;
  const mult = getPerkEffect('colossus', 'hpMult', 0.25);
  const bonus = Math.floor(unit.maxHp * mult);
  return { ...unit, maxHp: unit.maxHp + bonus, hp: unit.hp + bonus };
};

/**
 * 命不该绝 (nine_lives)
 * 效果：每场战斗第一次致命伤时 HP 保留 surviveAtHp 点
 * 返回值：是否触发了命不该绝，以及调整后的HP伤害
 */
export const checkNineLives = (
  unit: CombatUnit,
  hpDamage: number
): { triggered: boolean; adjustedDamage: number } => {
  if (!unit.perks?.includes('nine_lives')) {
    return { triggered: false, adjustedDamage: hpDamage };
  }
  if (unit.nineLivesUsed) {
    return { triggered: false, adjustedDamage: hpDamage };
  }
  const surviveHp = getPerkEffect('nine_lives', 'surviveAtHp', 1);
  // 本次伤害会致死
  if (unit.hp - hpDamage <= 0 && unit.hp > 0) {
    return { triggered: true, adjustedDamage: unit.hp - surviveHp };
  }
  return { triggered: false, adjustedDamage: hpDamage };
};

/**
 * 识途 (pathfinder)
 * 效果：移动每格 AP 消耗减少 apMoveReduce，最低 minMoveCost；移动疲劳 × fatigueMoveReduce
 * @param dist 移动格数
 * @param hasPathfinder 是否拥有识途
 * @returns { apCost, fatigueCost }
 */
export const getMovementCost = (
  dist: number,
  hasPathfinder: boolean
): { apCost: number; fatigueCost: number } => {
  const baseApPerTile = 2;
  const baseFatiguePerTile = 4;
  if (hasPathfinder) {
    const apReduce = getPerkEffect('pathfinder', 'apMoveReduce', 1);
    const fatReduce = getPerkEffect('pathfinder', 'fatigueMoveReduce', 0.5);
    const minCost = getPerkEffect('pathfinder', 'minMoveCost', 2);
    return {
      apCost: Math.max(minCost, dist * (baseApPerTile - apReduce)),
      fatigueCost: Math.floor(dist * baseFatiguePerTile * fatReduce),
    };
  }
  return {
    apCost: dist * baseApPerTile,
    fatigueCost: dist * baseFatiguePerTile,
  };
};

/**
 * 临机应变 (fast_adaptation)
 * 效果：每次攻击未命中时下一次攻击命中率叠加 +hitPerMiss%，命中后重置
 */
export const getFastAdaptationBonus = (unit: CombatUnit): number => {
  if (!unit.perks?.includes('fast_adaptation')) return 0;
  const bonusPerMiss = getPerkEffect('fast_adaptation', 'hitPerMiss', 10);
  return (unit.fastAdaptationStacks || 0) * bonusPerMiss;
};

/**
 * 学徒 (student)
 * 效果：经验值获取 × (1 + xpMult)
 */
export const applyStudentXPBonus = (xp: number, perks: string[]): number => {
  if (perks.includes('student')) {
    const bonus = getPerkEffect('student', 'xpMult', 0.2);
    return Math.floor(xp * (1 + bonus));
  }
  return xp;
};

/**
 * 致残击 (crippling_strikes)
 * 效果：暴击判定阈值降低（原 0.8 → critThreshold）
 * @returns 暴击判定阈值倍率
 */
export const getCritThresholdMult = (perks: string[]): number => {
  if (perks?.includes('crippling_strikes')) {
    return getPerkEffect('crippling_strikes', 'critThreshold', 0.53);
  }
  return 0.8;
};

// ==================== Tier 2 被动 ====================

/**
 * 身法 (dodge)
 * 效果：获得当前"先手值" × defInitRatio 的近战和远程防御加成。
 * 先手值随疲劳减少，因此疲劳越高加成越低。
 */
export const getDodgeDefenseBonus = (unit: CombatUnit): number => {
  if (!unit.perks?.includes('dodge')) return 0;
  const ratio = getPerkEffect('dodge', 'defInitRatio', 0.15);
  const currentInit = Math.max(0, unit.stats.initiative - unit.fatigue);
  return Math.floor(currentInit * ratio);
};

/**
 * 定胆 (fortified_mind)
 * 效果：胆识提高 resolveMult（默认 25%）
 * 应用时机：进入战斗时
 */
export const applyFortifiedMind = (unit: CombatUnit): CombatUnit => {
  if (!unit.perks?.includes('fortified_mind')) return unit;
  const mult = getPerkEffect('fortified_mind', 'resolveMult', 0.25);
  const bonus = Math.floor(unit.stats.resolve * mult);
  return {
    ...unit,
    stats: { ...unit.stats, resolve: unit.stats.resolve + bonus },
  };
};

// ==================== 工具函数 ====================

/**
 * 检查单位是否拥有指定专精
 */
export const hasPerk = (unit: CombatUnit | { perks?: string[] }, perkId: string): boolean => {
  return unit.perks?.includes(perkId) ?? false;
};
