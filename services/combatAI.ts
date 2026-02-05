/**
 * 战斗 AI 行为树系统
 * 根据不同敌人类型实现不同的战术策略
 */

import { CombatState, CombatUnit, AIType, Ability, MoraleStatus } from '../types';
import { getHexNeighbors, getHexDistance, getUnitAbilities, ABILITIES } from '../constants';
import { getMoraleEffects, MORALE_ORDER } from './moraleService';

// 行为树执行结果
type BehaviorResult = 'SUCCESS' | 'FAILURE' | 'RUNNING';

// AI 行动类型
export interface AIAction {
  type: 'MOVE' | 'ATTACK' | 'SKILL' | 'WAIT' | 'FLEE';
  targetPos?: { q: number; r: number };
  targetUnitId?: string;
  ability?: Ability;
  damage?: number;
}

// ==================== 工具函数 ====================

/**
 * 获取所有敌方单位
 */
const getEnemies = (unit: CombatUnit, state: CombatState): CombatUnit[] => {
  return state.units.filter(u => !u.isDead && u.team !== unit.team);
};

/**
 * 获取所有友方单位
 */
const getAllies = (unit: CombatUnit, state: CombatState): CombatUnit[] => {
  return state.units.filter(u => !u.isDead && u.team === unit.team && u.id !== unit.id);
};

/**
 * 检查位置是否被占用
 */
const isHexOccupied = (pos: { q: number; r: number }, state: CombatState): boolean => {
  return state.units.some(u => !u.isDead && u.combatPos.q === pos.q && u.combatPos.r === pos.r);
};

/**
 * 获取士气状态的索引（用于比较）
 */
const getMoraleIndex = (morale: MoraleStatus): number => {
  return MORALE_ORDER.indexOf(morale);
};

/**
 * 计算单位的威胁值（用于目标选择）
 * 现在考虑士气状态
 */
const calculateThreat = (target: CombatUnit): number => {
  let threat = 0;
  
  // 低血量目标优先
  const hpPercent = target.hp / target.maxHp;
  threat += (1 - hpPercent) * 30;
  
  // 高攻击力目标优先
  threat += target.stats.meleeSkill * 0.3;
  
  // 弓箭手/远程单位威胁更高
  if (target.equipment.mainHand?.name.includes('弓') || target.equipment.mainHand?.name.includes('弩')) {
    threat += 20;
  }
  
  // 无盾目标更容易被攻击
  if (!target.equipment.offHand || target.equipment.offHand.type !== 'SHIELD') {
    threat += 10;
  }
  
  // 士气低落的目标更容易被攻击（优先攻击）
  const moraleIndex = getMoraleIndex(target.morale);
  if (moraleIndex >= 2) { // WAVERING 或更差
    threat += (moraleIndex - 1) * 15; // 动摇+15, 崩溃+30, 逃跑+45
  }
  
  // 正在逃跑的目标是绝佳的攻击目标
  if (target.morale === MoraleStatus.FLEEING) {
    threat += 25;
  }
  
  return threat;
};

/**
 * 寻找移动到目标附近的最佳位置
 */
const findBestMovePosition = (
  unit: CombatUnit,
  targetPos: { q: number; r: number },
  state: CombatState,
  preferredRange: number = 1
): { q: number; r: number } | null => {
  const maxMoveDistance = Math.floor(unit.currentAP / 2);
  if (maxMoveDistance < 1) return null;
  
  let bestPos: { q: number; r: number } | null = null;
  let bestScore = -Infinity;

  // 使用六边形网格的正确搜索方式
  const searchRadius = Math.min(maxMoveDistance, 6); // 限制搜索范围避免性能问题
  
  for (let q = -searchRadius; q <= searchRadius; q++) {
    for (let r = Math.max(-searchRadius, -q - searchRadius); r <= Math.min(searchRadius, -q + searchRadius); r++) {
      const newPos = { q: unit.combatPos.q + q, r: unit.combatPos.r + r };
      const moveDistance = getHexDistance(unit.combatPos, newPos);
      
      // 跳过原地和超出移动范围的位置
      if (moveDistance === 0 || moveDistance > maxMoveDistance) continue;
      // 跳过被占用的位置
      if (isHexOccupied(newPos, state)) continue;
      
      const distToTarget = getHexDistance(newPos, targetPos);
      
      // 计算位置得分
      let score = 0;
      
      // 越接近目标越好（但要考虑首选攻击距离）
      if (distToTarget <= preferredRange) {
        score += 100 - distToTarget * 10;
      } else {
        score += 80 - distToTarget * 5;
      }
      
      // 移动消耗越少越好
      score -= moveDistance * 2;
      
      if (score > bestScore) {
        bestScore = score;
        bestPos = newPos;
      }
    }
  }
  
  return bestPos;
};

/**
 * 获取单位可用的攻击技能
 */
const getAttackAbilities = (unit: CombatUnit): Ability[] => {
  return getUnitAbilities(unit).filter(a => a.type === 'ATTACK');
};

/**
 * 检查是否能攻击目标
 */
const canAttackTarget = (
  unit: CombatUnit,
  target: CombatUnit,
  ability: Ability
): boolean => {
  const dist = getHexDistance(unit.combatPos, target.combatPos);
  return dist >= ability.range[0] && 
         dist <= ability.range[1] && 
         unit.currentAP >= ability.apCost;
};

// ==================== 行为树实现 ====================

/**
 * BANDIT（匪徒）行为树
 * 特点：优先攻击落单/低血量目标，血量低或士气低时会逃跑
 */
const executeBanditBehavior = (unit: CombatUnit, state: CombatState): AIAction => {
  const enemies = getEnemies(unit, state);
  const allies = getAllies(unit, state);
  
  // 血量低于30%或士气动摇时，有逃跑倾向
  const hpPercent = unit.hp / unit.maxHp;
  const moraleIndex = getMoraleIndex(unit.morale);
  const shouldConsiderFleeing = hpPercent < 0.3 || moraleIndex >= 2; // WAVERING或更差
  
  if (shouldConsiderFleeing && allies.length < enemies.length) {
    // 士气越低越容易逃跑
    const fleeChance = moraleIndex >= 3 ? 0.7 : (moraleIndex >= 2 ? 0.4 : 0.2);
    if (Math.random() < fleeChance) {
      let fleePos = findFleePosition(unit, enemies, state);
      if (fleePos) {
        return { type: 'MOVE', targetPos: fleePos };
      }
    }
  }
  
  // 选择目标：优先低血量、落单、士气低落的敌人
  let bestTarget: CombatUnit | null = null;
  let bestScore = -Infinity;
  
  for (const enemy of enemies) {
    let score = calculateThreat(enemy);
    
    // 落单目标加分（周围没有友军）
    const nearbyAllies = enemies.filter(e => 
      e.id !== enemy.id && getHexDistance(e.combatPos, enemy.combatPos) <= 2
    );
    if (nearbyAllies.length === 0) {
      score += 25;
    }
    
    // 距离近的加分
    const dist = getHexDistance(unit.combatPos, enemy.combatPos);
    score -= dist * 3;
    
    if (score > bestScore) {
      bestScore = score;
      bestTarget = enemy;
    }
  }
  
  if (!bestTarget) return { type: 'WAIT' };
  
  // 尝试攻击（士气会影响伤害）
  const attackAbilities = getAttackAbilities(unit);
  for (const ability of attackAbilities) {
    if (canAttackTarget(unit, bestTarget, ability)) {
      const moraleEffects = getMoraleEffects(unit.morale);
      const baseDamage = Math.floor(Math.random() * 20) + 10;
      const damage = Math.floor(baseDamage * (1 + moraleEffects.damageMod / 100));
      return { 
        type: 'ATTACK', 
        targetUnitId: bestTarget.id, 
        ability,
        damage
      };
    }
  }
  
  // 无法攻击则移动靠近
  const movePos = findBestMovePosition(unit, bestTarget.combatPos, state, 1);
  if (movePos) {
    return { type: 'MOVE', targetPos: movePos };
  }
  
  return { type: 'WAIT' };
};

/**
 * BEAST（野兽）行为树
 * 特点：凶猛进攻，优先攻击最近目标或逃跑的猎物，永不逃跑
 */
const executeBeastBehavior = (unit: CombatUnit, state: CombatState): AIAction => {
  const enemies = getEnemies(unit, state);
  
  // 找最近的敌人，但优先追杀逃跑的猎物
  let bestTarget: CombatUnit | null = null;
  let bestScore = -Infinity;
  
  for (const enemy of enemies) {
    const dist = getHexDistance(unit.combatPos, enemy.combatPos);
    let score = 100 - dist * 10; // 基础分数：距离越近越好
    
    // 野兽有追杀逃跑目标的本能
    if (enemy.morale === MoraleStatus.FLEEING) {
      score += 50;
    } else if (enemy.morale === MoraleStatus.BREAKING) {
      score += 20;
    }
    
    // 低血量目标更有吸引力（容易击杀）
    const hpPercent = enemy.hp / enemy.maxHp;
    score += (1 - hpPercent) * 30;
    
    if (score > bestScore) {
      bestScore = score;
      bestTarget = enemy;
    }
  }
  
  if (!bestTarget) return { type: 'WAIT' };
  
  // 尝试攻击（野兽不受士气影响）
  const attackAbilities = getAttackAbilities(unit);
  for (const ability of attackAbilities) {
    if (canAttackTarget(unit, bestTarget, ability)) {
      // 野兽攻击伤害更高
      const damage = Math.floor(Math.random() * 25) + 15;
      return { 
        type: 'ATTACK', 
        targetUnitId: bestTarget.id, 
        ability,
        damage
      };
    }
  }
  
  // 无法攻击则全力冲向目标
  const movePos = findBestMovePosition(unit, bestTarget.combatPos, state, 1);
  if (movePos) {
    return { type: 'MOVE', targetPos: movePos };
  }
  
  return { type: 'WAIT' };
};

/**
 * ARMY（军队）行为树
 * 特点：有序推进，保持阵型，优先集火同一目标，士气较稳定
 */
const executeArmyBehavior = (unit: CombatUnit, state: CombatState): AIAction => {
  const enemies = getEnemies(unit, state);
  const allies = getAllies(unit, state);
  
  // 军队单位士气较稳定，只有在崩溃时才考虑撤退
  if (unit.morale === MoraleStatus.BREAKING && allies.length === 0) {
    const fleePos = findFleePosition(unit, enemies, state);
    if (fleePos && Math.random() < 0.3) {
      return { type: 'MOVE', targetPos: fleePos };
    }
  }
  
  // 选择目标：优先选择已经被友军攻击过的目标（集火）
  let bestTarget: CombatUnit | null = null;
  let bestScore = -Infinity;
  
  for (const enemy of enemies) {
    let score = 0;
    
    // 低血量但未死的目标高优先（集火补刀）
    const hpPercent = enemy.hp / enemy.maxHp;
    if (hpPercent < 0.5 && hpPercent > 0) {
      score += 50;
    }
    
    // 威胁评估（包含士气因素）
    score += calculateThreat(enemy);
    
    // 友军附近的敌人优先（包围战术）
    const nearbyAllies = allies.filter(a => 
      getHexDistance(a.combatPos, enemy.combatPos) <= 2
    );
    score += nearbyAllies.length * 15;
    
    // 距离因素
    const dist = getHexDistance(unit.combatPos, enemy.combatPos);
    score -= dist * 2;
    
    if (score > bestScore) {
      bestScore = score;
      bestTarget = enemy;
    }
  }
  
  if (!bestTarget) return { type: 'WAIT' };
  
  // 尝试攻击（应用士气伤害修正）
  const attackAbilities = getAttackAbilities(unit);
  for (const ability of attackAbilities) {
    if (canAttackTarget(unit, bestTarget, ability)) {
      const moraleEffects = getMoraleEffects(unit.morale);
      const baseDamage = Math.floor(Math.random() * 18) + 12;
      const damage = Math.floor(baseDamage * (1 + moraleEffects.damageMod / 100));
      return { 
        type: 'ATTACK', 
        targetUnitId: bestTarget.id, 
        ability,
        damage
      };
    }
  }
  
  // 有序推进：与友军保持距离移动
  const movePos = findBestMovePosition(unit, bestTarget.combatPos, state, 1);
  if (movePos) {
    return { type: 'MOVE', targetPos: movePos };
  }
  
  return { type: 'WAIT' };
};

/**
 * ARCHER（弓手）行为树
 * 特点：保持距离，优先攻击无盾目标，士气低落时更容易逃跑
 */
const executeArcherBehavior = (unit: CombatUnit, state: CombatState): AIAction => {
  const enemies = getEnemies(unit, state);
  const moraleIndex = getMoraleIndex(unit.morale);
  
  // 检查是否有敌人太近
  const tooCloseEnemies = enemies.filter(e => 
    getHexDistance(unit.combatPos, e.combatPos) <= 2
  );
  
  // 如果敌人太近，或士气动摇，尝试拉开距离
  if (tooCloseEnemies.length > 0 || (moraleIndex >= 2 && tooCloseEnemies.length > 0)) {
    const fleePos = findFleePosition(unit, tooCloseEnemies.length > 0 ? tooCloseEnemies : enemies, state);
    if (fleePos && getHexDistance(unit.combatPos, fleePos) >= 1) {
      return { type: 'MOVE', targetPos: fleePos };
    }
  }
  
  // 选择目标：优先无盾、低血量、士气低落的目标
  let bestTarget: CombatUnit | null = null;
  let bestScore = -Infinity;
  
  for (const enemy of enemies) {
    let score = calculateThreat(enemy);
    
    // 无盾目标大幅加分
    if (!enemy.equipment.offHand || enemy.equipment.offHand.type !== 'SHIELD') {
      score += 40;
    }
    
    // 距离适中（远程攻击范围内）加分
    const dist = getHexDistance(unit.combatPos, enemy.combatPos);
    if (dist >= 3 && dist <= 6) {
      score += 20;
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestTarget = enemy;
    }
  }
  
  if (!bestTarget) return { type: 'WAIT' };
  
  // 尝试远程攻击（应用士气伤害修正）
  const attackAbilities = getAttackAbilities(unit);
  const rangedAbility = attackAbilities.find(a => a.range[1] > 2);
  const moraleEffects = getMoraleEffects(unit.morale);
  
  if (rangedAbility && canAttackTarget(unit, bestTarget, rangedAbility)) {
    const baseDamage = Math.floor(Math.random() * 22) + 8;
    const damage = Math.floor(baseDamage * (1 + moraleEffects.damageMod / 100));
    return { 
      type: 'ATTACK', 
      targetUnitId: bestTarget.id, 
      ability: rangedAbility,
      damage
    };
  }
  
  // 如果没有远程技能或射程不够，尝试近战
  for (const ability of attackAbilities) {
    if (canAttackTarget(unit, bestTarget, ability)) {
      const baseDamage = Math.floor(Math.random() * 15) + 8;
      const damage = Math.floor(baseDamage * (1 + moraleEffects.damageMod / 100));
      return { 
        type: 'ATTACK', 
        targetUnitId: bestTarget.id, 
        ability,
        damage
      };
    }
  }
  
  // 移动到合适的射击位置
  const movePos = findBestMovePosition(unit, bestTarget.combatPos, state, 4);
  if (movePos) {
    return { type: 'MOVE', targetPos: movePos };
  }
  
  return { type: 'WAIT' };
};

/**
 * BERSERKER（狂战士）行为树
 * 特点：血量越低攻击越高，永不后退，无视士气惩罚
 */
const executeBerserkerBehavior = (unit: CombatUnit, state: CombatState): AIAction => {
  const enemies = getEnemies(unit, state);
  
  // 选择目标：优先攻击最强的敌人，或者士气最低的敌人
  let bestTarget: CombatUnit | null = null;
  let maxThreat = -Infinity;
  
  for (const enemy of enemies) {
    const threat = calculateThreat(enemy);
    const dist = getHexDistance(unit.combatPos, enemy.combatPos);
    
    // 狂战士优先挑战强敌，或追杀逃跑者
    let score = threat - dist * 2;
    
    // 额外偏好逃跑中的敌人（追杀本能）
    if (enemy.morale === MoraleStatus.FLEEING) {
      score += 30;
    }
    
    if (score > maxThreat) {
      maxThreat = score;
      bestTarget = enemy;
    }
  }
  
  if (!bestTarget) return { type: 'WAIT' };
  
  // 尝试攻击（血量越低伤害越高，狂战士无视士气惩罚）
  const attackAbilities = getAttackAbilities(unit);
  for (const ability of attackAbilities) {
    if (canAttackTarget(unit, bestTarget, ability)) {
      const hpPercent = unit.hp / unit.maxHp;
      const rageBonus = Math.floor((1 - hpPercent) * 20); // 血量越低加成越高
      // 狂战士只获得士气加成，不受惩罚
      const moraleEffects = getMoraleEffects(unit.morale);
      const moraleBonus = Math.max(0, moraleEffects.damageMod);
      const damage = Math.floor(Math.random() * 25) + 15 + rageBonus + Math.floor(moraleBonus / 5);
      return { 
        type: 'ATTACK', 
        targetUnitId: bestTarget.id, 
        ability,
        damage
      };
    }
  }
  
  // 无法攻击则冲向目标
  const movePos = findBestMovePosition(unit, bestTarget.combatPos, state, 1);
  if (movePos) {
    return { type: 'MOVE', targetPos: movePos };
  }
  
  return { type: 'WAIT' };
};

/**
 * 寻找逃跑位置
 */
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
      if (isHexOccupied(newPos, state)) continue;
      
      // 计算到所有威胁的最小距离
      let minThreatDist = Infinity;
      for (const threat of threats) {
        const dist = getHexDistance(newPos, threat.combatPos);
        minThreatDist = Math.min(minThreatDist, dist);
      }
      
      if (minThreatDist > maxDistance) {
        maxDistance = minThreatDist;
        bestPos = newPos;
      }
    }
  }
  
  return bestPos;
};

// ==================== 主入口 ====================

/**
 * 执行逃跑行为
 * 当单位处于FLEEING状态时自动执行
 */
export const executeFleeingBehavior = (unit: CombatUnit, state: CombatState): AIAction => {
  const enemies = getEnemies(unit, state);
  
  if (enemies.length === 0) {
    return { type: 'WAIT' };
  }
  
  // 找到远离所有敌人的最佳位置
  const fleePos = findFleePosition(unit, enemies, state);
  if (fleePos) {
    return { type: 'FLEE', targetPos: fleePos };
  }
  
  return { type: 'WAIT' };
};

/**
 * 执行 AI 行动
 * 现在考虑士气状态
 */
export const executeAITurn = (unit: CombatUnit, state: CombatState): AIAction => {
  // 检查是否处于逃跑状态
  if (unit.morale === MoraleStatus.FLEEING) {
    return executeFleeingBehavior(unit, state);
  }
  
  const aiType = unit.aiType || 'BANDIT'; // 默认为匪徒行为
  
  // 对于非BEAST和BERSERKER类型，士气崩溃时有概率逃跑
  if (unit.morale === MoraleStatus.BREAKING && aiType !== 'BEAST' && aiType !== 'BERSERKER') {
    const enemies = getEnemies(unit, state);
    const allies = getAllies(unit, state);
    
    // 如果数量劣势明显，更容易选择逃跑
    if (enemies.length > allies.length + 1) {
      const fleeChance = 0.3 + (enemies.length - allies.length) * 0.1;
      if (Math.random() < fleeChance) {
        const fleePos = findFleePosition(unit, enemies, state);
        if (fleePos) {
          return { type: 'MOVE', targetPos: fleePos };
        }
      }
    }
  }
  
  switch (aiType) {
    case 'BANDIT':
      return executeBanditBehavior(unit, state);
    case 'BEAST':
      return executeBeastBehavior(unit, state);
    case 'ARMY':
      return executeArmyBehavior(unit, state);
    case 'ARCHER':
      return executeArcherBehavior(unit, state);
    case 'BERSERKER':
      return executeBerserkerBehavior(unit, state);
    default:
      return executeBanditBehavior(unit, state);
  }
};

/**
 * 获取 AI 类型的中文名称
 */
export const getAITypeName = (aiType: AIType): string => {
  const names: Record<AIType, string> = {
    'BANDIT': '匪徒',
    'BEAST': '野兽',
    'ARMY': '军士',
    'ARCHER': '弓手',
    'BERSERKER': '狂战士'
  };
  return names[aiType] || '未知';
};
