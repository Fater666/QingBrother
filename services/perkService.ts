/**
 * 专精技能效果服务
 *
 * 集中管理所有专精(Perk)的被动/主动效果计算。
 * 所有数值参数均从 csv/perk_effects.csv 读取，代码中不硬编码。
 */

import { CombatUnit, CombatState, Item } from '../types';
import { getPerkEffect, getHexDistance } from '../constants';

// ==================== 工具函数 ====================

/**
 * 检查单位是否拥有指定专精
 */
export const hasPerk = (unit: CombatUnit | { perks?: string[] }, perkId: string): boolean => {
  return unit.perks?.includes(perkId) ?? false;
};

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

// ==================== Tier 2 被动 ====================

/**
 * 身法 (dodge)
 * 效果：获得当前"先手值" × defInitRatio 的近战和远程防御加成。
 * 先手值随疲劳减少，因此疲劳越高加成越低。
 * 受「不息 relentless」影响：疲劳对先手的惩罚减半。
 */
export const getDodgeDefenseBonus = (unit: CombatUnit): number => {
  if (!unit.perks?.includes('dodge')) return 0;
  const ratio = getPerkEffect('dodge', 'defInitRatio', 0.15);
  // 不息(relentless)：疲劳对先手的惩罚减半
  const fatiguePenalty = hasPerk(unit, 'relentless')
    ? unit.fatigue * (1 - getPerkEffect('relentless', 'fatigueInitPenaltyReduce', 0.5))
    : unit.fatigue;
  const currentInit = Math.max(0, unit.stats.initiative - fatiguePenalty);
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

/**
 * 铁额 (steel_brow)
 * 效果：头部受到攻击不再遭受暴击伤害
 * @returns 是否拥有铁额
 */
export const hasSteelBrow = (unit: CombatUnit): boolean => {
  return hasPerk(unit, 'steel_brow');
};

// ==================== Tier 3 被动 ====================

/**
 * 合围 (backstabber)
 * 效果：包围加成的命中率翻倍
 * @returns 合围加成的乘数（默认 2x）
 */
export const getBackstabberMultiplier = (unit: CombatUnit): number => {
  if (!hasPerk(unit, 'backstabber')) return 1;
  return getPerkEffect('backstabber', 'surroundMultiplier', 2);
};

/**
 * 预判 (anticipation)
 * 效果：根据远程防御值的 10% 额外增加被远程攻击时的防御
 */
export const getAnticipationBonus = (unit: CombatUnit): number => {
  if (!hasPerk(unit, 'anticipation')) return 0;
  const ratio = getPerkEffect('anticipation', 'rangedDefRatio', 0.1);
  return Math.floor(unit.stats.rangedDefense * ratio);
};

/**
 * 盾法精通 (shield_expert)
 * 效果：盾牌防御加成 +25%
 * @returns 额外的盾牌防御加成
 */
export const getShieldExpertBonus = (unit: CombatUnit): number => {
  if (!hasPerk(unit, 'shield_expert')) return 0;
  const shield = unit.equipment.offHand;
  if (!shield || shield.type !== 'SHIELD' || !shield.defenseBonus) return 0;
  const mult = getPerkEffect('shield_expert', 'shieldDefMult', 0.25);
  return Math.floor(shield.defenseBonus * mult);
};

/**
 * 负重者 (brawny)
 * 效果：身甲和头盔造成的最大体力惩罚减少 30%
 * 应用时机：进入战斗时（修改 maxFatigue）
 */
export const applyBrawny = (unit: CombatUnit): CombatUnit => {
  if (!hasPerk(unit, 'brawny')) return unit;
  const reduce = getPerkEffect('brawny', 'fatiguePenaltyReduce', 0.3);
  let fatiguePenalty = 0;
  if (unit.equipment.armor?.maxFatiguePenalty) {
    fatiguePenalty += unit.equipment.armor.maxFatiguePenalty;
  }
  if (unit.equipment.helmet?.maxFatiguePenalty) {
    fatiguePenalty += unit.equipment.helmet.maxFatiguePenalty;
  }
  if (fatiguePenalty <= 0) return unit;
  const bonus = Math.floor(fatiguePenalty * reduce);
  return { ...unit, maxFatigue: unit.maxFatigue + bonus };
};

/**
 * 不息 (relentless)
 * 效果：当前疲劳值对"先手"属性的惩罚减半
 * 已集成到 getDodgeDefenseBonus 中，此函数用于获取有效先手值
 */
export const getEffectiveInitiative = (unit: CombatUnit): number => {
  const fatiguePenalty = hasPerk(unit, 'relentless')
    ? unit.fatigue * (1 - getPerkEffect('relentless', 'fatigueInitPenaltyReduce', 0.5))
    : unit.fatigue;
  return Math.max(0, unit.stats.initiative - fatiguePenalty);
};

// ==================== Tier 4 武器精通 ====================

/**
 * 获取武器精通对应的 perkId
 * @param weaponClass 武器类别
 * @returns 对应的精通 perkId，如果没有则返回 null
 */
const WEAPON_MASTERY_MAP: Record<string, string> = {
  'sword': 'sword_mastery',
  'spear': 'spear_mastery',
  'polearm': 'polearm_mastery',
  'axe': 'axe_mastery',
  'hammer': 'hammer_mastery',
  'flail': 'flail_mastery',
  'cleaver': 'cleaver_mastery',
  'dagger': 'dagger_mastery',
  'bow': 'bow_mastery',
  'crossbow': 'crossbow_mastery',
  'throw': 'throwing_mastery',
};

/**
 * 检查单位是否拥有当前武器的精通
 */
export const hasWeaponMastery = (unit: CombatUnit): boolean => {
  const weapon = unit.equipment.mainHand;
  if (!weapon?.weaponClass) return false;
  const masteryId = WEAPON_MASTERY_MAP[weapon.weaponClass];
  if (!masteryId) return false;
  return hasPerk(unit, masteryId);
};

/**
 * 获取武器精通的疲劳减免系数
 * 效果：技能疲劳消耗 -25%
 * @returns 乘数（0.75 表示减少25%），无精通返回 1
 */
export const getWeaponMasteryFatigueMultiplier = (unit: CombatUnit): number => {
  if (!hasWeaponMastery(unit)) return 1;
  return 0.75; // -25%
};

/**
 * 获取武器精通的额外效果
 * 各类武器精通的特殊加成
 */
export const getWeaponMasteryEffects = (unit: CombatUnit): {
  /** 长兵精通：攻击AP减至5 */
  reducedApCost?: number;
  /** 匕首精通：普攻只需3AP */
  daggerReducedAp?: number;
  /** 弓术精通：射程+1 */
  bowRangeBonus?: number;
  /** 弩术精通：穿甲伤害+20% */
  crossbowArmorPenBonus?: number;
  /** 重锤精通：对护甲伤害+33% */
  hammerArmorDmgBonus?: number;
  /** 连枷精通：无视盾牌防御 */
  ignoreShieldDef?: boolean;
  /** 投掷精通：近距离伤害加成 */
  throwDistanceBonus?: boolean;
} => {
  const weapon = unit.equipment.mainHand;
  if (!weapon?.weaponClass) return {};
  const wc = weapon.weaponClass;
  
  if (wc === 'polearm' && hasPerk(unit, 'polearm_mastery')) {
    return { reducedApCost: 5 };
  }
  if (wc === 'dagger' && hasPerk(unit, 'dagger_mastery')) {
    return { daggerReducedAp: 3 };
  }
  if (wc === 'bow' && hasPerk(unit, 'bow_mastery')) {
    return { bowRangeBonus: 1 };
  }
  if (wc === 'crossbow' && hasPerk(unit, 'crossbow_mastery')) {
    return { crossbowArmorPenBonus: 0.2 };
  }
  if (wc === 'hammer' && hasPerk(unit, 'hammer_mastery')) {
    return { hammerArmorDmgBonus: 0.33 };
  }
  if (wc === 'flail' && hasPerk(unit, 'flail_mastery')) {
    return { ignoreShieldDef: true };
  }
  if (wc === 'throw' && hasPerk(unit, 'throwing_mastery')) {
    return { throwDistanceBonus: true };
  }
  return {};
};

// ==================== Tier 5 被动 ====================

/**
 * 独胆 (lone_wolf)
 * 效果：若周围 3 格内无盟友，全属性 +15%
 * @returns 是否处于独胆状态
 */
export const isLoneWolfActive = (unit: CombatUnit, state: CombatState): boolean => {
  if (!hasPerk(unit, 'lone_wolf')) return false;
  const range = getPerkEffect('lone_wolf', 'allyCheckRange', 3);
  const hasAllyNearby = state.units.some(u =>
    !u.isDead &&
    u.team === unit.team &&
    u.id !== unit.id &&
    getHexDistance(u.combatPos, unit.combatPos) <= range
  );
  return !hasAllyNearby;
};

/**
 * 获取独胆的全属性加成乘数
 */
export const getLoneWolfMultiplier = (): number => {
  return 1 + getPerkEffect('lone_wolf', 'allStatMult', 0.15);
};

/**
 * 破围 (underdog)
 * 效果：敌人对自己进行包围攻击时，不再获得包围加成
 */
export const hasUnderdog = (unit: CombatUnit): boolean => {
  return hasPerk(unit, 'underdog');
};

/**
 * 压制 (overwhelm)
 * 效果：每次攻击命中或被格挡，令目标下回合全攻击力 -10%
 * @returns 应施加的压制层数增量
 */
export const getOverwhelmStacks = (unit: CombatUnit): number => {
  if (!hasPerk(unit, 'overwhelm')) return 0;
  return 1; // 每次命中+1层
};

/**
 * 获取被压制后的攻击力减免
 * @param stacks 被压制的层数
 * @returns 攻击力乘数（0.9 = 1层, 0.8 = 2层...）
 */
export const getOverwhelmPenalty = (stacks: number): number => {
  if (stacks <= 0) return 1;
  const reducePerStack = getPerkEffect('overwhelm', 'targetAtkReduce', 0.1);
  return Math.max(0.5, 1 - stacks * reducePerStack); // 最低50%
};

/**
 * 兵势 (reach_advantage)
 * 效果：每次双手武器攻击命中，近战防御 +5
 * @returns 应累加的近战防御加成
 */
export const getReachAdvantageBonus = (unit: CombatUnit): number => {
  if (!hasPerk(unit, 'reach_advantage')) return 0;
  // 必须持有双手武器
  const weapon = unit.equipment.mainHand;
  if (!weapon?.twoHanded) return 0;
  return getPerkEffect('reach_advantage', 'defPerHit', 5);
};

// ==================== Tier 6 被动 ====================

/**
 * 轻甲流 (nimble)
 * 效果：受到的生命值伤害降低，越轻越硬，最高减伤 60%
 * 减伤公式：基于护甲负重（maxFatiguePenalty），负重越低减伤越高
 * @returns 伤害乘数（0.4~1.0）
 */
export const getNimbleDamageReduction = (unit: CombatUnit): number => {
  if (!hasPerk(unit, 'nimble')) return 1;
  const maxReduce = getPerkEffect('nimble', 'maxDmgReduce', 0.6);
  // 基于护甲总负重：负重越高减伤越低
  let totalPenalty = 0;
  if (unit.equipment.armor?.maxFatiguePenalty) {
    totalPenalty += unit.equipment.armor.maxFatiguePenalty;
  }
  if (unit.equipment.helmet?.maxFatiguePenalty) {
    totalPenalty += unit.equipment.helmet.maxFatiguePenalty;
  }
  // 负重 0 → 最大减伤60%；负重 30+ → 无减伤
  // 线性过渡：每点负重减少 2% 减伤
  const reductionPct = Math.max(0, maxReduce - totalPenalty * 0.02);
  return 1 - reductionPct;
};

/**
 * 重甲流 (battle_forged)
 * 效果：受到的护甲伤害降低，降低幅度为当前总护甲值的 5%
 * @returns 护甲伤害的减免值
 */
export const getBattleForgedReduction = (unit: CombatUnit, hitLocation: 'HEAD' | 'BODY'): number => {
  if (!hasPerk(unit, 'battle_forged')) return 0;
  const ratio = getPerkEffect('battle_forged', 'armorDmgReduceRatio', 0.05);
  // 计算当前总护甲值
  let totalArmor = 0;
  if (unit.equipment.armor) totalArmor += unit.equipment.armor.durability;
  if (unit.equipment.helmet) totalArmor += unit.equipment.helmet.durability;
  // 减伤值 = 总护甲 × 5%
  const reduction = Math.floor(totalArmor * ratio);
  return reduction;
};

/**
 * 狂战 (berserk)
 * 效果：每回合第一次击杀敌人，立即回复 4 AP
 * @returns 应回复的 AP
 */
export const getBerserkAPRecovery = (unit: CombatUnit): number => {
  if (!hasPerk(unit, 'berserk')) return 0;
  return getPerkEffect('berserk', 'apOnKill', 4);
};

/**
 * 索首 (head_hunter)
 * 效果：每次攻击命中身体，下次攻击必定命中头部
 */
export const hasHeadHunter = (unit: CombatUnit): boolean => {
  return hasPerk(unit, 'head_hunter');
};

// ==================== Tier 7 被动 ====================

/**
 * 杀意 (killing_frenzy)
 * 效果：击杀敌人后，所有攻击伤害增加 25%，持续 2 回合
 * @returns 伤害加成乘数
 */
export const getKillingFrenzyMultiplier = (unit: CombatUnit): number => {
  if (!hasPerk(unit, 'killing_frenzy')) return 1;
  if ((unit.killingFrenzyTurns || 0) > 0) {
    return 1 + getPerkEffect('killing_frenzy', 'dmgMultOnKill', 0.25);
  }
  return 1;
};

/**
 * 独胆宗师 (duelist)
 * 效果：当副手空缺时，单手武器攻击无视额外 25% 的护甲
 * @returns 额外的穿甲加成
 */
export const getDuelistArmorIgnore = (unit: CombatUnit): number => {
  if (!hasPerk(unit, 'duelist')) return 0;
  // 副手必须空缺
  if (unit.equipment.offHand) return 0;
  // 主手必须是单手武器
  const weapon = unit.equipment.mainHand;
  if (!weapon || weapon.twoHanded) return 0;
  return getPerkEffect('duelist', 'extraArmorIgnore', 0.25);
};

/**
 * 威压 (fearsome)
 * 效果：任何造成至少 1 点伤害的攻击都会触发敌人的士气检定
 */
export const hasFearsome = (unit: CombatUnit): boolean => {
  return hasPerk(unit, 'fearsome');
};

/**
 * 补刀手 (executioner)
 * 效果：对受到"重伤"影响的敌人（HP < 50%），伤害增加 20%
 * @returns 伤害加成乘数
 */
export const getExecutionerMultiplier = (attacker: CombatUnit, target: CombatUnit): number => {
  if (!hasPerk(attacker, 'executioner')) return 1;
  // 判断目标是否受到"重伤"（HP低于最大生命50%）
  if (target.hp < target.maxHp * 0.5) {
    return 1 + getPerkEffect('executioner', 'injuredDmgMult', 0.2);
  }
  return 1;
};

/**
 * 不屈 (indomitable)
 * 效果：受到伤害减半，持续1回合
 * @returns 伤害乘数（0.5 或 1）
 */
export const getIndomitableDamageMultiplier = (unit: CombatUnit): number => {
  if (unit.isIndomitable) return 0.5;
  return 1;
};

// ==================== 投掷精通距离加成 ====================

/**
 * 投掷精通 (throwing_mastery)
 * 效果：距离越近伤害越高
 * @returns 伤害乘数
 */
export const getThrowingDistanceMultiplier = (attacker: CombatUnit, target: CombatUnit): number => {
  if (!hasPerk(attacker, 'throwing_mastery')) return 1;
  const weapon = attacker.equipment.mainHand;
  if (!weapon || weapon.weaponClass !== 'throw') return 1;
  const dist = getHexDistance(attacker.combatPos, target.combatPos);
  // 距离1: +30%, 距离2: +15%, 距离3+: 无加成
  if (dist <= 1) return 1.3;
  if (dist <= 2) return 1.15;
  return 1;
};

// ==================== 回合状态管理 ====================

/**
 * 回合开始时重置的状态
 * 在新回合开始时调用，重置各种回合制状态
 */
export const resetTurnStartStates = (unit: CombatUnit): CombatUnit => {
  let updated = { ...unit };
  // 重置兵势加成
  if (updated.reachAdvantageBonus) {
    updated.reachAdvantageBonus = 0;
  }
  // 杀意回合递减
  if ((updated.killingFrenzyTurns || 0) > 0) {
    updated.killingFrenzyTurns = (updated.killingFrenzyTurns || 0) - 1;
  }
  // 重置不屈
  if (updated.isIndomitable) {
    updated.isIndomitable = false;
  }
  // 重置压制层数（每回合清零，在受到攻击时重新累加）
  if (updated.overwhelmStacks) {
    updated.overwhelmStacks = 0;
  }
  return updated;
};

/**
 * 处理血勇(adrenaline)回合顺序调整
 * @param turnOrder 当前回合顺序
 * @param units 当前所有单位
 * @returns 调整后的回合顺序
 */
export const applyAdrenalineTurnOrder = (turnOrder: string[], units: CombatUnit[]): string[] => {
  const adrenalineUnits = units.filter(u => !u.isDead && u.adrenalineActive);
  if (adrenalineUnits.length === 0) return turnOrder;
  
  const newOrder = [...turnOrder];
  for (const unit of adrenalineUnits) {
    const idx = newOrder.indexOf(unit.id);
    if (idx > 0) {
      newOrder.splice(idx, 1);
      newOrder.unshift(unit.id);
    }
  }
  return newOrder;
};
