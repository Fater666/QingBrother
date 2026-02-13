/**
 * 大地图 AI 行为树系统
 * 根据不同敌人类型实现差异化的世界地图行为
 * 参考《战场兄弟》的设计理念
 */

import { WorldEntity, Party, WorldTile, City, WorldAIType } from '../types';
import { MAP_SIZE } from '../constants';

// ==================== 工具函数 ====================

/**
 * 计算两点之间的距离
 */
const getDistance = (x1: number, y1: number, x2: number, y2: number): number => {
  return Math.hypot(x2 - x1, y2 - y1);
};

/**
 * 计算朝向目标的单位向量
 */
const getDirection = (fromX: number, fromY: number, toX: number, toY: number): { dx: number; dy: number } => {
  const dist = getDistance(fromX, fromY, toX, toY);
  if (dist < 0.01) return { dx: 0, dy: 0 };
  return {
    dx: (toX - fromX) / dist,
    dy: (toY - fromY) / dist
  };
};

/**
 * 检查位置是否在地图边界内
 */
const isInBounds = (x: number, y: number): boolean => {
  return x >= 0 && x < MAP_SIZE && y >= 0 && y < MAP_SIZE;
};

/**
 * 获取指定位置的地形类型
 */
const getTileType = (x: number, y: number, tiles: WorldTile[]): string | null => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (!isInBounds(ix, iy)) return null;
  const tile = tiles[iy * MAP_SIZE + ix];
  return tile ? tile.type : null;
};

/**
 * 检查位置是否是道路
 */
const isRoad = (x: number, y: number, tiles: WorldTile[]): boolean => {
  const type = getTileType(x, y, tiles);
  return type === 'ROAD' || type === 'CITY';
};

/**
 * 查找最近的道路位置
 */
const findNearestRoad = (x: number, y: number, tiles: WorldTile[], searchRadius: number = 10): { x: number; y: number } | null => {
  let nearest: { x: number; y: number; dist: number } | null = null;
  
  for (let dy = -searchRadius; dy <= searchRadius; dy++) {
    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      const tx = Math.floor(x) + dx;
      const ty = Math.floor(y) + dy;
      if (isInBounds(tx, ty) && isRoad(tx, ty, tiles)) {
        const dist = Math.hypot(dx, dy);
        if (!nearest || dist < nearest.dist) {
          nearest = { x: tx + 0.5, y: ty + 0.5, dist };
        }
      }
    }
  }
  
  return nearest ? { x: nearest.x, y: nearest.y } : null;
};

/**
 * 为商队选择下一段“沿道路前进”的局部目标点
 * - 不在道路上：先并道
 * - 在道路上：优先选择能缩短到目的地距离的邻近道路点
 */
const getRoadTravelTarget = (
  entity: WorldEntity,
  destination: { x: number; y: number },
  tiles: WorldTile[]
): { x: number; y: number } => {
  const currentTileX = Math.floor(entity.x);
  const currentTileY = Math.floor(entity.y);
  const currentDist = getDistance(entity.x, entity.y, destination.x, destination.y);
  const currentlyOnRoad = isRoad(entity.x, entity.y, tiles);

  if (!currentlyOnRoad) {
    return findNearestRoad(entity.x, entity.y, tiles, 6) ?? destination;
  }

  if (currentDist < 2.2) {
    return destination;
  }

  let best: { x: number; y: number; score: number } | null = null;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const tx = currentTileX + dx;
      const ty = currentTileY + dy;
      if (!isInBounds(tx, ty)) continue;
      if (!isRoad(tx + 0.5, ty + 0.5, tiles)) continue;
      const targetX = tx + 0.5;
      const targetY = ty + 0.5;
      const distToDest = getDistance(targetX, targetY, destination.x, destination.y);
      const progressBonus = distToDest < currentDist ? -0.6 : 0;
      const score = distToDest + progressBonus;
      if (!best || score < best.score) {
        best = { x: targetX, y: targetY, score };
      }
    }
  }

  if (best) return { x: best.x, y: best.y };
  return findNearestRoad(destination.x, destination.y, tiles, 8) ?? destination;
};

/**
 * 在领地内随机选择一个点
 */
const getRandomPointInTerritory = (centerX: number, centerY: number, radius: number): { x: number; y: number } => {
  const angle = Math.random() * Math.PI * 2;
  const r = Math.random() * radius;
  return {
    x: Math.max(0, Math.min(MAP_SIZE - 1, centerX + Math.cos(angle) * r)),
    y: Math.max(0, Math.min(MAP_SIZE - 1, centerY + Math.sin(angle) * r))
  };
};

/**
 * 计算远离威胁的逃跑方向
 */
const getFleeDirection = (entity: WorldEntity, threatX: number, threatY: number): { x: number; y: number } => {
  const dir = getDirection(threatX, threatY, entity.x, entity.y);
  const fleeDistance = 8;
  return {
    x: Math.max(0, Math.min(MAP_SIZE - 1, entity.x + dir.dx * fleeDistance)),
    y: Math.max(0, Math.min(MAP_SIZE - 1, entity.y + dir.dy * fleeDistance))
  };
};

/**
 * 查找实体（如商队）
 */
const findEntityOfType = (
  entities: WorldEntity[],
  entityType: WorldEntity['type'],
  nearX: number,
  nearY: number,
  maxDistance: number,
  excludeId?: string
): WorldEntity | null => {
  let nearest: { entity: WorldEntity; dist: number } | null = null;
  
  for (const ent of entities) {
    if (ent.id === excludeId) continue;
    if (ent.type !== entityType) continue;
    
    const dist = getDistance(nearX, nearY, ent.x, ent.y);
    if (dist <= maxDistance && (!nearest || dist < nearest.dist)) {
      nearest = { entity: ent, dist };
    }
  }
  
  return nearest?.entity || null;
};

/**
 * 查找敌对实体（土匪）
 */
const findHostileEntity = (
  entities: WorldEntity[],
  nearX: number,
  nearY: number,
  maxDistance: number,
  excludeId?: string
): WorldEntity | null => {
  let nearest: { entity: WorldEntity; dist: number } | null = null;
  
  for (const ent of entities) {
    if (ent.id === excludeId) continue;
    if (ent.faction !== 'HOSTILE') continue;
    if (ent.type !== 'BANDIT') continue;
    
    const dist = getDistance(nearX, nearY, ent.x, ent.y);
    if (dist <= maxDistance && (!nearest || dist < nearest.dist)) {
      nearest = { entity: ent, dist };
    }
  }
  
  return nearest?.entity || null;
};

// ==================== 行为树：土匪 (BANDIT) ====================
/**
 * 土匪行为特点：
 * - 沿道路巡逻，寻找猎物
 * - 追击落单的玩家和商队
 * - 血量低时逃跑
 * - 伏击战术：在道路附近埋伏
 */
const executeBanditBehavior = (
  entity: WorldEntity,
  party: Party,
  entities: WorldEntity[],
  tiles: WorldTile[],
  dt: number
): WorldEntity => {
  const newEntity = { ...entity };
  const distToPlayer = getDistance(entity.x, entity.y, party.x, party.y);
  
  // 1. 检查是否需要逃跑（如果有逃跑阈值且实力不足）
  if (entity.fleeThreshold && entity.strength) {
    const playerStrength = party.mercenaries.length * 10; // 简单估算玩家实力
    if (entity.strength < playerStrength * entity.fleeThreshold) {
      newEntity.aiState = 'FLEE';
      const fleePos = getFleeDirection(entity, party.x, party.y);
      newEntity.targetX = fleePos.x;
      newEntity.targetY = fleePos.y;
      return moveEntity(newEntity, dt);
    }
  }
  
  // 2. 检测玩家是否在警戒范围内
  if (distToPlayer <= entity.alertRadius) {
    newEntity.aiState = 'CHASE';
    newEntity.targetX = party.x;
    newEntity.targetY = party.y;
    newEntity.lastSeenPlayerPos = { x: party.x, y: party.y };
    newEntity.targetEntityId = null;
    return moveEntity(newEntity, dt);
  }
  
  // 3. 如果正在追击但玩家已离开追击范围
  if (entity.aiState === 'CHASE') {
    if (distToPlayer > entity.chaseRadius) {
      // 移动到上次发现玩家的位置
      if (entity.lastSeenPlayerPos) {
        const distToLastSeen = getDistance(entity.x, entity.y, entity.lastSeenPlayerPos.x, entity.lastSeenPlayerPos.y);
        if (distToLastSeen < 1) {
          // 已到达上次位置，返回巡逻
          newEntity.aiState = 'PATROL';
          newEntity.lastSeenPlayerPos = undefined;
        } else {
          newEntity.targetX = entity.lastSeenPlayerPos.x;
          newEntity.targetY = entity.lastSeenPlayerPos.y;
          return moveEntity(newEntity, dt);
        }
      } else {
        newEntity.aiState = 'PATROL';
      }
    } else {
      // 继续追击
      newEntity.targetX = party.x;
      newEntity.targetY = party.y;
      return moveEntity(newEntity, dt);
    }
  }
  
  // 4. 检测是否有商队在附近
  const nearbyTrader = findEntityOfType(entities, 'TRADER', entity.x, entity.y, entity.alertRadius, entity.id);
  if (nearbyTrader) {
    newEntity.aiState = 'CHASE';
    newEntity.targetX = nearbyTrader.x;
    newEntity.targetY = nearbyTrader.y;
    newEntity.targetEntityId = nearbyTrader.id;
    return moveEntity(newEntity, dt);
  }
  
  // 5. 追击商队逻辑
  if (entity.targetEntityId) {
    const targetEntity = entities.find(e => e.id === entity.targetEntityId);
    if (targetEntity) {
      const distToTarget = getDistance(entity.x, entity.y, targetEntity.x, targetEntity.y);
      if (distToTarget <= entity.chaseRadius) {
        newEntity.targetX = targetEntity.x;
        newEntity.targetY = targetEntity.y;
        return moveEntity(newEntity, dt);
      }
    }
    // 目标丢失或逃离，恢复巡逻
    newEntity.targetEntityId = null;
    newEntity.aiState = 'PATROL';
  }
  
  // 6. 巡逻行为：沿道路移动
  if (entity.aiState === 'PATROL' || entity.aiState === 'IDLE') {
    newEntity.aiState = 'PATROL';
    
    // 使用巡逻点
    if (entity.patrolPoints && entity.patrolPoints.length > 0) {
      const patrolIndex = entity.patrolIndex || 0;
      const target = entity.patrolPoints[patrolIndex];
      const distToTarget = getDistance(entity.x, entity.y, target.x, target.y);
      
      if (distToTarget < 1) {
        // 到达巡逻点，前往下一个
        newEntity.patrolIndex = (patrolIndex + 1) % entity.patrolPoints.length;
        const nextTarget = entity.patrolPoints[newEntity.patrolIndex];
        newEntity.targetX = nextTarget.x;
        newEntity.targetY = nextTarget.y;
      } else {
        newEntity.targetX = target.x;
        newEntity.targetY = target.y;
      }
    } else {
      // 没有巡逻点，寻找道路并沿道路移动
      const nearRoad = findNearestRoad(entity.x, entity.y, tiles);
      if (nearRoad) {
        newEntity.targetX = nearRoad.x;
        newEntity.targetY = nearRoad.y;
      } else {
        // 返回家
        newEntity.targetX = entity.homeX;
        newEntity.targetY = entity.homeY;
      }
    }
    
    return moveEntity(newEntity, dt);
  }
  
  return moveEntity(newEntity, dt);
};

// ==================== 行为树：野兽 (BEAST) ====================
/**
 * 野兽行为特点：
 * - 在领地内游荡
 * - 当入侵者进入领地时追击
 * - 不会离开领地太远
 * - 永不逃跑
 */
const executeBeastBehavior = (
  entity: WorldEntity,
  party: Party,
  entities: WorldEntity[],
  tiles: WorldTile[],
  dt: number
): WorldEntity => {
  const newEntity = { ...entity };
  const distToPlayer = getDistance(entity.x, entity.y, party.x, party.y);
  const distToHome = getDistance(entity.x, entity.y, entity.homeX, entity.homeY);
  const territoryRadius = entity.territoryRadius || 8;
  
  // 检查玩家是否在领地内
  const playerInTerritory = getDistance(party.x, party.y, entity.homeX, entity.homeY) <= territoryRadius;
  
  // 1. 如果玩家在领地内且在警戒范围内，追击
  if (playerInTerritory && distToPlayer <= entity.alertRadius) {
    newEntity.aiState = 'CHASE';
    newEntity.targetX = party.x;
    newEntity.targetY = party.y;
    return moveEntity(newEntity, dt);
  }
  
  // 2. 如果正在追击
  if (entity.aiState === 'CHASE') {
    // 检查是否超出领地范围
    if (distToHome > territoryRadius * 1.2) {
      // 返回领地
      newEntity.aiState = 'RETURN';
      newEntity.targetX = entity.homeX;
      newEntity.targetY = entity.homeY;
      return moveEntity(newEntity, dt);
    }
    
    // 检查玩家是否逃离
    if (distToPlayer > entity.chaseRadius || !playerInTerritory) {
      newEntity.aiState = 'WANDER';
    } else {
      // 继续追击
      newEntity.targetX = party.x;
      newEntity.targetY = party.y;
      return moveEntity(newEntity, dt);
    }
  }
  
  // 3. 返回行为
  if (entity.aiState === 'RETURN') {
    if (distToHome < 2) {
      newEntity.aiState = 'WANDER';
    } else {
      newEntity.targetX = entity.homeX;
      newEntity.targetY = entity.homeY;
      return moveEntity(newEntity, dt);
    }
  }
  
  // 4. 游荡行为：在领地内随机移动
  newEntity.aiState = 'WANDER';
  
  // 更新游荡冷却
  const cooldown = (entity.wanderCooldown || 0) - dt;
  if (cooldown <= 0) {
    // 选择新的游荡目标
    const wanderTarget = getRandomPointInTerritory(entity.homeX, entity.homeY, territoryRadius * 0.7);
    newEntity.targetX = wanderTarget.x;
    newEntity.targetY = wanderTarget.y;
    newEntity.wanderCooldown = 3 + Math.random() * 5; // 3-8秒后重新选择目标
  } else {
    newEntity.wanderCooldown = cooldown;
  }
  
  return moveEntity(newEntity, dt);
};

// ==================== 行为树：军队 (ARMY) ====================
/**
 * 军队行为特点：
 * - 巡逻城市周边
 * - 追击发现的土匪
 * - 不会追击玩家（除非玩家是敌对势力）
 * - 保护商队
 */
const executeArmyBehavior = (
  entity: WorldEntity,
  party: Party,
  entities: WorldEntity[],
  tiles: WorldTile[],
  cities: City[],
  dt: number
): WorldEntity => {
  const newEntity = { ...entity };
  
  // 获取绑定的城市
  const linkedCity = entity.linkedCityId 
    ? cities.find(c => c.id === entity.linkedCityId) 
    : null;
  
  const patrolCenter = linkedCity 
    ? { x: linkedCity.x, y: linkedCity.y } 
    : { x: entity.homeX, y: entity.homeY };
  
  // 1. 检测附近是否有土匪（忽略在营地附近的敌人，避免巡防军去打营地）
  const CAMP_SAFE_RADIUS = 6;
  const nearbyBandit = findHostileEntity(entities, entity.x, entity.y, entity.alertRadius, entity.id);

  if (nearbyBandit) {
    // 如果敌人在自己的营地附近，不去追击
    const isNearCamp = nearbyBandit.campId &&
      getDistance(nearbyBandit.x, nearbyBandit.y, nearbyBandit.homeX, nearbyBandit.homeY) < CAMP_SAFE_RADIUS;

    if (!isNearCamp) {
      const distToBandit = getDistance(entity.x, entity.y, nearbyBandit.x, nearbyBandit.y);

      // 追击土匪
      if (distToBandit <= entity.chaseRadius) {
        newEntity.aiState = 'CHASE';
        newEntity.targetX = nearbyBandit.x;
        newEntity.targetY = nearbyBandit.y;
        newEntity.targetEntityId = nearbyBandit.id;
        return moveEntity(newEntity, dt);
      }
    }
  }
  
  // 2. 如果正在追击
  if (entity.aiState === 'CHASE' && entity.targetEntityId) {
    const targetBandit = entities.find(e => e.id === entity.targetEntityId);
    if (targetBandit) {
      // 如果目标退回到营地附近，放弃追击
      const targetNearCamp = targetBandit.campId &&
        getDistance(targetBandit.x, targetBandit.y, targetBandit.homeX, targetBandit.homeY) < CAMP_SAFE_RADIUS;

      const distToTarget = getDistance(entity.x, entity.y, targetBandit.x, targetBandit.y);
      const distFromPatrolCenter = getDistance(entity.x, entity.y, patrolCenter.x, patrolCenter.y);

      // 不要追太远离开巡逻区域，也不要追进营地
      if (!targetNearCamp && distToTarget <= entity.chaseRadius && distFromPatrolCenter < entity.chaseRadius * 1.5) {
        newEntity.targetX = targetBandit.x;
        newEntity.targetY = targetBandit.y;
        return moveEntity(newEntity, dt);
      }
    }
    
    // 目标丢失或太远，返回巡逻
    newEntity.aiState = 'RETURN';
    newEntity.targetEntityId = null;
    newEntity.targetX = patrolCenter.x;
    newEntity.targetY = patrolCenter.y;
    return moveEntity(newEntity, dt);
  }
  
  // 3. 返回巡逻中心
  if (entity.aiState === 'RETURN') {
    const distToCenter = getDistance(entity.x, entity.y, patrolCenter.x, patrolCenter.y);
    if (distToCenter < 2) {
      newEntity.aiState = 'PATROL';
    } else {
      newEntity.targetX = patrolCenter.x;
      newEntity.targetY = patrolCenter.y;
      return moveEntity(newEntity, dt);
    }
  }
  
  // 4. 巡逻行为：在城市周边巡逻
  newEntity.aiState = 'PATROL';
  
  if (entity.patrolPoints && entity.patrolPoints.length > 0) {
    const patrolIndex = entity.patrolIndex || 0;
    const target = entity.patrolPoints[patrolIndex];
    const distToTarget = getDistance(entity.x, entity.y, target.x, target.y);
    
    if (distToTarget < 1) {
      newEntity.patrolIndex = (patrolIndex + 1) % entity.patrolPoints.length;
      const nextTarget = entity.patrolPoints[newEntity.patrolIndex];
      newEntity.targetX = nextTarget.x;
      newEntity.targetY = nextTarget.y;
    } else {
      newEntity.targetX = target.x;
      newEntity.targetY = target.y;
    }
  } else {
    // 在巡逻中心附近随机移动
    const distToCenter = getDistance(entity.x, entity.y, patrolCenter.x, patrolCenter.y);
    if (distToCenter > 6 || !entity.targetX || !entity.targetY) {
      const wanderTarget = getRandomPointInTerritory(patrolCenter.x, patrolCenter.y, 5);
      newEntity.targetX = wanderTarget.x;
      newEntity.targetY = wanderTarget.y;
    }
  }
  
  return moveEntity(newEntity, dt);
};

// ==================== 行为树：商队 (TRADER) ====================
/**
 * 商队行为特点：
 * - 在城市之间旅行
 * - 遇到敌人时逃跑
 * - 到达目的地后停留一段时间，然后前往下一个城市
 */
const executeTraderBehavior = (
  entity: WorldEntity,
  party: Party,
  entities: WorldEntity[],
  tiles: WorldTile[],
  cities: City[],
  dt: number
): WorldEntity => {
  const newEntity = { ...entity };
  
  // 1. 检测是否有敌人接近
  const nearbyHostile = findHostileEntity(entities, entity.x, entity.y, entity.alertRadius, entity.id);
  
  if (nearbyHostile) {
    // 逃跑
    newEntity.aiState = 'FLEE';
    const fleePos = getFleeDirection(entity, nearbyHostile.x, nearbyHostile.y);
    newEntity.targetX = fleePos.x;
    newEntity.targetY = fleePos.y;
    return moveEntity(newEntity, dt);
  }
  
  // 2. 如果正在逃跑，检查是否安全
  if (entity.aiState === 'FLEE') {
    const hostileStillNear = findHostileEntity(entities, entity.x, entity.y, entity.chaseRadius, entity.id);
    if (!hostileStillNear) {
      newEntity.aiState = 'TRAVEL';
    } else {
      const fleePos = getFleeDirection(entity, hostileStillNear.x, hostileStillNear.y);
      newEntity.targetX = fleePos.x;
      newEntity.targetY = fleePos.y;
      return moveEntity(newEntity, dt);
    }
  }
  
  // 3. 旅行行为
  newEntity.aiState = 'TRAVEL';
  
  // 获取目的地城市
  let destCity = entity.destinationCityId 
    ? cities.find(c => c.id === entity.destinationCityId)
    : null;
  
  if (!destCity) {
    // 随机选择一个目的地城市
    const otherCities = cities.filter(c => c.id !== entity.linkedCityId);
    if (otherCities.length > 0) {
      destCity = otherCities[Math.floor(Math.random() * otherCities.length)];
      newEntity.destinationCityId = destCity.id;
    }
  }
  
  if (destCity) {
    const distToDest = getDistance(entity.x, entity.y, destCity.x, destCity.y);
    
    if (distToDest < 1) {
      // 任务护送商队到站后原地等待，交由任务系统判定完成并移除
      if (entity.id.startsWith('escort-trader-')) {
        newEntity.aiState = 'IDLE';
        newEntity.targetX = null;
        newEntity.targetY = null;
        return newEntity;
      }
      // 到达目的地，选择新的目的地
      newEntity.linkedCityId = destCity.id;
      const otherCities = cities.filter(c => c.id !== destCity!.id);
      if (otherCities.length > 0) {
        const newDest = otherCities[Math.floor(Math.random() * otherCities.length)];
        newEntity.destinationCityId = newDest.id;
        newEntity.targetX = newDest.x;
        newEntity.targetY = newDest.y;
      }
    } else {
      const roadTarget = getRoadTravelTarget(entity, { x: destCity.x, y: destCity.y }, tiles);
      newEntity.targetX = roadTarget.x;
      newEntity.targetY = roadTarget.y;
    }
  }
  
  return moveEntity(newEntity, dt);
};

// ==================== 行为树：游牧民 (NOMAD) ====================
/**
 * 游牧民行为特点：
 * - 随机游荡
 * - 行为多变：可能追击、可能逃跑、可能无视
 * - 根据实力对比决定行为
 */
const executeNomadBehavior = (
  entity: WorldEntity,
  party: Party,
  entities: WorldEntity[],
  tiles: WorldTile[],
  dt: number
): WorldEntity => {
  const newEntity = { ...entity };
  const distToPlayer = getDistance(entity.x, entity.y, party.x, party.y);
  
  // 根据实力对比决定行为
  const entityStrength = entity.strength || 30;
  const playerStrength = party.mercenaries.length * 10;
  const strengthRatio = entityStrength / Math.max(1, playerStrength);
  
  // 1. 如果玩家在警戒范围内
  if (distToPlayer <= entity.alertRadius) {
    if (strengthRatio > 1.2) {
      // 实力强于玩家，追击
      if (entity.faction === 'HOSTILE') {
        newEntity.aiState = 'CHASE';
        newEntity.targetX = party.x;
        newEntity.targetY = party.y;
        return moveEntity(newEntity, dt);
      }
    } else if (strengthRatio < 0.6) {
      // 实力弱于玩家，逃跑
      newEntity.aiState = 'FLEE';
      const fleePos = getFleeDirection(entity, party.x, party.y);
      newEntity.targetX = fleePos.x;
      newEntity.targetY = fleePos.y;
      return moveEntity(newEntity, dt);
    }
    // 实力相当，维持当前行为
  }
  
  // 2. 如果正在追击
  if (entity.aiState === 'CHASE') {
    if (distToPlayer > entity.chaseRadius) {
      newEntity.aiState = 'WANDER';
    } else if (entity.faction === 'HOSTILE') {
      newEntity.targetX = party.x;
      newEntity.targetY = party.y;
      return moveEntity(newEntity, dt);
    }
  }
  
  // 3. 如果正在逃跑
  if (entity.aiState === 'FLEE') {
    if (distToPlayer > entity.chaseRadius) {
      newEntity.aiState = 'WANDER';
    } else {
      const fleePos = getFleeDirection(entity, party.x, party.y);
      newEntity.targetX = fleePos.x;
      newEntity.targetY = fleePos.y;
      return moveEntity(newEntity, dt);
    }
  }
  
  // 4. 游荡行为
  newEntity.aiState = 'WANDER';
  
  const cooldown = (entity.wanderCooldown || 0) - dt;
  if (cooldown <= 0) {
    // 选择新的游荡目标（更大范围）
    const wanderTarget = getRandomPointInTerritory(entity.x, entity.y, 15);
    newEntity.targetX = wanderTarget.x;
    newEntity.targetY = wanderTarget.y;
    newEntity.wanderCooldown = 5 + Math.random() * 10; // 5-15秒后重新选择目标
  } else {
    newEntity.wanderCooldown = cooldown;
  }
  
  return moveEntity(newEntity, dt);
};

// ==================== 行为树：Boss营地 (BOSS_CAMP) ====================
/**
 * Boss营地行为特点：
 * - 完全静止，固定在据点位置不移动
 * - 不会主动追击玩家或商队
 * - 不会逃跑
 * - 玩家必须主动靠近才会触发战斗（碰撞检测由外部处理）
 */
const executeBossCampBehavior = (
  entity: WorldEntity,
  _party: Party,
  _entities: WorldEntity[],
  _tiles: WorldTile[],
  _dt: number
): WorldEntity => {
  // Boss营地完全不移动，始终停留在原地
  return {
    ...entity,
    aiState: 'IDLE',
    targetX: null,
    targetY: null,
  };
};

// ==================== 移动函数 ====================
/**
 * 根据目标位置移动实体
 */
const moveEntity = (entity: WorldEntity, dt: number): WorldEntity => {
  if (entity.targetX === null || entity.targetY === null) {
    return entity;
  }
  
  const dx = entity.targetX - entity.x;
  const dy = entity.targetY - entity.y;
  const dist = Math.hypot(dx, dy);
  
  if (dist < 0.1) {
    // 已到达目标
    return entity;
  }
  
  // 根据AI状态调整速度
  let speedMult = 1.0;
  if (entity.aiState === 'CHASE') {
    speedMult = 1.3; // 追击时加速
  } else if (entity.aiState === 'FLEE') {
    speedMult = 1.5; // 逃跑时更快
  } else if (entity.aiState === 'WANDER') {
    speedMult = 0.6; // 游荡时较慢
  }
  
  const step = entity.speed * speedMult * dt;
  const newX = entity.x + (dx / dist) * step;
  const newY = entity.y + (dy / dist) * step;
  
  return {
    ...entity,
    x: Math.max(0, Math.min(MAP_SIZE - 1, newX)),
    y: Math.max(0, Math.min(MAP_SIZE - 1, newY))
  };
};

// ==================== 主入口 ====================

/**
 * 更新世界实体的 AI 行为
 */
export const updateWorldEntityAI = (
  entity: WorldEntity,
  party: Party,
  allEntities: WorldEntity[],
  tiles: WorldTile[],
  cities: City[],
  dt: number
): WorldEntity => {
  // 如果时间步长为0或负，不更新
  if (dt <= 0) return entity;
  
  // 根据 AI 类型选择行为树
  const aiType = entity.worldAIType || (entity.type as WorldAIType);
  
  switch (aiType) {
    case 'BANDIT':
      return executeBanditBehavior(entity, party, allEntities, tiles, dt);
    case 'BEAST':
      return executeBeastBehavior(entity, party, allEntities, tiles, dt);
    case 'ARMY':
      return executeArmyBehavior(entity, party, allEntities, tiles, cities, dt);
    case 'TRADER':
      return executeTraderBehavior(entity, party, allEntities, tiles, cities, dt);
    case 'NOMAD':
      return executeNomadBehavior(entity, party, allEntities, tiles, dt);
    case 'BOSS_CAMP':
      return executeBossCampBehavior(entity, party, allEntities, tiles, dt);
    case 'CULT':
      // 邪教使用土匪行为（游荡+追击）
      return executeBanditBehavior(entity, party, allEntities, tiles, dt);
    default:
      // 默认使用土匪行为
      return executeBanditBehavior(entity, party, allEntities, tiles, dt);
  }
};

/**
 * 获取 AI 类型的中文名称
 */
export const getWorldAITypeName = (aiType: WorldAIType): string => {
  const names: Record<WorldAIType, string> = {
    'BANDIT': '匪徒',
    'BEAST': '野兽',
    'ARMY': '军队',
    'TRADER': '商队',
    'NOMAD': '游牧',
    'CULT': '邪教',
    'BOSS_CAMP': 'Boss据点'
  };
  return names[aiType] || '未知';
};

/**
 * 生成沿道路的巡逻点
 */
export const generateRoadPatrolPoints = (
  startX: number,
  startY: number,
  tiles: WorldTile[],
  pointCount: number = 4,
  searchRadius: number = 15
): { x: number; y: number }[] => {
  const points: { x: number; y: number }[] = [];
  const roadTiles: { x: number; y: number }[] = [];
  
  // 收集附近的道路格子
  for (let dy = -searchRadius; dy <= searchRadius; dy++) {
    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      const tx = Math.floor(startX) + dx;
      const ty = Math.floor(startY) + dy;
      if (isInBounds(tx, ty) && isRoad(tx, ty, tiles)) {
        roadTiles.push({ x: tx + 0.5, y: ty + 0.5 });
      }
    }
  }
  
  if (roadTiles.length === 0) {
    // 没有道路，返回起始点周围的点
    for (let i = 0; i < pointCount; i++) {
      const angle = (i / pointCount) * Math.PI * 2;
      points.push({
        x: startX + Math.cos(angle) * 5,
        y: startY + Math.sin(angle) * 5
      });
    }
    return points;
  }
  
  // 从道路格子中选择分散的巡逻点
  const step = Math.max(1, Math.floor(roadTiles.length / pointCount));
  for (let i = 0; i < pointCount && i * step < roadTiles.length; i++) {
    points.push(roadTiles[i * step]);
  }
  
  return points;
};

/**
 * 生成城市周边的巡逻点
 */
export const generateCityPatrolPoints = (
  cityX: number,
  cityY: number,
  radius: number = 6,
  pointCount: number = 4
): { x: number; y: number }[] => {
  const points: { x: number; y: number }[] = [];
  
  for (let i = 0; i < pointCount; i++) {
    const angle = (i / pointCount) * Math.PI * 2;
    points.push({
      x: Math.max(0, Math.min(MAP_SIZE - 1, cityX + Math.cos(angle) * radius)),
      y: Math.max(0, Math.min(MAP_SIZE - 1, cityY + Math.sin(angle) * radius))
    });
  }
  
  return points;
};
