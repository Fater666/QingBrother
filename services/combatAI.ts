/**
 * 战斗 AI 效用评估系统
 * 架构参考《战场兄弟》(Battle Brothers) 的三层 Utility AI 设计
 *
 * Layer 1 — 行为积木库：9 个独立行为模块，各自实现 evaluate() + execute()
 * Layer 2 — 权重调参：每种 AIType 通过行为注册表（拥有哪些行为）和权重配置（偏好程度）实现兵种差异
 * Layer 3 — 战术意图：阵营级 TacticalStrategy 修正位置 / 目标评分，实现阵营协同
 *
 * 决策流程：遍历该单位可用行为 → evaluate() 计算效用分 → 乘以权重 → 选最高分执行
 * 原子化执行（已在 CombatView.tsx 中实现）：每执行一个动作后重新调用 executeAITurn
 */

import { CombatState, CombatUnit, AIType, Ability, MoraleStatus } from '../types';
import { getHexDistance, getUnitAbilities, isInEnemyZoC, getThreateningEnemies, getSurroundingBonus } from '../constants';
import { MORALE_ORDER } from './moraleService';
import { isPolearmBacklineAttack } from './combatUtils';

// ==================== 类型定义 ====================

export interface AIAction {
  type: 'MOVE' | 'ATTACK' | 'SKILL' | 'WAIT' | 'FLEE';
  targetPos?: { q: number; r: number };
  targetUnitId?: string;
  ability?: Ability;
  damage?: number;
}

type BehaviorId = 'attackMelee' | 'attackRanged' | 'engage' | 'flee' | 'shieldWall' | 'kite' | 'protectAlly' | 'reload' | 'wait';

interface AIBehavior {
  id: BehaviorId;
  evaluate(unit: CombatUnit, state: CombatState, ctx: AIContext): number;
  execute(unit: CombatUnit, state: CombatState, ctx: AIContext): AIAction;
}

interface TacticalStrategy {
  id: string;
  positionModifier?(pos: { q: number; r: number }, unit: CombatUnit, baseScore: number, ctx: AIContext): number;
  targetModifier?(target: CombatUnit, unit: CombatUnit, baseScore: number, ctx: AIContext): number;
}

interface AIContext {
  enemies: CombatUnit[];
  allies: CombatUnit[];
  inZoC: boolean;
  hpPercent: number;
  moraleIndex: number;
  riskProfile: AIRiskProfile;
  attackAbilities: Ability[];
  allAbilities: Ability[];
  adjacentEnemies: CombatUnit[];
  tactics: TacticalStrategy;
  _cache: Map<string, any>;
}

// ==================== 常量 ====================

const SCORE_THRESHOLD = 5;
const NOISE_FACTOR = 0.08;

// ==================== AI 风险配置（Layer 2 — 位置评估参数） ====================

interface AIRiskProfile {
  zocBasePenalty: number;
  zocThreatPenalty: number;
  lowHpPenalty: number;
  lowMoralePenalty: number;
  allySupportReduction: number;
  engageBonus: number;
  fallbackAdvanceTolerance: number;
  emergencyHpThreshold: number;
  emergencyMoraleIndex: number;
}

const AI_RISK_PROFILES: Record<AIType, AIRiskProfile> = {
  BANDIT: {
    zocBasePenalty: 16, zocThreatPenalty: 24, lowHpPenalty: 24, lowMoralePenalty: 12,
    allySupportReduction: 5, engageBonus: 30, fallbackAdvanceTolerance: 10,
    emergencyHpThreshold: 0.35, emergencyMoraleIndex: 3,
  },
  BEAST: {
    zocBasePenalty: 10, zocThreatPenalty: 18, lowHpPenalty: 14, lowMoralePenalty: 6,
    allySupportReduction: 4, engageBonus: 36, fallbackAdvanceTolerance: 16,
    emergencyHpThreshold: 0.25, emergencyMoraleIndex: 4,
  },
  ARMY: {
    zocBasePenalty: 14, zocThreatPenalty: 20, lowHpPenalty: 18, lowMoralePenalty: 8,
    allySupportReduction: 6, engageBonus: 34, fallbackAdvanceTolerance: 14,
    emergencyHpThreshold: 0.3, emergencyMoraleIndex: 4,
  },
  ARCHER: {
    zocBasePenalty: 20, zocThreatPenalty: 28, lowHpPenalty: 28, lowMoralePenalty: 14,
    allySupportReduction: 4, engageBonus: 10, fallbackAdvanceTolerance: 4,
    emergencyHpThreshold: 0.4, emergencyMoraleIndex: 2,
  },
  BERSERKER: {
    zocBasePenalty: 8, zocThreatPenalty: 16, lowHpPenalty: 8, lowMoralePenalty: 2,
    allySupportReduction: 3, engageBonus: 40, fallbackAdvanceTolerance: 18,
    emergencyHpThreshold: 0.18, emergencyMoraleIndex: 4,
  },
  TANK: {
    zocBasePenalty: 8, zocThreatPenalty: 14, lowHpPenalty: 12, lowMoralePenalty: 4,
    allySupportReduction: 8, engageBonus: 42, fallbackAdvanceTolerance: 20,
    emergencyHpThreshold: 0.2, emergencyMoraleIndex: 4,
  },
  SKIRMISHER: {
    zocBasePenalty: 22, zocThreatPenalty: 30, lowHpPenalty: 26, lowMoralePenalty: 14,
    allySupportReduction: 4, engageBonus: 8, fallbackAdvanceTolerance: 4,
    emergencyHpThreshold: 0.38, emergencyMoraleIndex: 3,
  },
};

const getAIRiskProfile = (unit: CombatUnit): AIRiskProfile => {
  return AI_RISK_PROFILES[unit.aiType || 'BANDIT'] || AI_RISK_PROFILES.BANDIT;
};

// ==================== 工具函数 ====================

const getEnemies = (unit: CombatUnit, state: CombatState): CombatUnit[] =>
  state.units.filter(u => !u.isDead && u.team !== unit.team);

const getAllies = (unit: CombatUnit, state: CombatState): CombatUnit[] =>
  state.units.filter(u => !u.isDead && u.team === unit.team && u.id !== unit.id);

const isHexOccupied = (pos: { q: number; r: number }, state: CombatState): boolean =>
  state.units.some(u => !u.isDead && u.combatPos.q === pos.q && u.combatPos.r === pos.r);

// 检查格子是否被阻挡（单位占用或不可通行地形）
const IMPASSABLE_TERRAIN = new Set(['MOUNTAIN']);
const isHexBlocked = (pos: { q: number; r: number }, state: CombatState): boolean => {
  if (isHexOccupied(pos, state)) return true;
  if (state.terrainGrid) {
    const td = state.terrainGrid.get(`${pos.q},${pos.r}`);
    if (td && IMPASSABLE_TERRAIN.has(td.type)) return true;
  }
  return false;
};

const getMoraleIndex = (morale: MoraleStatus): number => MORALE_ORDER.indexOf(morale);

const addNoise = (score: number): number =>
  score * (1 + (Math.random() - 0.5) * 2 * NOISE_FACTOR);

// ==================== 命中率 / 伤害估算 ====================

const estimateMeleeHitChance = (attacker: CombatUnit, target: CombatUnit, state: CombatState): number => {
  let chance = attacker.stats.meleeSkill - target.stats.meleeDefense;
  if (attacker.equipment.mainHand?.hitChanceMod) chance += attacker.equipment.mainHand.hitChanceMod;
  const shield = target.equipment.offHand;
  if (shield?.type === 'SHIELD' && shield.defenseBonus) chance -= shield.defenseBonus;
  if (target.isShieldWall && shield?.type === 'SHIELD') chance -= 15;
  chance += getSurroundingBonus(attacker, target, state);
  return Math.max(5, Math.min(95, chance));
};

const estimateRangedHitChance = (attacker: CombatUnit, target: CombatUnit): number => {
  let chance = attacker.stats.rangedSkill - target.stats.rangedDefense;
  if (attacker.equipment.mainHand?.hitChanceMod) chance += attacker.equipment.mainHand.hitChanceMod;
  const shield = target.equipment.offHand;
  if (shield?.type === 'SHIELD' && shield.rangedBonus) chance -= shield.rangedBonus;
  return Math.max(5, Math.min(95, chance));
};

const estimateAvgDamage = (unit: CombatUnit): number => {
  const weapon = unit.equipment.mainHand;
  if (!weapon?.damage) return 10;
  return (weapon.damage[0] + weapon.damage[1]) / 2;
};

const hitChanceMultiplier = (chance: number): number => {
  if (chance < 20) return 0.2;
  if (chance < 50) return 0.6;
  if (chance > 80) return 1.3;
  return 1.0;
};

// ==================== 目标威胁评估 ====================

const calculateThreat = (target: CombatUnit, attacker?: CombatUnit, state?: CombatState): number => {
  let threat = 0;

  if (target.taunting && attacker) {
    if (getHexDistance(attacker.combatPos, target.combatPos) <= 3) threat += 200;
  }

  const hpPercent = target.hp / target.maxHp;
  threat += (1 - hpPercent) * 30;
  threat += target.stats.meleeSkill * 0.3;

  const wClass = target.equipment.mainHand
    ? (target.equipment.mainHand.combatClass || target.equipment.mainHand.weaponClass)
    : undefined;
  if (wClass === 'bow' || wClass === 'crossbow') threat += 20;
  if (!target.equipment.offHand || target.equipment.offHand.type !== 'SHIELD') threat += 10;

  const mi = getMoraleIndex(target.morale);
  if (mi >= 2) threat += (mi - 1) * 15;
  if (target.morale === MoraleStatus.FLEEING) threat += 25;

  if (attacker && state) {
    threat += getSurroundingBonus(attacker, target, state) * 2;
  }

  return threat;
};

// ==================== 位置评估 & 移动 ====================

const calculatePositionScore = (
  unit: CombatUnit,
  pos: { q: number; r: number },
  targetPos: { q: number; r: number },
  state: CombatState,
  preferredRange: number,
  ctx?: AIContext
): number => {
  const distToTarget = getHexDistance(pos, targetPos);
  let score = 0;
  const riskProfile = getAIRiskProfile(unit);

  if (preferredRange > 1) {
    score += distToTarget > preferredRange
      ? 100 - (distToTarget - preferredRange) * 10
      : 100 - (preferredRange - distToTarget) * 15;
  } else {
    score += distToTarget <= preferredRange
      ? 100 - distToTarget * 10
      : 80 - distToTarget * 5;
  }

  const inZoC = isInEnemyZoC(pos, unit, state);
  if (inZoC) {
    let zocPenalty = riskProfile.zocBasePenalty;
    const threats = getThreateningEnemies(pos, unit, state);
    zocPenalty += threats.length > 0 ? threats.length * riskProfile.zocThreatPenalty : 8;

    const hpPercent = unit.hp / unit.maxHp;
    if (hpPercent < 0.5) {
      zocPenalty += hpPercent < 0.25 ? Math.round(riskProfile.lowHpPenalty * 1.4) : riskProfile.lowHpPenalty;
    }
    const moraleIndex = getMoraleIndex(unit.morale);
    if (moraleIndex >= 2) zocPenalty += (moraleIndex - 1) * riskProfile.lowMoralePenalty;

    const adjacentAllies = getAllies(unit, state).filter(a => getHexDistance(a.combatPos, pos) === 1).length;
    zocPenalty -= adjacentAllies * riskProfile.allySupportReduction;

    if (preferredRange === 1) {
      if (distToTarget <= 1) zocPenalty -= riskProfile.engageBonus;
      else if (distToTarget === 2) zocPenalty -= Math.floor(riskProfile.engageBonus * 0.5);
    }

    score -= Math.max(0, zocPenalty);
  }

  // Layer 3: 战术策略位置修正
  if (ctx?.tactics?.positionModifier) {
    score = ctx.tactics.positionModifier(pos, unit, score, ctx);
  }

  return score;
};

const findBestMovePosition = (
  unit: CombatUnit,
  targetPos: { q: number; r: number },
  state: CombatState,
  preferredRange: number = 1,
  allowFallbackAdvance: boolean = false,
  ctx?: AIContext
): { q: number; r: number } | null => {
  const maxMoveDistance = Math.floor(unit.currentAP / 2);
  if (maxMoveDistance < 1) return null;

  let bestScore = calculatePositionScore(unit, unit.combatPos, targetPos, state, preferredRange, ctx);
  let bestPos: { q: number; r: number } | null = null;
  const currentDistToTarget = getHexDistance(unit.combatPos, targetPos);
  let fallbackPos: { q: number; r: number } | null = null;
  let fallbackScore = -Infinity;
  let fallbackDistToTarget = currentDistToTarget;
  const riskProfile = getAIRiskProfile(unit);
  const searchRadius = Math.min(maxMoveDistance, 6);

  for (let q = -searchRadius; q <= searchRadius; q++) {
    for (let r = Math.max(-searchRadius, -q - searchRadius); r <= Math.min(searchRadius, -q + searchRadius); r++) {
      if (q === 0 && r === 0) continue;
      const newPos = { q: unit.combatPos.q + q, r: unit.combatPos.r + r };
      const moveDistance = getHexDistance(unit.combatPos, newPos);
      if (moveDistance > maxMoveDistance) continue;
      if (!isCombatHexInBounds(newPos)) continue;
      if (isHexBlocked(newPos, state)) continue;

      let score = calculatePositionScore(unit, newPos, targetPos, state, preferredRange, ctx);
      score -= moveDistance * 2;
      const newDistToTarget = getHexDistance(newPos, targetPos);

      if (score > bestScore + 1) {
        bestScore = score;
        bestPos = newPos;
      }

      if (newDistToTarget < fallbackDistToTarget || (newDistToTarget === fallbackDistToTarget && score > fallbackScore)) {
        fallbackDistToTarget = newDistToTarget;
        fallbackScore = score;
        fallbackPos = newPos;
      }
    }
  }

  if (bestPos) return bestPos;

  if (allowFallbackAdvance && preferredRange === 1 && fallbackPos) {
    const hpPercent = unit.hp / unit.maxHp;
    const moraleIndex = getMoraleIndex(unit.morale);
    const emergencyState = hpPercent < riskProfile.emergencyHpThreshold || moraleIndex >= riskProfile.emergencyMoraleIndex;
    const canPushAdvance = fallbackDistToTarget < currentDistToTarget && fallbackScore >= bestScore - riskProfile.fallbackAdvanceTolerance;
    if (!emergencyState && canPushAdvance) return fallbackPos;
  }

  return null;
};

const COMBAT_GRID_RANGE = 15;

const isCombatHexInBounds = (pos: { q: number; r: number }): boolean => {
  const { q, r } = pos;
  if (q < -COMBAT_GRID_RANGE || q > COMBAT_GRID_RANGE) return false;
  const minR = Math.max(-COMBAT_GRID_RANGE, -q - COMBAT_GRID_RANGE);
  const maxR = Math.min(COMBAT_GRID_RANGE, -q + COMBAT_GRID_RANGE);
  return r >= minR && r <= maxR;
};

const findFleePosition = (
  unit: CombatUnit,
  threats: CombatUnit[],
  state: CombatState
): { q: number; r: number } | null => {
  const maxMoveDistance = Math.floor(unit.currentAP / 2);
  if (maxMoveDistance < 1) return null;

  let bestPos: { q: number; r: number } | null = null;
  let maxDistance = 0;
  const searchRadius = Math.min(maxMoveDistance, 6);

  for (let q = -searchRadius; q <= searchRadius; q++) {
    for (let r = Math.max(-searchRadius, -q - searchRadius); r <= Math.min(searchRadius, -q + searchRadius); r++) {
      const newPos = { q: unit.combatPos.q + q, r: unit.combatPos.r + r };
      const moveDistance = getHexDistance(unit.combatPos, newPos);
      if (moveDistance === 0 || moveDistance > maxMoveDistance) continue;
      if (!isCombatHexInBounds(newPos)) continue;
      if (isHexBlocked(newPos, state)) continue;

      let minThreatDist = Infinity;
      for (const threat of threats) {
        minThreatDist = Math.min(minThreatDist, getHexDistance(newPos, threat.combatPos));
      }
      if (minThreatDist > maxDistance) {
        maxDistance = minThreatDist;
        bestPos = newPos;
      }
    }
  }

  return bestPos;
};

const getAttackAbilities = (unit: CombatUnit): Ability[] => {
  return getUnitAbilities(unit).filter(a => {
    if (a.type !== 'ATTACK') return false;
    if (a.id === 'SHOOT') {
      const weapon = unit.equipment.mainHand;
      const wClass = weapon?.combatClass || weapon?.weaponClass;
      if (wClass === 'crossbow' && unit.crossbowLoaded === false) return false;
    }
    return true;
  });
};

const canAttackTarget = (unit: CombatUnit, target: CombatUnit, ability: Ability): boolean => {
  const dist = getHexDistance(unit.combatPos, target.combatPos);
  if (unit.currentAP < ability.apCost) return false;
  if (dist < ability.range[0] || dist > ability.range[1]) return false;

  const weapon = unit.equipment.mainHand;
  const isPolearm = !!weapon && (weapon.combatClass || weapon.weaponClass) === 'polearm';
  if (isPolearm && ability.type === 'ATTACK') return isPolearmBacklineAttack(unit, ability, dist);

  return true;
};

const getPreferredRange = (unit: CombatUnit): number => {
  const wClass = unit.equipment.mainHand?.combatClass || unit.equipment.mainHand?.weaponClass;
  if (wClass === 'bow' || wClass === 'crossbow') return 4;
  if (wClass === 'throw') return 3;
  return 1;
};

// ==================== Layer 3: 战术策略 ====================

const formationTactics: TacticalStrategy = {
  id: 'formation',
  positionModifier(pos, unit, baseScore, ctx) {
    // 仅前排单位强吃阵型收益，避免全队（含弓手/突击手）原地“抱团犹豫”。
    if (unit.aiType !== 'ARMY' && unit.aiType !== 'TANK') return baseScore;
    const adjAllies = ctx.allies.filter(a => getHexDistance(a.combatPos, pos) === 1).length;
    return baseScore + adjAllies * 15;
  },
  targetModifier(target, _unit, baseScore, ctx) {
    const alliesEngaging = ctx.allies.filter(a => getHexDistance(a.combatPos, target.combatPos) === 1).length;
    return alliesEngaging > 0 ? baseScore * (1 + alliesEngaging * 0.2) : baseScore;
  },
};

const swarmTactics: TacticalStrategy = {
  id: 'swarm',
  positionModifier(pos, _unit, baseScore, ctx) {
    for (const enemy of ctx.enemies) {
      if (getHexDistance(pos, enemy.combatPos) === 1) {
        const otherAlliesAdj = ctx.allies.filter(a => getHexDistance(a.combatPos, enemy.combatPos) === 1).length;
        if (otherAlliesAdj >= 1) return baseScore + otherAlliesAdj * 20;
      }
    }
    return baseScore;
  },
  targetModifier(target, _unit, baseScore, ctx) {
    const alliesAdj = ctx.allies.filter(a => getHexDistance(a.combatPos, target.combatPos) === 1).length;
    return baseScore * (1 + alliesAdj * 0.3);
  },
};

const harassTactics: TacticalStrategy = {
  id: 'harass',
  positionModifier(pos, _unit, baseScore, ctx) {
    if (ctx.enemies.length === 0) return baseScore;
    let totalDist = 0;
    for (const e of ctx.enemies) totalDist += getHexDistance(pos, e.combatPos);
    const avgDist = totalDist / ctx.enemies.length;
    return baseScore + avgDist * 3;
  },
  targetModifier(target, _unit, baseScore, ctx) {
    const nearbyFriends = ctx.enemies.filter(e => e.id !== target.id && getHexDistance(e.combatPos, target.combatPos) <= 2);
    return nearbyFriends.length === 0 ? baseScore * 1.25 : baseScore;
  },
};

const aggressiveTactics: TacticalStrategy = {
  id: 'aggressive',
  targetModifier(target, _unit, baseScore, _ctx) {
    const hp = target.hp / target.maxHp;
    return hp < 0.5 ? baseScore * 1.2 : baseScore;
  },
};

const cultTactics: TacticalStrategy = {
  id: 'cult',
  positionModifier(pos, unit, baseScore, ctx) {
    // 邪教保留一点阵型意识，但远弱于正规军，降低“原地卡住”概率。
    const adjAllies = ctx.allies.filter(a => getHexDistance(a.combatPos, pos) === 1).length;
    const formationBonus = (unit.aiType === 'ARMY' || unit.aiType === 'TANK') ? 8 : 3;
    return baseScore + adjAllies * formationBonus;
  },
  targetModifier(target, _unit, baseScore, _ctx) {
    // 保持进攻倾向：优先压低血目标。
    const hp = target.hp / target.maxHp;
    return hp < 0.5 ? baseScore * 1.15 : baseScore;
  },
};

const NULL_TACTICS: TacticalStrategy = { id: 'none' };

const FACTION_TACTICS_MAP: Record<string, TacticalStrategy> = {
  BANDIT: aggressiveTactics,
  BEAST: swarmTactics,
  ARMY: formationTactics,
  NOMAD: harassTactics,
  CULT: cultTactics,
  BOSS_BAWANG: formationTactics,
  BOSS_HUBEN: formationTactics,
  BOSS_JINGKE: aggressiveTactics,
  BOSS_ARCHER: harassTactics,
  BOSS_FORGE: formationTactics,
  BOSS_SMITH: formationTactics,
  BOSS_MINE: aggressiveTactics,
  BOSS_LONGYA: aggressiveTactics,
  BOSS_XIPI: aggressiveTactics,
};

// ==================== AI 上下文构建 ====================

const buildAIContext = (unit: CombatUnit, state: CombatState): AIContext => {
  const enemies = getEnemies(unit, state);
  const allies = getAllies(unit, state);
  const tacticsKey = state.factionTactics || '';
  return {
    enemies,
    allies,
    inZoC: isInEnemyZoC(unit.combatPos, unit, state),
    hpPercent: unit.hp / unit.maxHp,
    moraleIndex: getMoraleIndex(unit.morale),
    riskProfile: getAIRiskProfile(unit),
    attackAbilities: getAttackAbilities(unit),
    allAbilities: getUnitAbilities(unit),
    adjacentEnemies: enemies.filter(e => getHexDistance(unit.combatPos, e.combatPos) === 1),
    tactics: FACTION_TACTICS_MAP[tacticsKey] || NULL_TACTICS,
    _cache: new Map(),
  };
};

// ==================== 目标评分辅助（含战术修正） ====================

const scoreTargetForAttack = (
  unit: CombatUnit,
  target: CombatUnit,
  state: CombatState,
  ctx: AIContext
): number => {
  let score = calculateThreat(target, unit, state);
  const dist = getHexDistance(unit.combatPos, target.combatPos);
  score -= dist * 3;

  const nearbyFriends = ctx.enemies.filter(e => e.id !== target.id && getHexDistance(e.combatPos, target.combatPos) <= 2);
  if (nearbyFriends.length === 0) score += 25;

  const nearbyAllies = ctx.allies.filter(a => getHexDistance(a.combatPos, target.combatPos) <= 2);
  score += nearbyAllies.length * 10;

  if (ctx.tactics.targetModifier) {
    score = ctx.tactics.targetModifier(target, unit, score, ctx);
  }

  return score;
};

// ==================== 行为模块 ====================

const behaviorAttackMelee: AIBehavior = {
  id: 'attackMelee',

  evaluate(unit, state, ctx) {
    let bestScore = 0;
    let bestTarget: CombatUnit | null = null;
    let bestAbility: Ability | null = null;

    for (const enemy of ctx.enemies) {
      for (const ability of ctx.attackAbilities) {
        if (ability.range[1] > 2) continue;
        if (!canAttackTarget(unit, enemy, ability)) continue;

        let score = 100;
        const hitChance = estimateMeleeHitChance(unit, enemy, state);
        score *= hitChanceMultiplier(hitChance);

        const avgDmg = estimateAvgDamage(unit);
        if (enemy.hp <= avgDmg) score *= 2.0;
        else if (enemy.hp <= avgDmg * 1.5) score *= 1.3;

        const targetScore = scoreTargetForAttack(unit, enemy, state, ctx);
        score *= 1 + targetScore / 150;

        const ehp = enemy.hp / enemy.maxHp;
        if (ehp < 0.3) score *= 1.4;
        else if (ehp < 0.5) score *= 1.2;

        score *= 1 + getSurroundingBonus(unit, enemy, state) / 60;

        if (score > bestScore) {
          bestScore = score;
          bestTarget = enemy;
          bestAbility = ability;
        }
      }
    }

    if (!bestTarget || !bestAbility) return 0;
    ctx._cache.set('atkMelee_target', bestTarget);
    ctx._cache.set('atkMelee_ability', bestAbility);
    return addNoise(bestScore);
  },

  execute(_unit, _state, ctx) {
    return {
      type: 'ATTACK',
      targetUnitId: (ctx._cache.get('atkMelee_target') as CombatUnit).id,
      ability: ctx._cache.get('atkMelee_ability') as Ability,
    };
  },
};

const behaviorAttackRanged: AIBehavior = {
  id: 'attackRanged',

  evaluate(unit, state, ctx) {
    let bestScore = 0;
    let bestTarget: CombatUnit | null = null;
    let bestAbility: Ability | null = null;

    for (const enemy of ctx.enemies) {
      for (const ability of ctx.attackAbilities) {
        if (ability.range[1] <= 2) continue;
        if (!canAttackTarget(unit, enemy, ability)) continue;

        let score = 100;
        const hitChance = estimateRangedHitChance(unit, enemy);
        score *= hitChanceMultiplier(hitChance);

        if (!enemy.equipment.offHand || enemy.equipment.offHand.type !== 'SHIELD') score *= 1.4;

        const avgDmg = estimateAvgDamage(unit);
        if (enemy.hp <= avgDmg) score *= 2.0;
        else if (enemy.hp <= avgDmg * 1.5) score *= 1.3;

        const targetScore = scoreTargetForAttack(unit, enemy, state, ctx);
        score *= 1 + targetScore / 150;

        const ehp = enemy.hp / enemy.maxHp;
        if (ehp < 0.3) score *= 1.4;
        else if (ehp < 0.5) score *= 1.2;

        const dist = getHexDistance(unit.combatPos, enemy.combatPos);
        if (dist >= 3 && dist <= ability.range[1] - 1) score *= 1.2;

        if (score > bestScore) {
          bestScore = score;
          bestTarget = enemy;
          bestAbility = ability;
        }
      }
    }

    if (!bestTarget || !bestAbility) return 0;
    ctx._cache.set('atkRanged_target', bestTarget);
    ctx._cache.set('atkRanged_ability', bestAbility);
    return addNoise(bestScore);
  },

  execute(_unit, _state, ctx) {
    return {
      type: 'ATTACK',
      targetUnitId: (ctx._cache.get('atkRanged_target') as CombatUnit).id,
      ability: ctx._cache.get('atkRanged_ability') as Ability,
    };
  },
};

const behaviorEngage: AIBehavior = {
  id: 'engage',

  evaluate(unit, state, ctx) {
    const preferredRange = getPreferredRange(unit);

    if (preferredRange === 1 && ctx.adjacentEnemies.length > 0) return 0;

    if (preferredRange > 1) {
      const nearestDist = ctx.enemies.reduce((min, e) => Math.min(min, getHexDistance(unit.combatPos, e.combatPos)), Infinity);
      if (nearestDist >= preferredRange - 1 && nearestDist <= preferredRange + 1) {
        for (const ability of ctx.attackAbilities) {
          if (ability.range[1] >= nearestDist && nearestDist >= ability.range[0]) return 0;
        }
      }
    }

    if (Math.floor(unit.currentAP / 2) < 1) return 0;

    let score = 80;
    if (ctx.inZoC) score *= 0.1;

    let bestTarget: CombatUnit | null = null;
    let bestTargetScore = -Infinity;
    for (const enemy of ctx.enemies) {
      let ts = scoreTargetForAttack(unit, enemy, state, ctx);
      if (ts > bestTargetScore) {
        bestTargetScore = ts;
        bestTarget = enemy;
      }
    }
    if (!bestTarget) return 0;

    const movePos = findBestMovePosition(unit, bestTarget.combatPos, state, preferredRange, preferredRange === 1, ctx);
    if (!movePos) return 0;

    const currentDist = getHexDistance(unit.combatPos, bestTarget.combatPos);
    const newDist = getHexDistance(movePos, bestTarget.combatPos);
    if (newDist < currentDist) score *= 1 + (currentDist - newDist) * 0.15;
    if (preferredRange === 1 && newDist <= 1) score *= 1.5;
    if (ctx.hpPercent < 0.3) score *= 0.6;

    ctx._cache.set('engage_movePos', movePos);
    return addNoise(score);
  },

  execute(_unit, _state, ctx) {
    return { type: 'MOVE', targetPos: ctx._cache.get('engage_movePos') };
  },
};

const behaviorFlee: AIBehavior = {
  id: 'flee',

  evaluate(unit, state, ctx) {
    if (ctx.moraleIndex < 2) return 0;

    let score = 20;

    if (ctx.hpPercent < 0.2) score *= 4.0;
    else if (ctx.hpPercent < 0.35) score *= 2.5;
    else if (ctx.hpPercent < 0.5) score *= 1.5;

    if (ctx.moraleIndex >= 4) score *= 3.0;
    else if (ctx.moraleIndex >= 3) score *= 2.5;
    else score *= 1.5;

    if (ctx.enemies.length > ctx.allies.length + 1) {
      score *= 1 + (ctx.enemies.length - ctx.allies.length) * 0.2;
    }

    const nearbyAllies = ctx.allies.filter(a => getHexDistance(a.combatPos, unit.combatPos) <= 3);
    if (nearbyAllies.length === 0) score *= 1.5;

    const fleePos = findFleePosition(unit, ctx.enemies, state);
    if (!fleePos) return 0;

    ctx._cache.set('flee_pos', fleePos);
    return addNoise(score);
  },

  execute(_unit, _state, ctx) {
    return { type: 'MOVE', targetPos: ctx._cache.get('flee_pos') };
  },
};

const behaviorShieldWall: AIBehavior = {
  id: 'shieldWall',

  evaluate(unit, _state, ctx) {
    if (unit.isShieldWall) return 0;
    if (!unit.equipment.offHand || unit.equipment.offHand.type !== 'SHIELD') return 0;

    const ability = ctx.allAbilities.find(a => a.id === 'SHIELDWALL');
    if (!ability || unit.currentAP < ability.apCost) return 0;

    const nearbyEnemies = ctx.enemies.filter(e => getHexDistance(unit.combatPos, e.combatPos) <= 3);
    if (nearbyEnemies.length === 0) return 0;

    let score = 60;
    score *= 1 + nearbyEnemies.length * 0.2;
    if (ctx.adjacentEnemies.length > 0) score *= 1.3;
    if (ctx.hpPercent < 0.5) score *= 1.4;

    const nearbyAllies = ctx.allies.filter(a => getHexDistance(a.combatPos, unit.combatPos) <= 2);
    score *= 1 + nearbyAllies.length * 0.1;

    ctx._cache.set('shieldWall_ability', ability);
    return addNoise(score);
  },

  execute(_unit, _state, ctx) {
    return { type: 'SKILL', ability: ctx._cache.get('shieldWall_ability') as Ability };
  },
};

const behaviorKite: AIBehavior = {
  id: 'kite',

  evaluate(unit, state, ctx) {
    const tooClose = ctx.enemies.filter(e => getHexDistance(unit.combatPos, e.combatPos) <= 2);
    if (tooClose.length === 0) return 0;
    if (Math.floor(unit.currentAP / 2) < 1) return 0;

    let score = 70;
    score *= 1 + tooClose.length * 0.3;

    if (ctx.inZoC) {
      score *= (ctx.hpPercent < 0.3 || ctx.moraleIndex >= 3) ? 0.6 : 0.1;
    }
    if (ctx.hpPercent < 0.3) score *= 1.8;

    const fleePos = findFleePosition(unit, tooClose, state);
    if (!fleePos) return 0;

    ctx._cache.set('kite_pos', fleePos);
    return addNoise(score);
  },

  execute(_unit, _state, ctx) {
    return { type: 'MOVE', targetPos: ctx._cache.get('kite_pos') };
  },
};

const behaviorProtectAlly: AIBehavior = {
  id: 'protectAlly',

  evaluate(unit, state, ctx) {
    if (Math.floor(unit.currentAP / 2) < 1) return 0;
    if (ctx.adjacentEnemies.length > 0) return 0;
    if (ctx.inZoC) return 0;

    const allyArchers = ctx.allies.filter(a => {
      const wClass = a.equipment.mainHand?.combatClass || a.equipment.mainHand?.weaponClass;
      return wClass === 'bow' || wClass === 'crossbow';
    });
    if (allyArchers.length === 0) return 0;

    let closestEnemy: CombatUnit | null = null;
    let closestDist = Infinity;
    for (const enemy of ctx.enemies) {
      for (const archer of allyArchers) {
        const d = getHexDistance(enemy.combatPos, archer.combatPos);
        if (d < closestDist) { closestDist = d; closestEnemy = enemy; }
      }
    }
    if (!closestEnemy || closestDist > 5) return 0;

    let score = 50;
    if (closestDist <= 2) score *= 2.0;
    else if (closestDist <= 3) score *= 1.5;

    const movePos = findBestMovePosition(unit, closestEnemy.combatPos, state, 1, true, ctx);
    if (!movePos) return 0;

    ctx._cache.set('protect_movePos', movePos);
    return addNoise(score);
  },

  execute(_unit, _state, ctx) {
    return { type: 'MOVE', targetPos: ctx._cache.get('protect_movePos') };
  },
};

const behaviorReload: AIBehavior = {
  id: 'reload',

  evaluate(unit, _state, ctx) {
    const wClass = unit.equipment.mainHand?.combatClass || unit.equipment.mainHand?.weaponClass;
    if (wClass !== 'crossbow') return 0;
    if (unit.crossbowLoaded !== false) return 0;

    const ability = ctx.allAbilities.find(a => a.id === 'RELOAD');
    if (!ability || unit.currentAP < ability.apCost) return 0;

    ctx._cache.set('reload_ability', ability);
    return 150;
  },

  execute(_unit, _state, ctx) {
    return { type: 'SKILL', ability: ctx._cache.get('reload_ability') as Ability };
  },
};

const behaviorWait: AIBehavior = {
  id: 'wait',
  evaluate() { return 5; },
  execute() { return { type: 'WAIT' }; },
};

// ==================== 行为注册表 & 权重配置（Layer 1 + 2） ====================

const ALL_BEHAVIORS: Record<BehaviorId, AIBehavior> = {
  attackMelee: behaviorAttackMelee,
  attackRanged: behaviorAttackRanged,
  engage: behaviorEngage,
  flee: behaviorFlee,
  shieldWall: behaviorShieldWall,
  kite: behaviorKite,
  protectAlly: behaviorProtectAlly,
  reload: behaviorReload,
  wait: behaviorWait,
};

const AI_BEHAVIOR_REGISTRY: Record<AIType, BehaviorId[]> = {
  BANDIT:     ['attackMelee', 'attackRanged', 'engage', 'flee', 'shieldWall', 'reload', 'wait'],
  BEAST:      ['attackMelee', 'engage'],
  ARMY:       ['attackMelee', 'attackRanged', 'engage', 'flee', 'shieldWall', 'protectAlly', 'reload', 'wait'],
  ARCHER:     ['attackRanged', 'attackMelee', 'kite', 'flee', 'engage', 'reload', 'wait'],
  BERSERKER:  ['attackMelee', 'engage', 'wait'],
  TANK:       ['attackMelee', 'shieldWall', 'protectAlly', 'engage', 'flee', 'wait'],
  SKIRMISHER: ['attackRanged', 'attackMelee', 'kite', 'flee', 'engage', 'reload', 'wait'],
};

const AI_WEIGHT_PROFILES: Record<AIType, Partial<Record<BehaviorId, number>>> = {
  BANDIT:     { attackMelee: 1.0, attackRanged: 0.8, engage: 1.0, flee: 1.0, shieldWall: 0.8, reload: 1.0, wait: 1.0 },
  BEAST:      { attackMelee: 1.3, engage: 1.4 },
  ARMY:       { attackMelee: 1.0, attackRanged: 0.8, engage: 1.0, flee: 0.5, shieldWall: 1.0, protectAlly: 0.6, reload: 1.0, wait: 1.0 },
  ARCHER:     { attackRanged: 1.3, attackMelee: 0.4, kite: 1.5, flee: 1.2, engage: 0.8, reload: 1.0, wait: 1.0 },
  BERSERKER:  { attackMelee: 1.5, engage: 1.3, wait: 1.0 },
  TANK:       { attackMelee: 0.8, shieldWall: 1.5, protectAlly: 1.5, engage: 0.7, flee: 0.3, wait: 1.0 },
  SKIRMISHER: { attackRanged: 1.2, attackMelee: 0.6, kite: 1.3, flee: 1.1, engage: 0.8, reload: 1.0, wait: 1.0 },
};

// ==================== 战术代理 — 主决策 ====================

const selectBehavior = (unit: CombatUnit, state: CombatState): AIAction => {
  const aiType = unit.aiType || 'BANDIT';
  const behaviorIds = AI_BEHAVIOR_REGISTRY[aiType] || AI_BEHAVIOR_REGISTRY.BANDIT;
  const weights = AI_WEIGHT_PROFILES[aiType] || AI_WEIGHT_PROFILES.BANDIT;
  const ctx = buildAIContext(unit, state);

  let bestScore = SCORE_THRESHOLD;
  let bestBehavior: AIBehavior | null = null;

  for (const bid of behaviorIds) {
    const behavior = ALL_BEHAVIORS[bid];
    const weight = weights[bid] ?? 1.0;
    if (weight <= 0) continue;

    const rawScore = behavior.evaluate(unit, state, ctx);
    const finalScore = rawScore * weight;

    if (finalScore > bestScore) {
      bestScore = finalScore;
      bestBehavior = behavior;
    }
  }

  if (bestBehavior) {
    return bestBehavior.execute(unit, state, ctx);
  }

  return { type: 'WAIT' };
};

// ==================== 导出接口（不变） ====================

export const executeFleeingBehavior = (unit: CombatUnit, state: CombatState): AIAction => {
  const enemies = getEnemies(unit, state);
  if (enemies.length === 0) return { type: 'WAIT' };
  const fleePos = findFleePosition(unit, enemies, state);
  return fleePos ? { type: 'FLEE', targetPos: fleePos } : { type: 'WAIT' };
};

export const executeAITurn = (unit: CombatUnit, state: CombatState): AIAction => {
  if (unit.morale === MoraleStatus.FLEEING) {
    return executeFleeingBehavior(unit, state);
  }
  return selectBehavior(unit, state);
};

export const getAITypeName = (aiType: AIType): string => {
  const names: Record<AIType, string> = {
    BANDIT: '匪徒',
    BEAST: '野兽',
    ARMY: '军士',
    ARCHER: '弓手',
    BERSERKER: '狂战士',
    TANK: '盾卫',
    SKIRMISHER: '游击',
  };
  return names[aiType] || '未知';
};
