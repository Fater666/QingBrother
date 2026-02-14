/**
 * 战斗 AI 行为树系统
 * 根据不同敌人类型实现不同的战术策略
 */

import { CombatState, CombatUnit, AIType, Ability, MoraleStatus } from '../types';
import { getHexNeighbors, getHexDistance, getUnitAbilities, ABILITIES, isInEnemyZoC, getThreateningEnemies, getSurroundingBonus } from '../constants';
import { MORALE_ORDER } from './moraleService';

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
 * 现在考虑士气状态和合围加成
 * @param target 目标单位
 * @param attacker 可选：攻击者（用于计算合围加成）
 * @param state 可选：战斗状态（用于计算合围加成）
 */
const calculateThreat = (target: CombatUnit, attacker?: CombatUnit, state?: CombatState): number => {
  let threat = 0;
  
  // === 挑衅 (taunt): 正在挑衅的目标威胁值大幅提升 ===
  if (target.taunting && attacker) {
    const dist = attacker ? getHexDistance(attacker.combatPos, target.combatPos) : 999;
    if (dist <= 3) {
      threat += 200; // 大幅提升优先级
    }
  }
  
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
  
  // 合围加成：友军已包围目标时，该目标优先级提升
  if (attacker && state) {
    const surroundBonus = getSurroundingBonus(attacker, target, state);
    threat += surroundBonus * 2; // 每5%合围命中加成 → +10威胁值
  }
  
  return threat;
};

/**
 * 计算位置的战术得分
 * 用于评估移动目标的优劣
 */
const calculatePositionScore = (
  unit: CombatUnit,
  pos: { q: number; r: number },
  targetPos: { q: number; r: number },
  state: CombatState,
  preferredRange: number
): number => {
  const distToTarget = getHexDistance(pos, targetPos);
  let score = 0;

  // 1. 距离评分
  if (preferredRange > 1) {
    // 远程单位逻辑
    if (distToTarget > preferredRange) {
      // 距离太远，需要靠近：距离每增加1格，扣10分
      // 例：Range=4. Dist=5 -> 100 - 10 = 90
      score += 100 - (distToTarget - preferredRange) * 10;
    } else {
      // 在射程内：距离越接近 preferredRange 越好
      // 距离每减少1格（过于靠近），扣15分（加大惩罚防止骑脸）
      // 例：Range=4. Dist=4 -> 100. Dist=3 -> 85. Dist=1 -> 55.
      score += 100 - (preferredRange - distToTarget) * 15;
    }
  } else {
    // 近战单位逻辑：越接近目标越好
    if (distToTarget <= preferredRange) {
      score += 100 - distToTarget * 10;
    } else {
      score += 80 - distToTarget * 5;
    }
  }

  // 2. ZoC (控制区) 威胁评估
  const inZoC = isInEnemyZoC(pos, unit, state);
  if (inZoC) {
    let zocPenalty = 0;
    
    // 检查具体的威胁（有多少人能截击）
    const threats = getThreateningEnemies(pos, unit, state);
    if (threats.length > 0) {
       // 每个威胁来源造成显著惩罚
       zocPenalty = threats.length * 40;
       
       // 血量不健康时更怕死
       const hpPercent = unit.hp / unit.maxHp;
       if (hpPercent < 0.5) zocPenalty += 30;
    } else {
       // 在ZoC内但暂无直接威胁（如敌人已行动过），轻微不利
       zocPenalty = 10; 
    }

    // 豁免条件：如果该位置能有效攻击到目标（且是近战）
    // 近战单位必须进入ZoC才能攻击，因此需要豁免部分惩罚
    if (preferredRange === 1 && distToTarget <= 1) {
        // 豁免相当于 1 个敌人的惩罚（即 1v1 不怕，1vN 怕）
        zocPenalty = Math.max(0, zocPenalty - 40); 
    }
    
    score -= zocPenalty;
  }

  return score;
};

/**
 * 寻找移动到目标附近的最佳位置
 * 强化控制区感知与远程单位风筝逻辑
 */
const findBestMovePosition = (
  unit: CombatUnit,
  targetPos: { q: number; r: number },
  state: CombatState,
  preferredRange: number = 1
): { q: number; r: number } | null => {
  const maxMoveDistance = Math.floor(unit.currentAP / 2);
  if (maxMoveDistance < 1) return null;
  
  // 1. 计算当前位置的得分作为基准
  // 只有找到比当前位置得分更高的位置，才会移动
  let bestScore = calculatePositionScore(unit, unit.combatPos, targetPos, state, preferredRange);
  let bestPos: { q: number; r: number } | null = null;

  // 2. 搜索可移动范围
  const searchRadius = Math.min(maxMoveDistance, 6); // 限制搜索范围避免性能问题
  
  for (let q = -searchRadius; q <= searchRadius; q++) {
    for (let r = Math.max(-searchRadius, -q - searchRadius); r <= Math.min(searchRadius, -q + searchRadius); r++) {
      // 偏移量为0即当前位置，跳过
      if (q === 0 && r === 0) continue;

      const newPos = { q: unit.combatPos.q + q, r: unit.combatPos.r + r };
      const moveDistance = getHexDistance(unit.combatPos, newPos);
      
      // 跳过超出移动范围的位置
      if (moveDistance > maxMoveDistance) continue;
      // 跳过被占用的位置
      if (isHexOccupied(newPos, state)) continue;
      
      // 计算新位置得分
      let score = calculatePositionScore(unit, newPos, targetPos, state, preferredRange);
      
      // 减去移动消耗（避免无意义的反复横跳）
      score -= moveDistance * 2;
      
      // 只有得分显著高于当前位置才移动（设置阈值+1，避免微小差异导致的抖动）
      if (score > bestScore + 1) {
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
  return getUnitAbilities(unit).filter(a => {
    if (a.type !== 'ATTACK') return false;
    // 弩未装填时禁止选择射击，避免 AI 无限连射。
    if (a.id === 'SHOOT') {
      const weapon = unit.equipment.mainHand;
      const isCrossbow = weapon?.weaponClass === 'crossbow' || weapon?.name.includes('弩');
      if (isCrossbow && unit.crossbowLoaded === false) return false;
    }
    return true;
  });
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
 * ZoC感知：在控制区内优先攻击邻近敌人，不冒险移动
 */
const executeBanditBehavior = (unit: CombatUnit, state: CombatState): AIAction => {
  const enemies = getEnemies(unit, state);
  const allies = getAllies(unit, state);
  
  // 血量极低且士气动摇，或士气崩溃时，才有逃跑倾向
  const hpPercent = unit.hp / unit.maxHp;
  const moraleIndex = getMoraleIndex(unit.morale);
  const shouldConsiderFleeing = (hpPercent < 0.25 && moraleIndex >= 2) || moraleIndex >= 3;

  if (shouldConsiderFleeing && allies.length < enemies.length) {
    // 士气越低越容易逃跑
    const fleeChance = moraleIndex >= 3 ? 0.45 : 0.15;
    if (Math.random() < fleeChance) {
      let fleePos = findFleePosition(unit, enemies, state);
      if (fleePos) {
        return { type: 'MOVE', targetPos: fleePos };
      }
    }
  }
  
  // 选择目标：优先低血量、落单、士气低落的敌人（含合围加成）
  let bestTarget: CombatUnit | null = null;
  let bestScore = -Infinity;
  
  for (const enemy of enemies) {
    let score = calculateThreat(enemy, unit, state);
    
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
  
  // 尝试攻击首选目标（伤害由执行层 calculateDamage 统一计算）
  const attackAbilities = getAttackAbilities(unit);
  for (const ability of attackAbilities) {
    if (canAttackTarget(unit, bestTarget, ability)) {
      return { 
        type: 'ATTACK', 
        targetUnitId: bestTarget.id, 
        ability
      };
    }
  }
  
  // ==================== ZoC感知：在控制区内不冒险移动 ====================
  const inZoC = isInEnemyZoC(unit.combatPos, unit, state);
  if (inZoC) {
    // 尝试攻击任何邻近敌人（而非冒险移动去找更远的目标）
    const adjacentEnemies = enemies
      .filter(e => getHexDistance(unit.combatPos, e.combatPos) === 1)
      .sort((a, b) => calculateThreat(b, unit, state) - calculateThreat(a, unit, state));
    for (const adjEnemy of adjacentEnemies) {
      for (const ability of attackAbilities) {
        if (canAttackTarget(unit, adjEnemy, ability)) {
          return { type: 'ATTACK', targetUnitId: adjEnemy.id, ability };
        }
      }
    }
    // 在ZoC内无法攻击任何人，等待而非冒险移动
    return { type: 'WAIT' };
  }
  
  // 不在ZoC中，安全地移动靠近
  const movePos = findBestMovePosition(unit, bestTarget.combatPos, state, 1);
  if (movePos) {
    return { type: 'MOVE', targetPos: movePos };
  }
  
  return { type: 'WAIT' };
};

/**
 * BEAST（野兽）行为树
 * 特点：凶猛进攻，优先攻击最近目标或逃跑的猎物，永不逃跑
 * ZoC感知：野兽在控制区内不会冒险移动，优先撕咬邻近目标
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
  
  // 尝试攻击（伤害由执行层 calculateDamage 统一计算）
  const attackAbilities = getAttackAbilities(unit);
  for (const ability of attackAbilities) {
    if (canAttackTarget(unit, bestTarget, ability)) {
      return { 
        type: 'ATTACK', 
        targetUnitId: bestTarget.id, 
        ability
      };
    }
  }
  
  // ==================== ZoC感知：野兽在控制区内不冒险移动 ====================
  const inZoC = isInEnemyZoC(unit.combatPos, unit, state);
  if (inZoC) {
    // 尝试撕咬邻近的任何敌人
    const adjacentEnemies = enemies
      .filter(e => getHexDistance(unit.combatPos, e.combatPos) === 1)
      .sort((a, b) => {
        // 优先攻击逃跑的猎物
        const aFlee = a.morale === MoraleStatus.FLEEING ? 50 : 0;
        const bFlee = b.morale === MoraleStatus.FLEEING ? 50 : 0;
        return (bFlee + calculateThreat(b, unit, state)) - (aFlee + calculateThreat(a, unit, state));
      });
    for (const adjEnemy of adjacentEnemies) {
      for (const ability of attackAbilities) {
        if (canAttackTarget(unit, adjEnemy, ability)) {
          return { type: 'ATTACK', targetUnitId: adjEnemy.id, ability };
        }
      }
    }
    // 在ZoC内无法攻击，等待而非冒险移动
    return { type: 'WAIT' };
  }
  
  // 不在ZoC中，全力冲向目标
  const movePos = findBestMovePosition(unit, bestTarget.combatPos, state, 1);
  if (movePos) {
    return { type: 'MOVE', targetPos: movePos };
  }
  
  return { type: 'WAIT' };
};

/**
 * ARMY（军队）行为树
 * 特点：有序推进，保持阵型，优先集火同一目标，士气较稳定
 * ZoC感知：军队纪律严明，在控制区内绝不轻举妄动
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
    
    // 威胁评估（包含士气因素和合围加成）
    score += calculateThreat(enemy, unit, state);
    
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
  
  // 尝试攻击首选目标（伤害由执行层 calculateDamage 统一计算）
  const attackAbilities = getAttackAbilities(unit);
  for (const ability of attackAbilities) {
    if (canAttackTarget(unit, bestTarget, ability)) {
      return { 
        type: 'ATTACK', 
        targetUnitId: bestTarget.id, 
        ability
      };
    }
  }
  
  // ==================== ZoC感知：军队在控制区内坚守阵地 ====================
  const inZoC = isInEnemyZoC(unit.combatPos, unit, state);
  if (inZoC) {
    // 军队纪律严明，在ZoC内绝不移动，改为攻击邻近任何敌人
    const adjacentEnemies = enemies
      .filter(e => getHexDistance(unit.combatPos, e.combatPos) === 1)
      .sort((a, b) => calculateThreat(b, unit, state) - calculateThreat(a, unit, state));
    for (const adjEnemy of adjacentEnemies) {
      for (const ability of attackAbilities) {
        if (canAttackTarget(unit, adjEnemy, ability)) {
          return { type: 'ATTACK', targetUnitId: adjEnemy.id, ability };
        }
      }
    }
    // 在ZoC内无法攻击，坚守等待
    return { type: 'WAIT' };
  }
  
  // 不在ZoC中，有序推进
  const movePos = findBestMovePosition(unit, bestTarget.combatPos, state, 1);
  if (movePos) {
    return { type: 'MOVE', targetPos: movePos };
  }
  
  return { type: 'WAIT' };
};

/**
 * ARCHER（弓手）行为树
 * 特点：保持距离，优先攻击无盾目标，士气低落时更容易逃跑
 * ZoC感知：在控制区内不轻易后撤（会被截击），除非极度危险
 */
const executeArcherBehavior = (unit: CombatUnit, state: CombatState): AIAction => {
  const enemies = getEnemies(unit, state);
  const moraleIndex = getMoraleIndex(unit.morale);
  const hpPercent = unit.hp / unit.maxHp;
  const inZoC = isInEnemyZoC(unit.combatPos, unit, state);
  
  // 检查是否有敌人太近
  const tooCloseEnemies = enemies.filter(e => 
    getHexDistance(unit.combatPos, e.combatPos) <= 2
  );
  
  // 如果敌人太近，尝试拉开距离
  // ZoC感知：在控制区内后撤会被截击，只有极端情况才冒险
  if (tooCloseEnemies.length > 0) {
    const desperateSituation = hpPercent < 0.25 || moraleIndex >= 3; // 血量极低或崩溃
    if (!inZoC || desperateSituation) {
      const fleePos = findFleePosition(unit, tooCloseEnemies, state);
      if (fleePos && getHexDistance(unit.combatPos, fleePos) >= 1) {
        return { type: 'MOVE', targetPos: fleePos };
      }
    }
  }
  
  // 选择目标：优先无盾、低血量、士气低落的目标
  let bestTarget: CombatUnit | null = null;
  let bestScore = -Infinity;
  
  for (const enemy of enemies) {
    let score = calculateThreat(enemy, unit, state);
    
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
  
  // 尝试远程攻击（伤害由执行层 calculateDamage 统一计算）
  const attackAbilities = getAttackAbilities(unit);
  const rangedAbility = attackAbilities.find(a => a.range[1] > 2);
  
  if (rangedAbility && canAttackTarget(unit, bestTarget, rangedAbility)) {
    return { 
      type: 'ATTACK', 
      targetUnitId: bestTarget.id, 
      ability: rangedAbility
    };
  }
  
  // 如果没有远程技能或射程不够，尝试近战（对邻近目标）
  for (const ability of attackAbilities) {
    if (canAttackTarget(unit, bestTarget, ability)) {
      return { 
        type: 'ATTACK', 
        targetUnitId: bestTarget.id, 
        ability
      };
    }
  }
  
  // ==================== ZoC感知：在控制区内不移动 ====================
  if (inZoC) {
    // 尝试近战攻击邻近的任何敌人
    const adjacentEnemies = enemies.filter(e => getHexDistance(unit.combatPos, e.combatPos) === 1);
    for (const adjEnemy of adjacentEnemies) {
      for (const ability of attackAbilities) {
        if (canAttackTarget(unit, adjEnemy, ability)) {
          return { type: 'ATTACK', targetUnitId: adjEnemy.id, ability };
        }
      }
    }
    // 在ZoC内无法攻击，等待
    return { type: 'WAIT' };
  }
  
  // 不在ZoC中，移动到合适的射击位置
  const movePos = findBestMovePosition(unit, bestTarget.combatPos, state, 4);
  if (movePos) {
    return { type: 'MOVE', targetPos: movePos };
  }
  
  return { type: 'WAIT' };
};

/**
 * BERSERKER（狂战士）行为树
 * 特点：血量越低攻击越高，永不后退，无视士气惩罚
 * ZoC感知：狂战士在控制区内优先攻击邻近敌人，不冒险移动
 */
const executeBerserkerBehavior = (unit: CombatUnit, state: CombatState): AIAction => {
  const enemies = getEnemies(unit, state);
  
  // 选择目标：优先攻击最强的敌人，或者士气最低的敌人
  let bestTarget: CombatUnit | null = null;
  let maxThreat = -Infinity;
  
  for (const enemy of enemies) {
    const threat = calculateThreat(enemy, unit, state);
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
  
  // 尝试攻击（伤害由执行层 calculateDamage 统一计算，狂战士加成通过 bonusDamage 传递）
  const attackAbilities = getAttackAbilities(unit);
  for (const ability of attackAbilities) {
    if (canAttackTarget(unit, bestTarget, ability)) {
      return { 
        type: 'ATTACK', 
        targetUnitId: bestTarget.id, 
        ability
      };
    }
  }
  
  // ==================== ZoC感知：狂战士在控制区内不冒险移动 ====================
  const inZoC = isInEnemyZoC(unit.combatPos, unit, state);
  if (inZoC) {
    // 尝试攻击邻近的任何敌人
    const adjacentEnemies = enemies
      .filter(e => getHexDistance(unit.combatPos, e.combatPos) === 1)
      .sort((a, b) => calculateThreat(b, unit, state) - calculateThreat(a, unit, state));
    for (const adjEnemy of adjacentEnemies) {
      for (const ability of attackAbilities) {
        if (canAttackTarget(unit, adjEnemy, ability)) {
          return { type: 'ATTACK', targetUnitId: adjEnemy.id, ability };
        }
      }
    }
    // 在ZoC内无法攻击，等待而非冒险移动
    return { type: 'WAIT' };
  }
  
  // 不在ZoC中，冲向目标
  const movePos = findBestMovePosition(unit, bestTarget.combatPos, state, 1);
  if (movePos) {
    return { type: 'MOVE', targetPos: movePos };
  }
  
  return { type: 'WAIT' };
};

/**
 * TANK（盾卫）行为树
 * 特点：优先使用盾墙技能保护友军弓手，站在前线不主动追击远处敌人
 * 在 ZoC 内坚守阵地，只有当邻近无敌人时才缓慢推进
 */
const executeTankBehavior = (unit: CombatUnit, state: CombatState): AIAction => {
  const enemies = getEnemies(unit, state);
  const allies = getAllies(unit, state);
  
  // 盾卫士气较稳定，只有在崩溃且孤立无援时才考虑撤退
  if (unit.morale === MoraleStatus.BREAKING && allies.length === 0) {
    const fleePos = findFleePosition(unit, enemies, state);
    if (fleePos && Math.random() < 0.2) {
      return { type: 'MOVE', targetPos: fleePos };
    }
  }
  
  // 优先使用盾墙技能（如果有盾牌且未开启盾墙）
  if (!unit.isShieldWall && unit.equipment.offHand?.type === 'SHIELD') {
    const allAbilities = getUnitAbilities(unit);
    const shieldWall = allAbilities.find(a => a.id === 'SHIELDWALL');
    if (shieldWall && unit.currentAP >= shieldWall.apCost) {
      // 检查是否有敌人在 3 格以内（需要防御时才开盾墙）
      const nearbyEnemies = enemies.filter(e => getHexDistance(unit.combatPos, e.combatPos) <= 3);
      if (nearbyEnemies.length > 0) {
        return { type: 'SKILL', ability: shieldWall };
      }
    }
  }
  
  // 选择目标：优先攻击最近的敌人，偏好已经与友军交战的目标
  let bestTarget: CombatUnit | null = null;
  let bestScore = -Infinity;
  
  for (const enemy of enemies) {
    let score = 0;
    const dist = getHexDistance(unit.combatPos, enemy.combatPos);
    
    // 盾卫不追击远处目标，距离惩罚很重
    score -= dist * 8;
    
    // 邻近敌人大幅加分（盾卫的主要职责是挡住眼前的敌人）
    if (dist <= 1) score += 60;
    else if (dist <= 2) score += 30;
    
    // 友军附近的敌人优先（协同防御）
    const nearbyAllies = allies.filter(a => getHexDistance(a.combatPos, enemy.combatPos) <= 2);
    score += nearbyAllies.length * 10;
    
    // 低血量目标适当加分
    const hpPercent = enemy.hp / enemy.maxHp;
    if (hpPercent < 0.5) score += 20;
    
    // 威胁评估
    score += calculateThreat(enemy, unit, state) * 0.5;
    
    if (score > bestScore) {
      bestScore = score;
      bestTarget = enemy;
    }
  }
  
  if (!bestTarget) return { type: 'WAIT' };
  
  // 尝试攻击首选目标
  const attackAbilities = getAttackAbilities(unit);
  for (const ability of attackAbilities) {
    if (canAttackTarget(unit, bestTarget, ability)) {
      return { type: 'ATTACK', targetUnitId: bestTarget.id, ability };
    }
  }
  
  // ZoC感知：盾卫在控制区内绝不移动
  const inZoC = isInEnemyZoC(unit.combatPos, unit, state);
  if (inZoC) {
    const adjacentEnemies = enemies
      .filter(e => getHexDistance(unit.combatPos, e.combatPos) === 1)
      .sort((a, b) => calculateThreat(b, unit, state) - calculateThreat(a, unit, state));
    for (const adjEnemy of adjacentEnemies) {
      for (const ability of attackAbilities) {
        if (canAttackTarget(unit, adjEnemy, ability)) {
          return { type: 'ATTACK', targetUnitId: adjEnemy.id, ability };
        }
      }
    }
    return { type: 'WAIT' };
  }
  
  // 不在 ZoC 中：优先移动到友方弓手前方保护他们
  const allyArchers = allies.filter(a => {
    const weapon = a.equipment.mainHand;
    return weapon && (weapon.name.includes('弓') || weapon.name.includes('弩'));
  });
  
  if (allyArchers.length > 0 && enemies.length > 0) {
    // 找到弓手和最近敌人之间的位置
    const closestEnemy = enemies.reduce((a, b) => {
      const distA = Math.min(...allyArchers.map(ar => getHexDistance(ar.combatPos, a.combatPos)));
      const distB = Math.min(...allyArchers.map(ar => getHexDistance(ar.combatPos, b.combatPos)));
      return distA < distB ? a : b;
    });
    const movePos = findBestMovePosition(unit, closestEnemy.combatPos, state, 1);
    if (movePos) {
      return { type: 'MOVE', targetPos: movePos };
    }
  }
  
  // 缓慢推进向最近敌人
  const movePos = findBestMovePosition(unit, bestTarget.combatPos, state, 1);
  if (movePos) {
    return { type: 'MOVE', targetPos: movePos };
  }
  
  return { type: 'WAIT' };
};

/**
 * SKIRMISHER（游击）行为树
 * 特点：优先使用投掷武器攻击，保持 2-3 格距离，弹药耗尽后切近战
 * 优先攻击侧翼/落单目标，在 ZoC 内尝试脱离而非死战
 */
const executeSkirmisherBehavior = (unit: CombatUnit, state: CombatState): AIAction => {
  const enemies = getEnemies(unit, state);
  const allies = getAllies(unit, state);
  const hpPercent = unit.hp / unit.maxHp;
  const moraleIndex = getMoraleIndex(unit.morale);
  const inZoC = isInEnemyZoC(unit.combatPos, unit, state);
  
  // 游击手血量极低且士气动摇，或士气崩溃时才逃跑
  const shouldConsiderFleeing = (hpPercent < 0.3 && moraleIndex >= 2) || moraleIndex >= 3;
  if (shouldConsiderFleeing) {
    const fleeChance = moraleIndex >= 3 ? 0.55 : 0.20;
    if (Math.random() < fleeChance) {
      const fleePos = findFleePosition(unit, enemies, state);
      if (fleePos) {
        return { type: 'MOVE', targetPos: fleePos };
      }
    }
  }
  
  // 检查是否有投掷武器
  const attackAbilities = getAttackAbilities(unit);
  const throwAbility = attackAbilities.find(a => a.id === 'THROW');
  const hasThrowWeapon = !!throwAbility;
  
  // 选择目标：优先落单、侧翼暴露的敌人
  let bestTarget: CombatUnit | null = null;
  let bestScore = -Infinity;
  
  for (const enemy of enemies) {
    let score = calculateThreat(enemy, unit, state);
    const dist = getHexDistance(unit.combatPos, enemy.combatPos);
    
    // 落单目标大幅加分
    const nearbyFriends = enemies.filter(e => 
      e.id !== enemy.id && getHexDistance(e.combatPos, enemy.combatPos) <= 2
    );
    if (nearbyFriends.length === 0) {
      score += 35;
    }
    
    // 无盾目标加分（投掷武器对无盾目标更有效）
    if (!enemy.equipment.offHand || enemy.equipment.offHand.type !== 'SHIELD') {
      score += 25;
    }
    
    // 游击手偏好适中距离的目标
    if (hasThrowWeapon) {
      if (dist >= 2 && dist <= 4) score += 20;
      else if (dist > 4) score -= dist * 3;
      else score -= 10; // 太近了不好
    } else {
      score -= dist * 3;
    }
    
    // 士气低落的目标加分
    if (enemy.morale === MoraleStatus.FLEEING) score += 20;
    
    if (score > bestScore) {
      bestScore = score;
      bestTarget = enemy;
    }
  }
  
  if (!bestTarget) return { type: 'WAIT' };
  
  // 如果有投掷武器，优先远程攻击
  if (hasThrowWeapon && throwAbility && canAttackTarget(unit, bestTarget, throwAbility)) {
    return { type: 'ATTACK', targetUnitId: bestTarget.id, ability: throwAbility };
  }
  
  // 尝试用其他可用攻击
  for (const ability of attackAbilities) {
    if (canAttackTarget(unit, bestTarget, ability)) {
      return { type: 'ATTACK', targetUnitId: bestTarget.id, ability };
    }
  }
  
  // ZoC感知：游击手在 ZoC 内尝试脱离（冒险后撤）
  if (inZoC) {
    // 游击手会尝试逃离 ZoC，除非血量极低不敢冒险
    if (hpPercent > 0.2) {
      const fleePos = findFleePosition(unit, enemies, state);
      if (fleePos) {
        return { type: 'MOVE', targetPos: fleePos };
      }
    }
    // 无法脱离，尝试攻击邻近敌人
    const adjacentEnemies = enemies
      .filter(e => getHexDistance(unit.combatPos, e.combatPos) === 1)
      .sort((a, b) => calculateThreat(b, unit, state) - calculateThreat(a, unit, state));
    for (const adjEnemy of adjacentEnemies) {
      for (const ability of attackAbilities) {
        if (canAttackTarget(unit, adjEnemy, ability)) {
          return { type: 'ATTACK', targetUnitId: adjEnemy.id, ability };
        }
      }
    }
    return { type: 'WAIT' };
  }
  
  // 不在 ZoC 中：移动到适合投掷的距离（2-3格）或靠近近战
  const preferredRange = hasThrowWeapon ? 3 : 1;
  const movePos = findBestMovePosition(unit, bestTarget.combatPos, state, preferredRange);
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
    
    // 如果数量劣势非常明显，才考虑逃跑
    if (enemies.length > allies.length + 2) {
      const fleeChance = 0.15 + (enemies.length - allies.length) * 0.08;
      if (Math.random() < fleeChance) {
        const fleePos = findFleePosition(unit, enemies, state);
        if (fleePos) {
          return { type: 'MOVE', targetPos: fleePos };
        }
      }
    }
  }

  // 弩未装填时优先装填，避免出现“无需装填即可连续射击”。
  const weapon = unit.equipment.mainHand;
  const isCrossbow = weapon?.weaponClass === 'crossbow' || weapon?.name.includes('弩');
  if (isCrossbow && unit.crossbowLoaded === false) {
    const reloadAbility = getUnitAbilities(unit).find(a => a.id === 'RELOAD');
    if (reloadAbility && unit.currentAP >= reloadAbility.apCost) {
      return { type: 'SKILL', ability: reloadAbility };
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
    case 'TANK':
      return executeTankBehavior(unit, state);
    case 'SKIRMISHER':
      return executeSkirmisherBehavior(unit, state);
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
    'BERSERKER': '狂战士',
    'TANK': '盾卫',
    'SKIRMISHER': '游击'
  };
  return names[aiType] || '未知';
};
