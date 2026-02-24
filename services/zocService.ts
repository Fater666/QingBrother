/**
 * 控制区（Zone of Control）服务
 * 实现类似《战场兄弟》的截击机制
 * 
 * 机制说明：
 * 1. 每个单位对周围6格施加控制区
 * 2. 当单位尝试离开敌方控制区时，敌人可进行截击攻击
 * 3. 截击命中后，判定是否阻止移动
 * 4. 如果阻止成功，移动失败，单位留在原地
 */

import { CombatUnit, CombatState, MoraleStatus } from '../types';
import { getHexDistance, getThreateningEnemies, isInEnemyZoC, hasFootworkPerk, getSurroundingBonus } from '../constants';
import { getMoraleEffects } from './moraleService';
import { calculateDamage, DamageResult } from './damageService';

// ==================== 截击系统常量 ====================

/** 截击攻击命中率加成（比正常攻击更高，符合“转身脱离更易被砍”的设计，参考《战场兄弟》） */
export const FREE_ATTACK_HIT_BONUS = 10;

/** 截击攻击伤害系数（正常伤害的百分比） */
export const FREE_ATTACK_DAMAGE_MULT = 0.8;

/** 基础移动阻止概率（截击命中后） */
export const BASE_MOVEMENT_BLOCK_CHANCE = 0.6;

/** 脱身技能的AP消耗 */
export const FOOTWORK_AP_COST = 3;

/** 脱身技能的疲劳消耗 */
export const FOOTWORK_FATIGUE_COST = 15;

// ==================== 类型定义 ====================

export interface FreeAttackResult {
  attacker: CombatUnit;
  target: CombatUnit;
  hit: boolean;
  damage: number;
  hpDamage: number;
  movementBlocked: boolean;
  targetKilled: boolean;
  hitChance: number;
  blockChance: number;
  damageResult?: DamageResult; // 完整的护甲伤害计算结果
}

export interface ZoCCheckResult {
  inEnemyZoC: boolean;
  threateningEnemies: CombatUnit[];
  canUseFootwork: boolean;
  footworkApCost: number;
  footworkFatCost: number;
}

export interface ZoCStepEnterResult {
  enteringEnemyZoC: boolean;
  threateningEnemies: CombatUnit[];
}

// ==================== 截击计算函数 ====================

/**
 * 计算截击攻击的命中率
 * @param attacker 攻击者
 * @param target 目标（移动中的单位）
 * @param state 战斗状态（用于计算合围加成）
 * @returns 命中率（0-100）
 */
export const calculateFreeAttackHitChance = (
  attacker: CombatUnit,
  target: CombatUnit,
  state?: CombatState
): number => {
  // 基础命中率 = 攻击者近战技能
  let hitChance = attacker.stats.meleeSkill;
  
  // 减去目标近战防御
  hitChance -= target.stats.meleeDefense;
  
  // 截击命中率加成（目标在脱离控制区，更易被命中）
  hitChance += FREE_ATTACK_HIT_BONUS;
  
  // 武器命中修正
  const weapon = attacker.equipment.mainHand;
  if (weapon?.hitChanceMod) {
    hitChance += weapon.hitChanceMod;
  }
  
  // 士气影响
  const attackerMorale = getMoraleEffects(attacker.morale);
  hitChance += attackerMorale.hitChanceMod || 0;
  
  // 目标盾牌防御加成
  const shield = target.equipment.offHand;
  if (shield?.type === 'SHIELD' && shield.defenseBonus) {
    hitChance -= shield.defenseBonus;
  }
  
  // 盾墙状态额外防御
  if (target.isShieldWall && shield?.type === 'SHIELD') {
    hitChance -= 15;
  }
  
  // 合围加成
  if (state) {
    hitChance += getSurroundingBonus(attacker, target, state);
  }
  
  // 限制在5-95之间
  return Math.max(5, Math.min(95, hitChance));
};

/**
 * 计算截击攻击的伤害（使用护甲系统）
 * @param attacker 攻击者
 * @param target 目标
 * @param extraDamageMult 额外伤害倍率（如霸王枪矛墙×1.5）
 * @returns DamageResult 结构化伤害结果
 */
export const calculateFreeAttackDamageWithArmor = (
  attacker: CombatUnit,
  target: CombatUnit,
  extraDamageMult?: number
): DamageResult => {
  return calculateDamage(attacker, target, {
    damageMult: FREE_ATTACK_DAMAGE_MULT * (extraDamageMult ?? 1),
  });
};

/**
 * 计算移动阻止概率
 * @param attacker 截击者
 * @param target 移动单位
 * @param damage 造成的伤害
 * @returns 阻止概率（0-1）
 */
export const calculateMovementBlockChance = (
  attacker: CombatUnit,
  target: CombatUnit,
  damage: number
): number => {
  let blockChance = BASE_MOVEMENT_BLOCK_CHANCE;
  
  // 伤害越高，阻止概率越高
  const hpPercent = target.hp / target.maxHp;
  const damageRatio = damage / target.maxHp;
  blockChance += damageRatio * 0.5; // 伤害占最大生命值的比例增加阻止率
  
  // 攻击者使用重武器增加阻止概率
  const weapon = attacker.equipment.mainHand;
  if (weapon) {
    const wc = weapon.combatClass || weapon.weaponClass;
    if (wc === 'axe' || wc === 'hammer' || wc === 'mace' || wc === 'flail') {
      blockChance += 0.15; // 重武器更容易阻止移动
    }
    if (wc === 'spear' || wc === 'polearm') {
      blockChance += 0.1; // 长兵器也有一定阻止效果
    }
  }
  
  // 目标士气影响（士气低更容易被阻止）
  if (target.morale === MoraleStatus.WAVERING) {
    blockChance += 0.1;
  } else if (target.morale === MoraleStatus.BREAKING) {
    blockChance += 0.2;
  } else if (target.morale === MoraleStatus.FLEEING) {
    blockChance += 0.3;
  }
  
  // 目标血量低更容易被阻止
  if (hpPercent < 0.3) {
    blockChance += 0.15;
  } else if (hpPercent < 0.5) {
    blockChance += 0.05;
  }
  
  // 限制在10%-90%之间（总有小概率成功/失败）
  return Math.max(0.1, Math.min(0.9, blockChance));
};

/**
 * 执行截击攻击（使用护甲伤害系统）
 * @param attacker 截击者
 * @param target 移动单位
 * @param state 战斗状态（用于计算合围加成）
 * @returns 截击结果
 */
export const executeFreeAttack = (
  attacker: CombatUnit,
  target: CombatUnit,
  state?: CombatState,
  extraDamageMult?: number
): FreeAttackResult => {
  const hitChance = calculateFreeAttackHitChance(attacker, target, state);
  const roll = Math.random() * 100;
  const hit = roll <= hitChance;

  let damage = 0;
  let hpDamage = 0;
  let movementBlocked = false;
  let targetKilled = false;
  let blockChance = 0;
  let dmgResult: DamageResult | undefined;
  
  if (hit) {
    // 使用护甲伤害系统计算截击伤害
    dmgResult = calculateFreeAttackDamageWithArmor(attacker, target, extraDamageMult);
    damage = dmgResult.totalEffectiveDamage;
    hpDamage = dmgResult.hpDamageDealt;
    
    // 检查是否击杀（基于HP伤害）
    if (target.hp - hpDamage <= 0) {
      targetKilled = true;
      movementBlocked = true; // 击杀必定阻止移动
    } else {
      // 计算移动阻止（基于HP伤害）
      blockChance = calculateMovementBlockChance(attacker, target, hpDamage);
      movementBlocked = Math.random() < blockChance;
    }
  }
  
  return {
    attacker,
    target,
    hit,
    damage,
    hpDamage,
    movementBlocked,
    targetKilled,
    hitChance,
    blockChance,
    damageResult: dmgResult
  };
};

// ==================== 控制区检查函数 ====================

/**
 * 检查单位移动是否会触发截击
 * @param unit 移动的单位
 * @param fromPos 起始位置
 * @param toPos 目标位置（未使用，但保留以备扩展）
 * @param state 战斗状态
 * @returns 控制区检查结果
 */
export const checkZoCOnMove = (
  unit: CombatUnit,
  fromPos: { q: number; r: number },
  toPos: { q: number; r: number },
  state: CombatState
): ZoCCheckResult => {
  // 检查起始位置是否在敌方控制区内
  const inEnemyZoC = isInEnemyZoC(fromPos, unit, state);
  
  // 获取可以进行截击的敌方单位
  const threateningEnemies = inEnemyZoC 
    ? getThreateningEnemies(fromPos, unit, state)
    : [];
  
  // 检查是否可以使用脱身技能
  const canUseFootwork = hasFootworkPerk(unit) && 
    unit.currentAP >= FOOTWORK_AP_COST &&
    unit.fatigue + FOOTWORK_FATIGUE_COST <= unit.maxFatigue;
  
  return {
    inEnemyZoC,
    threateningEnemies,
    canUseFootwork,
    footworkApCost: FOOTWORK_AP_COST,
    footworkFatCost: FOOTWORK_FATIGUE_COST
  };
};

/**
 * 检查一步移动是否从“非敌方控制区”进入“敌方控制区”
 * @param unit 移动的单位
 * @param fromPos 上一步位置
 * @param toPos 本步目标位置
 * @param state 战斗状态
 */
export const checkZoCEnterOnStep = (
  unit: CombatUnit,
  fromPos: { q: number; r: number },
  toPos: { q: number; r: number },
  state: CombatState
): ZoCStepEnterResult => {
  const wasInEnemyZoC = isInEnemyZoC(fromPos, unit, state);
  const nowInEnemyZoC = isInEnemyZoC(toPos, unit, state);
  const threateningEnemies = nowInEnemyZoC
    ? getThreateningEnemies(toPos, unit, state)
    : [];

  return {
    enteringEnemyZoC: !wasInEnemyZoC && nowInEnemyZoC && threateningEnemies.length > 0,
    threateningEnemies,
  };
};

/**
 * 处理移动时的截击
 * 返回所有截击结果，以及最终是否允许移动
 * @param unit 移动的单位
 * @param fromPos 起始位置
 * @param state 战斗状态
 * @returns 截击结果数组和是否允许移动
 */
export const processZoCAttacks = (
  unit: CombatUnit,
  fromPos: { q: number; r: number },
  state: CombatState
): { results: FreeAttackResult[]; movementAllowed: boolean; totalDamage: number } => {
  const results: FreeAttackResult[] = [];
  let movementAllowed = true;
  let totalDamage = 0;
  
  // 获取可以截击的敌人
  const threateningEnemies = getThreateningEnemies(fromPos, unit, state);
  
  // 按先手值排序（高先手先截击）
  const sortedEnemies = [...threateningEnemies].sort(
    (a, b) => b.stats.initiative - a.stats.initiative
  );
  
  // 每个敌人依次执行截击
  let totalHpDamage = 0;
  for (const enemy of sortedEnemies) {
    // 创建一个临时的目标状态，考虑之前截击造成的HP伤害
    const currentTarget = {
      ...unit,
      hp: unit.hp - totalHpDamage
    };
    
    // 如果目标已死亡，停止截击
    if (currentTarget.hp <= 0) {
      movementAllowed = false;
      break;
    }
    
    const result = executeFreeAttack(enemy, currentTarget as CombatUnit, state);
    results.push(result);
    
    if (result.hit) {
      totalDamage += result.hpDamage;
      totalHpDamage += result.hpDamage;
      
      // 如果移动被阻止，后续截击不再执行
      if (result.movementBlocked) {
        movementAllowed = false;
        break;
      }
    }
  }
  
  return { results, movementAllowed, totalDamage };
};

const isSpearwallAttacker = (unit: CombatUnit): boolean => {
  if (!unit.isHalberdWall) return false;
  const weapon = unit.equipment.mainHand;
  const weaponClass = weapon?.combatClass || weapon?.weaponClass;
  return weaponClass === 'spear' || weaponClass === 'polearm';
};

/**
 * 处理“进入敌方控制区”时由矛墙触发的截击。
 * 规则：
 * - 仅处于矛墙状态且持矛/长柄武器的单位可触发。
 * - 命中时必定阻止移动；未命中则视为被躲开，可继续前进（破解矛墙）。
 */
export const processSpearwallEntryAttacks = (
  unit: CombatUnit,
  threateningEnemies: CombatUnit[],
  state: CombatState
): { results: FreeAttackResult[]; movementAllowed: boolean; totalDamage: number; triggered: boolean } => {
  const spearwallEnemies = threateningEnemies.filter(isSpearwallAttacker);
  if (spearwallEnemies.length === 0) {
    return { results: [], movementAllowed: true, totalDamage: 0, triggered: false };
  }

  const results: FreeAttackResult[] = [];
  let totalDamage = 0;
  let totalHpDamage = 0;
  let movementAllowed = true;

  const sortedEnemies = [...spearwallEnemies].sort(
    (a, b) => b.stats.initiative - a.stats.initiative
  );

  for (const enemy of sortedEnemies) {
    const currentTarget = {
      ...unit,
      hp: unit.hp - totalHpDamage
    };
    if (currentTarget.hp <= 0) {
      movementAllowed = false;
      break;
    }

    const result = executeFreeAttack(enemy, currentTarget as CombatUnit, state);
    if (result.hit) {
      result.movementBlocked = true;
      result.blockChance = 1;
    }
    results.push(result);

    if (result.hit) {
      totalDamage += result.hpDamage;
      totalHpDamage += result.hpDamage;
      movementAllowed = false;
      break;
    }
  }

  return { results, movementAllowed, totalDamage, triggered: true };
};

/**
 * 获取截击的日志文本（含护甲信息）
 */
export const getFreeAttackLogText = (result: FreeAttackResult): string => {
  const attackerName = result.attacker.name;
  const targetName = result.target.name;
  
  if (!result.hit) {
    return `${attackerName} 对 ${targetName} 发动截击，但未能命中！`;
  }
  
  const dmg = result.damageResult;
  let dmgDetail = '';
  if (dmg) {
    const locationText = dmg.hitLocation === 'HEAD' ? '头部' : '身体';
    dmgDetail = `【${locationText}】`;
    if (dmg.armorDamageDealt > 0) {
      const armorName = dmg.armorType === 'HELMET' ? '头盔' : '护甲';
      dmgDetail += `${armorName} -${dmg.armorDamageDealt}${dmg.armorDestroyed ? '(破碎!)' : ''}，`;
    }
    dmgDetail += `生命 -${dmg.hpDamageDealt}`;
  } else {
    dmgDetail = `造成 ${result.hpDamage} 伤害`;
  }
  
  if (result.targetKilled) {
    return `${attackerName} 截击 ${targetName}，${dmgDetail}，将其击杀！`;
  }
  
  if (result.movementBlocked) {
    return `${attackerName} 截击 ${targetName}，${dmgDetail}，阻止了其移动！`;
  }
  
  return `${attackerName} 截击 ${targetName}，${dmgDetail}，但未能阻止其移动。`;
};
