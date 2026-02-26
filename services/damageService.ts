/**
 * 伤害计算服务 —— 仿《战场兄弟》护甲机制
 * 
 * 核心规则：
 * 1. 每次攻击掷骰决定基础伤害（基于武器 dmgMin~dmgMax）
 * 2. 判定击中部位：~25% 头部 / ~75% 身体
 * 3. 伤害先由护甲吸收：
 *    - 护甲耐久扣减 = baseDamage × weapon.armorDmg
 *    - 穿甲HP伤害   = baseDamage × weapon.armorPen
 * 4. 若护甲耐久被击穿(<=0)，溢出部分追加到 HP 伤害
 * 5. 无护甲时伤害全部作用于 HP
 * 6. 命中必伤（最低 1 HP）
 * 
 * 集成技能：
 * - 铁额 (steel_brow): 头部不暴击
 * - 致残击 (crippling_strikes): 降低暴击判定阈值
 * - 补刀手 (executioner): 对重伤敌人+20%伤害
 * - 轻甲流 (nimble): 减少HP伤害
 * - 重甲流 (battle_forged): 减少护甲伤害
 * - 独胆宗师 (duelist): 副手空时忽略25%护甲
 * - 杀意 (killing_frenzy): 击杀后+25%伤害
 * - 索首 (head_hunter): 命中身体后下次打头
 * - 不屈 (indomitable): 受伤减半
 * - 压制 (overwhelm): 命中后削弱目标
 * - 武器精通: 各种特殊效果
 */

import { CombatUnit, Item, MoraleStatus } from '../types';
import { getMoraleEffects } from './moraleService';
import {
  hasPerk,
  getCritThresholdMult,
  getExecutionerMultiplier,
  getNimbleDamageReduction,
  getBattleForgedReduction,
  getDuelistArmorIgnore,
  getKillingFrenzyMultiplier,
  hasSteelBrow,
  getIndomitableDamageMultiplier,
  getWeaponMasteryEffects,
  getThrowingDistanceMultiplier,
  getOverwhelmPenalty,
} from './perkService';

// ==================== 常量 ====================

/** 头部命中概率 */
export const HEAD_HIT_CHANCE = 0.25;

/** 身体命中概率（1 - HEAD_HIT_CHANCE） */
export const BODY_HIT_CHANCE = 1 - HEAD_HIT_CHANCE;

/** 头部伤害加成倍率（头部更脆弱） */
export const HEADSHOT_DAMAGE_MULT = 1.5;

/** 徒手基础伤害范围 */
export const UNARMED_DAMAGE: [number, number] = [5, 15];

/** 徒手穿甲率 */
export const UNARMED_ARMOR_PEN = 0.3;

/** 徒手破甲效率 */
export const UNARMED_ARMOR_DMG = 0.5;

/** 近战双手武器基础伤害倍率（弓/弩不生效） */
export const TWO_HANDED_MELEE_DAMAGE_MULT = 1.1;

// ==================== 类型定义 ====================

export type HitLocation = 'HEAD' | 'BODY';

export interface DamageResult {
  /** 击中部位 */
  hitLocation: HitLocation;
  /** 武器基础伤害（掷骰结果） */
  baseDamage: number;
  /** 护甲受损值 */
  armorDamageDealt: number;
  /** 实际造成的 HP 伤害 */
  hpDamageDealt: number;
  /** 总有效伤害 = armorDamageDealt + hpDamageDealt（用于显示） */
  totalEffectiveDamage: number;
  /** 护甲是否被击穿（耐久降为0） */
  armorDestroyed: boolean;
  /** 被击中护甲的新耐久值 */
  newArmorDurability: number;
  /** 被击中护甲的旧耐久值 */
  oldArmorDurability: number;
  /** 是否暴击（伤害超过基础伤害的80%） */
  isCritical: boolean;
  /** 目标是否会被击杀 */
  willKill: boolean;
  /** 目标被击中的护甲类型 */
  armorType: 'ARMOR' | 'HELMET' | null;
}

// ==================== 核心伤害计算 ====================

/**
 * 判定击中部位
 */
export const rollHitLocation = (): HitLocation => {
  return Math.random() < HEAD_HIT_CHANCE ? 'HEAD' : 'BODY';
};

/**
 * 从武器掷骰基础伤害
 */
export const rollBaseDamage = (weapon: Item | null): number => {
  if (weapon?.damage) {
    const [minDmg, maxDmg] = weapon.damage;
    return Math.floor(Math.random() * (maxDmg - minDmg + 1)) + minDmg;
  }
  // 徒手
  const [minDmg, maxDmg] = UNARMED_DAMAGE;
  return Math.floor(Math.random() * (maxDmg - minDmg + 1)) + minDmg;
};

/**
 * 获取武器的穿甲率
 */
const getArmorPen = (weapon: Item | null): number => {
  if (weapon?.armorPen !== undefined) return weapon.armorPen;
  return UNARMED_ARMOR_PEN;
};

/**
 * 获取武器的破甲效率
 */
const getArmorDmg = (weapon: Item | null): number => {
  if (weapon?.armorDmg !== undefined) return weapon.armorDmg;
  return UNARMED_ARMOR_DMG;
};

/**
 * 是否为可享受双手加伤的近战武器
 * 规则：必须 twoHanded，且排除 bow/crossbow
 */
const isTwoHandedMeleeWeapon = (weapon: Item | null): boolean => {
  if (!weapon?.twoHanded) return false;
  return weapon.weaponClass !== 'bow' && weapon.weaponClass !== 'crossbow';
};

/**
 * 核心伤害计算函数
 * 
 * @param attacker 攻击者
 * @param target 目标
 * @param options 可选参数
 * @returns DamageResult 结构化伤害结果
 */
export const calculateDamage = (
  attacker: CombatUnit,
  target: CombatUnit,
  options?: {
    /** 强制指定击中部位（不掷骰） */
    forceHitLocation?: HitLocation;
    /** 伤害乘数（如截击 0.8x） */
    damageMult?: number;
    /** 跳过士气修正 */
    skipMorale?: boolean;
    /** 额外伤害加成（固定值，如狂战士） */
    bonusDamage?: number;
    /** 是否为反击（纯钧反击伤害+25%） */
    isRiposte?: boolean;
    /** 使用的技能ID（用于红武被动判断） */
    abilityId?: string;
  }
): DamageResult => {
  const weapon = attacker.equipment.mainHand;
  
  // 1. 掷骰基础伤害
  let baseDamage = rollBaseDamage(weapon);
  
  // 应用伤害乘数（如截击系数）
  if (options?.damageMult) {
    baseDamage = Math.floor(baseDamage * options.damageMult);
  }
  
  // 应用士气修正
  if (!options?.skipMorale) {
    const moraleEffects = getMoraleEffects(attacker.morale);
    baseDamage = Math.floor(baseDamage * (1 + moraleEffects.damageMod / 100));
  }
  
  // 应用额外伤害加成
  if (options?.bonusDamage) {
    baseDamage += options.bonusDamage;
  }

  // === 近战双手武器：基础伤害加成（弓/弩排除） ===
  if (isTwoHandedMeleeWeapon(weapon)) {
    baseDamage = Math.floor(baseDamage * TWO_HANDED_MELEE_DAMAGE_MULT);
  }
  
  // === 补刀手 (executioner): 对重伤敌人+20%伤害 ===
  const executionerMult = getExecutionerMultiplier(attacker, target);
  if (executionerMult > 1) {
    baseDamage = Math.floor(baseDamage * executionerMult);
  }
  
  // === 杀意 (killing_frenzy): 击杀后+25%伤害 ===
  const killingFrenzyMult = getKillingFrenzyMultiplier(attacker);
  if (killingFrenzyMult > 1) {
    baseDamage = Math.floor(baseDamage * killingFrenzyMult);
  }
  
  // === 压制 (overwhelm) 被动效果：被压制后攻击力降低 ===
  if ((attacker.overwhelmStacks || 0) > 0) {
    const penalty = getOverwhelmPenalty(attacker.overwhelmStacks || 0);
    baseDamage = Math.floor(baseDamage * penalty);
  }
  
  // === 投掷精通: 近距离伤害加成 ===
  const throwMult = getThrowingDistanceMultiplier(attacker, target);
  if (throwMult > 1) {
    baseDamage = Math.floor(baseDamage * throwMult);
  }

  // === 红武被动效果：伤害修正 ===
  const weaponId = weapon?.id;
  // 项羽戟「破釜沉舟」（被动）：HP<50%时伤害+25%，穿甲+10%
  if (weaponId === 'w_unique_xiangyu' && attacker.hp < attacker.maxHp * 0.5) {
    baseDamage = Math.floor(baseDamage * 1.25);
  }
  // 纯钧「百发百中」（被动）：反击伤害+25%
  if (weaponId === 'w_unique_chunjun' && options?.isRiposte) {
    baseDamage = Math.floor(baseDamage * 1.25);
  }

  // === 红武主动技能：伤害修正 ===
  const abilityId = options?.abilityId;
  // 干将「焚剑」：伤害×1.5，对HP>50%目标额外+15%
  if (abilityId === 'GANJIANG_FLAME') {
    baseDamage = Math.floor(baseDamage * 1.5);
    if (target.hp > target.maxHp * 0.5) baseDamage = Math.floor(baseDamage * 1.15);
  }
  // 莫邪「影刺」：伤害×1.3，对HP≤50%目标额外+20%
  if (abilityId === 'MOYE_SHADOW') {
    baseDamage = Math.floor(baseDamage * 1.3);
    if (target.hp <= target.maxHp * 0.5) baseDamage = Math.floor(baseDamage * 1.2);
  }
  // 雷公鞭「雷霆万钧」：伤害×1.3
  if (abilityId === 'LEIGONG_THUNDER') {
    baseDamage = Math.floor(baseDamage * 1.3);
  }
  // 荆轲匕「见血封喉」：HP<30%伤害×3，否则×1.5
  if (abilityId === 'JINGKE_EXECUTE') {
    if (target.hp < target.maxHp * 0.3) baseDamage = baseDamage * 3;
    else baseDamage = Math.floor(baseDamage * 1.5);
  }
  // 养由基弓「百步穿杨」：伤害×1.5
  if (abilityId === 'YANGYOUJI_SNIPE') {
    baseDamage = Math.floor(baseDamage * 1.5);
  }
  
  // 确保最低1点伤害
  baseDamage = Math.max(1, baseDamage);
  
  // 2. 判定击中部位
  let hitLocation: HitLocation;
  if (options?.forceHitLocation) {
    hitLocation = options.forceHitLocation;
  } else if (attacker.headHunterActive && hasPerk(attacker, 'head_hunter')) {
    // === 索首 (head_hunter): 命中身体后下次必定打头 ===
    hitLocation = 'HEAD';
  } else {
    hitLocation = rollHitLocation();
  }
  
  // 3. 获取对应部位的护甲
  const armorItem = hitLocation === 'HEAD' ? target.equipment.helmet : target.equipment.armor;
  const armorDurability = armorItem ? armorItem.durability : 0;
  const armorType = hitLocation === 'HEAD' ? 'HELMET' : 'ARMOR';
  
  // 4. 获取武器穿甲/破甲属性
  let armorPen = getArmorPen(weapon);
  let armorDmgMult = getArmorDmg(weapon);
  
  // === 独胆宗师 (duelist): 副手空时穿甲+25% ===
  const duelistBonus = getDuelistArmorIgnore(attacker);
  if (duelistBonus > 0) {
    armorPen += duelistBonus;
  }
  
  // === 武器精通特殊效果 ===
  const masteryEffects = getWeaponMasteryEffects(attacker);
  // 弩术精通：穿甲+20%
  if (masteryEffects.crossbowArmorPenBonus) {
    armorPen += masteryEffects.crossbowArmorPenBonus;
  }
  // 重锤精通：破甲效率+33%
  if (masteryEffects.hammerArmorDmgBonus) {
    armorDmgMult += masteryEffects.hammerArmorDmgBonus;
  }

  // === 红武被动效果：护甲相关修正 ===
  // 项羽戟「破釜沉舟」（被动）：HP<50%时穿甲+10%
  if (weaponId === 'w_unique_xiangyu' && attacker.hp < attacker.maxHp * 0.5) {
    armorPen += 0.10;
  }
  // === 红武主动技能：护甲相关修正 ===
  // 龙牙刀「斩铁」：护甲伤害×3
  if (abilityId === 'LONGYA_IRONCUT') {
    armorDmgMult *= 3;
  }

  let armorDamageDealt = 0;
  let hpDamageDealt = 0;
  let armorDestroyed = false;
  let newArmorDurability = armorDurability;
  
  if (armorDurability > 0 && armorItem) {
    // 5. 有护甲：计算护甲受损和穿甲伤害
    
    // 护甲受损 = 基础伤害 × 破甲效率
    armorDamageDealt = Math.floor(baseDamage * armorDmgMult);
    armorDamageDealt = Math.max(1, armorDamageDealt); // 至少1点护甲伤害
    
    // === 重甲流 (battle_forged): 护甲伤害减免 ===
    const bfReduction = getBattleForgedReduction(target, hitLocation);
    if (bfReduction > 0) {
      armorDamageDealt = Math.max(1, armorDamageDealt - bfReduction);
    }
    
    // 穿甲HP伤害 = 基础伤害 × 穿甲率
    hpDamageDealt = Math.floor(baseDamage * armorPen);
    
    // 头部命中时HP伤害额外加成
    if (hitLocation === 'HEAD') {
      // === 铁额 (steel_brow): 头部不再有暴击伤害加成 ===
      if (!hasSteelBrow(target)) {
        hpDamageDealt = Math.floor(hpDamageDealt * HEADSHOT_DAMAGE_MULT);
      }
    }
    
    // 检查护甲是否被击穿
    newArmorDurability = armorDurability - armorDamageDealt;
    if (newArmorDurability <= 0) {
      armorDestroyed = true;
      // 溢出伤害追加到 HP
      const overflow = Math.abs(newArmorDurability);
      hpDamageDealt += overflow;
      newArmorDurability = 0;
    }
  } else {
    // 6. 无护甲：全部伤害作用于 HP
    hpDamageDealt = baseDamage;
    
    // 头部无盔加成
    if (hitLocation === 'HEAD') {
      if (!hasSteelBrow(target)) {
        hpDamageDealt = Math.floor(hpDamageDealt * HEADSHOT_DAMAGE_MULT);
      }
    }
  }
  
  // === 轻甲流 (nimble): HP伤害减免 ===
  const nimbleMult = getNimbleDamageReduction(target);
  if (nimbleMult < 1) {
    hpDamageDealt = Math.max(1, Math.floor(hpDamageDealt * nimbleMult));
  }
  
  // === 不屈 (indomitable): 受到伤害减半 ===
  const indomitableMult = getIndomitableDamageMultiplier(target);
  if (indomitableMult < 1) {
    hpDamageDealt = Math.max(1, Math.floor(hpDamageDealt * indomitableMult));
    armorDamageDealt = Math.max(1, Math.floor(armorDamageDealt * indomitableMult));
  }
  
  // 7. 命中必伤（至少1HP）
  hpDamageDealt = Math.max(1, hpDamageDealt);
  
  // 判定暴击（伤害超过武器最大伤害的 critThreshold）
  const maxDmg = weapon?.damage ? weapon.damage[1] : UNARMED_DAMAGE[1];
  // === 致残击 (crippling_strikes): 降低暴击阈值 ===
  const critThreshold = getCritThresholdMult(attacker.perks || []);
  // === 铁额 (steel_brow): 头部命中时不触发暴击 ===
  const isCritical = (hitLocation === 'HEAD' && hasSteelBrow(target))
    ? false
    : baseDamage >= maxDmg * critThreshold;
  
  // 判定是否击杀
  const willKill = target.hp - hpDamageDealt <= 0;
  
  return {
    hitLocation,
    baseDamage,
    armorDamageDealt,
    hpDamageDealt,
    totalEffectiveDamage: armorDamageDealt + hpDamageDealt,
    armorDestroyed,
    newArmorDurability,
    oldArmorDurability: armorDurability,
    isCritical,
    willKill,
    armorType: armorItem ? armorType : null,
  };
};

// ==================== 日志生成工具 ====================

/**
 * 生成伤害日志文本
 */
export const getDamageLogText = (
  attackerName: string,
  targetName: string,
  weaponName: string,
  abilityName: string,
  result: DamageResult
): string => {
  const locationText = result.hitLocation === 'HEAD' ? '头部' : '身体';
  
  let log = `${attackerName}「${weaponName}」${abilityName} → ${targetName}【${locationText}】`;
  
  if (result.isCritical) {
    log += '暴击！';
  }
  
  if (result.armorType && result.armorDamageDealt > 0) {
    const armorName = result.armorType === 'HELMET' ? '头盔' : '护甲';
    log += `${armorName} -${result.armorDamageDealt}`;
    if (result.armorDestroyed) {
      log += '(破碎!)';
    }
    log += `，`;
  }
  
  log += `生命 -${result.hpDamageDealt}`;
  
  if (result.willKill) {
    log += '，致命一击！';
  }
  
  return log;
};

/**
 * 生成截击伤害日志文本
 */
export const getInterceptDamageLogText = (
  attackerName: string,
  targetName: string,
  result: DamageResult,
  movementBlocked: boolean
): string => {
  const locationText = result.hitLocation === 'HEAD' ? '头部' : '身体';
  
  let log = `${attackerName} 截击 ${targetName}【${locationText}】`;
  
  if (result.armorType && result.armorDamageDealt > 0) {
    const armorName = result.armorType === 'HELMET' ? '头盔' : '护甲';
    log += `${armorName} -${result.armorDamageDealt}`;
    if (result.armorDestroyed) {
      log += '(破碎!)';
    }
    log += `，`;
  }
  
  log += `生命 -${result.hpDamageDealt}`;
  
  if (result.willKill) {
    log += '，将其击杀！';
  } else if (movementBlocked) {
    log += '，阻止了移动！';
  } else {
    log += '，但未能阻止移动。';
  }
  
  return log;
};
