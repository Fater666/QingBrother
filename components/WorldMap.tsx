
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { WorldTile, Party, WorldEntity, City } from '../types.ts';
import { MAP_SIZE, VIEWPORT_WIDTH, VISION_RADIUS } from '../constants';
import { getBiome, BIOME_CONFIGS } from '../services/mapGenerator.ts';
import { getAmbitionProgress, getAmbitionTypeInfo } from '../services/ambitionService.ts';

// ============================================================================
// 战场兄弟风格配色方案 - 区域特色化调色板
// ============================================================================
const TERRAIN_COLORS: Record<string, { base: string; accent: string; detail: string; highlight?: string }> = {
  // 中原沃野 - 温暖的绿色调
  PLAINS:   { base: '#4a5d23', accent: '#3d4d1c', detail: '#5a6d33', highlight: '#6a7d43' },
  // 茂密森林 - 深邃的绿色
  FOREST:   { base: '#2d3f1f', accent: '#1a2e14', detail: '#3d4f2f', highlight: '#1d3319' },
  // 巍峨山地 - 冷峻的灰褐色
  MOUNTAIN: { base: '#5a5248', accent: '#3d3832', detail: '#6a6258', highlight: '#7a7268' },
  // 繁华城邑 - 温暖的土色
  CITY:     { base: '#6b5d4d', accent: '#8b7355', detail: '#7b6d5d', highlight: '#9b8365' },
  // 官道驿路 - 淡黄土色
  ROAD:     { base: '#786c55', accent: '#5d5344', detail: '#8a7c65', highlight: '#9a8c75' },
  // 江南水乡沼泽 - 深绿与水色
  SWAMP:    { base: '#3a4f45', accent: '#2a3f35', detail: '#4a5f55', highlight: '#2d4a4a' },
  // 古老遗迹 - 斑驳的灰色
  RUINS:    { base: '#4a4a4a', accent: '#3a3a3a', detail: '#5a5a5a', highlight: '#6a5a4a' },
  // 北疆雪原 - 冷冽的白蓝色
  SNOW:     { base: '#d8e4ec', accent: '#b8c8d8', detail: '#e8f0f8', highlight: '#a8b8c8' },
  // 南疆荒漠 - 金黄沙色
  DESERT:   { base: '#c4a86a', accent: '#a48850', detail: '#d4b87a', highlight: '#e4c88a' },
};

// 地形中文名称
const TERRAIN_NAMES: Record<string, string> = {
  PLAINS: '平原',
  FOREST: '森林',
  MOUNTAIN: '山地',
  CITY: '城邑',
  ROAD: '官道',
  SWAMP: '沼泽',
  RUINS: '遗迹',
  SNOW: '雪原',
  DESERT: '荒漠',
};

// 伪随机数生成器
const seededRandom = (x: number, y: number, seed: number = 0): number => {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
  return n - Math.floor(n);
};

// 道路相邻信息
interface RoadNeighbors {
  north: boolean;
  south: boolean;
  east: boolean;
  west: boolean;
}

// 悬停信息
interface HoverInfo {
  screenX: number;
  screenY: number;
  terrainName: string;
  biomeName: string;
  entityName?: string;
  entityFaction?: string;
  cityName?: string;
  cityType?: string;
}

// ============================================================================
// 地形绘制函数 - 定义在组件外避免重复创建
// ============================================================================
const drawTerrainTile = (
  ctx: CanvasRenderingContext2D,
  tile: WorldTile,
  screenX: number,
  screenY: number,
  tileSize: number,
  roadNeighbors?: RoadNeighbors
) => {
  const colors = TERRAIN_COLORS[tile.type] || TERRAIN_COLORS.PLAINS;
  const x = tile.x, y = tile.y;
  
  // 基础色块
  ctx.fillStyle = colors.base;
  ctx.fillRect(screenX, screenY, tileSize + 1, tileSize + 1);
  
  switch (tile.type) {
    case 'PLAINS': {
      const grassCount = 3 + Math.floor(seededRandom(x, y, 1) * 4);
      ctx.fillStyle = colors.detail;
      for (let i = 0; i < grassCount; i++) {
        const gx = screenX + seededRandom(x, y, i * 2) * tileSize;
        const gy = screenY + seededRandom(x, y, i * 2 + 1) * tileSize;
        const gh = tileSize * 0.08 + seededRandom(x, y, i * 3) * tileSize * 0.06;
        ctx.fillRect(gx, gy, 2, gh);
      }
      break;
    }
    
    case 'FOREST': {
      const treeCount = 3 + Math.floor(seededRandom(x, y, 10) * 3);
      
      // 根据Y坐标判断是北方针叶林还是南方阔叶林
      const isNorthern = y < 20;  // 北疆区域
      
      for (let i = 0; i < treeCount; i++) {
        const tx = screenX + tileSize * 0.15 + seededRandom(x, y, i * 4) * tileSize * 0.7;
        const ty = screenY + tileSize * 0.35 + seededRandom(x, y, i * 4 + 1) * tileSize * 0.45;
        const treeSize = tileSize * 0.12 + seededRandom(x, y, i * 4 + 2) * tileSize * 0.1;
        
        if (isNorthern) {
          // 北方针叶林 - 三角形松树
          const treeHeight = treeSize * 2.5;
          
          // 树影
          ctx.fillStyle = '#1a2a14';
          ctx.beginPath();
          ctx.moveTo(tx + 2, ty + treeHeight + 2);
          ctx.lineTo(tx + treeSize + 2, ty + 2);
          ctx.lineTo(tx + treeSize * 2 + 2, ty + treeHeight + 2);
          ctx.closePath();
          ctx.fill();
          
          // 树冠
          ctx.fillStyle = '#2a4a2a';
          ctx.beginPath();
          ctx.moveTo(tx, ty + treeHeight);
          ctx.lineTo(tx + treeSize, ty);
          ctx.lineTo(tx + treeSize * 2, ty + treeHeight);
          ctx.closePath();
          ctx.fill();
          
          // 树干
          ctx.fillStyle = '#4a3a2a';
          ctx.fillRect(tx + treeSize * 0.7, ty + treeHeight, treeSize * 0.6, treeSize * 0.8);
        } else {
          // 南方阔叶林 - 圆形树冠
          const tr = treeSize * 1.2;
          
          // 树影
          ctx.fillStyle = colors.accent;
          ctx.beginPath();
          ctx.arc(tx + 2, ty + 2, tr, 0, Math.PI * 2);
          ctx.fill();
          
          // 树冠
          ctx.fillStyle = colors.detail;
          ctx.beginPath();
          ctx.arc(tx, ty, tr, 0, Math.PI * 2);
          ctx.fill();
          
          // 树冠高光
          ctx.fillStyle = '#4d5f3f';
          ctx.beginPath();
          ctx.arc(tx - tr * 0.3, ty - tr * 0.3, tr * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    
    case 'MOUNTAIN': {
      const peakCount = 2 + Math.floor(seededRandom(x, y, 20) * 2);
      for (let i = 0; i < peakCount; i++) {
        const px = screenX + tileSize * 0.1 + seededRandom(x, y, i * 5) * tileSize * 0.5;
        const baseY = screenY + tileSize * 0.85;
        const peakY = screenY + tileSize * 0.15 + seededRandom(x, y, i * 5 + 1) * tileSize * 0.3;
        const width = tileSize * 0.3 + seededRandom(x, y, i * 5 + 2) * tileSize * 0.25;
        
        ctx.fillStyle = colors.accent;
        ctx.beginPath();
        ctx.moveTo(px, baseY);
        ctx.lineTo(px + width / 2, peakY);
        ctx.lineTo(px + width, baseY);
        ctx.closePath();
        ctx.fill();
        
        ctx.fillStyle = colors.detail;
        ctx.beginPath();
        ctx.moveTo(px + width / 2, peakY);
        ctx.lineTo(px + width, baseY);
        ctx.lineTo(px + width * 0.7, baseY);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    
    case 'CITY': {
      ctx.strokeStyle = '#4a3a2a';
      ctx.lineWidth = 2;
      ctx.strokeRect(screenX + tileSize * 0.1, screenY + tileSize * 0.1, 
                     tileSize * 0.8, tileSize * 0.8);
      
      const buildingCount = 3 + Math.floor(seededRandom(x, y, 30) * 3);
      for (let i = 0; i < buildingCount; i++) {
        const bx = screenX + tileSize * 0.15 + seededRandom(x, y, i * 6) * tileSize * 0.55;
        const by = screenY + tileSize * 0.3 + seededRandom(x, y, i * 6 + 1) * tileSize * 0.45;
        const bw = tileSize * 0.12 + seededRandom(x, y, i * 6 + 2) * tileSize * 0.1;
        const bh = tileSize * 0.15 + seededRandom(x, y, i * 6 + 3) * tileSize * 0.15;
        
        ctx.fillStyle = colors.detail;
        ctx.fillRect(bx, by, bw, bh);
        
        ctx.fillStyle = '#5a4a3a';
        ctx.beginPath();
        ctx.moveTo(bx - 2, by);
        ctx.lineTo(bx + bw / 2, by - bh * 0.3);
        ctx.lineTo(bx + bw + 2, by);
        ctx.closePath();
        ctx.fill();
      }
      
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(screenX + tileSize * 0.4, screenY + tileSize * 0.75, 
                   tileSize * 0.2, tileSize * 0.15);
      break;
    }
    
    case 'ROAD': {
      // 先画草地背景
      ctx.fillStyle = TERRAIN_COLORS.PLAINS.base;
      ctx.fillRect(screenX, screenY, tileSize + 1, tileSize + 1);
      
      // 检查相邻道路方向
      const hasNorth = roadNeighbors?.north ?? false;
      const hasSouth = roadNeighbors?.south ?? false;
      const hasEast = roadNeighbors?.east ?? false;
      const hasWest = roadNeighbors?.west ?? false;
      
      const hasVertical = hasNorth || hasSouth;
      const hasHorizontal = hasEast || hasWest;
      
      ctx.fillStyle = colors.base;
      
      // 根据相邻道路绘制道路形状
      if (hasVertical && hasHorizontal) {
        // 十字路口
        ctx.fillRect(screenX + tileSize * 0.2, screenY, tileSize * 0.6, tileSize + 1);
        ctx.fillRect(screenX, screenY + tileSize * 0.2, tileSize + 1, tileSize * 0.6);
      } else if (hasHorizontal) {
        // 横向道路
        ctx.fillRect(screenX, screenY + tileSize * 0.2, tileSize + 1, tileSize * 0.6);
        
        // 横向车辙
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(screenX, screenY + tileSize * 0.35);
        ctx.lineTo(screenX + tileSize, screenY + tileSize * 0.35);
        ctx.moveTo(screenX, screenY + tileSize * 0.65);
        ctx.lineTo(screenX + tileSize, screenY + tileSize * 0.65);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        // 竖向道路（默认）
        ctx.fillRect(screenX + tileSize * 0.2, screenY, tileSize * 0.6, tileSize + 1);
        
        // 竖向车辙
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(screenX + tileSize * 0.35, screenY);
        ctx.lineTo(screenX + tileSize * 0.35, screenY + tileSize);
        ctx.moveTo(screenX + tileSize * 0.65, screenY);
        ctx.lineTo(screenX + tileSize * 0.65, screenY + tileSize);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      break;
    }
    
    case 'SWAMP': {
      // 水塘 - 深色水面
      const poolCount = 2 + Math.floor(seededRandom(x, y, 40) * 3);
      for (let i = 0; i < poolCount; i++) {
        const px = screenX + tileSize * 0.15 + seededRandom(x, y, i * 7) * tileSize * 0.7;
        const py = screenY + tileSize * 0.2 + seededRandom(x, y, i * 7 + 1) * tileSize * 0.6;
        const pr = tileSize * 0.08 + seededRandom(x, y, i * 7 + 2) * tileSize * 0.1;
        
        // 水塘边缘
        ctx.fillStyle = '#1a2a2a';
        ctx.beginPath();
        ctx.ellipse(px, py, pr * 1.5, pr * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // 水面反光
        ctx.fillStyle = '#3a5555';
        ctx.beginPath();
        ctx.ellipse(px - pr * 0.3, py - pr * 0.2, pr * 0.4, pr * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // 芦苇
      ctx.strokeStyle = '#5a6a4a';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 5; i++) {
        const rx = screenX + tileSize * 0.1 + seededRandom(x, y, i * 8 + 50) * tileSize * 0.8;
        const ry = screenY + tileSize * 0.75;
        const rh = tileSize * 0.25 + seededRandom(x, y, i * 8 + 52) * tileSize * 0.15;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.quadraticCurveTo(
          rx + (seededRandom(x, y, i * 8 + 51) - 0.5) * 6,
          ry - rh * 0.6,
          rx + (seededRandom(x, y, i * 8 + 53) - 0.5) * 4,
          ry - rh
        );
        ctx.stroke();
        
        // 芦苇穗
        ctx.fillStyle = '#8a7a5a';
        ctx.beginPath();
        ctx.ellipse(
          rx + (seededRandom(x, y, i * 8 + 53) - 0.5) * 4,
          ry - rh - 2,
          2, 4, 0, 0, Math.PI * 2
        );
        ctx.fill();
      }
      
      // 偶尔有雾气效果
      if (seededRandom(x, y, 45) > 0.6) {
        ctx.fillStyle = 'rgba(180, 200, 180, 0.15)';
        ctx.fillRect(screenX, screenY + tileSize * 0.3, tileSize, tileSize * 0.4);
      }
      break;
    }
    
    case 'RUINS': {
      // 草地背景
      ctx.fillStyle = '#4a5a3a';
      ctx.fillRect(screenX, screenY, tileSize + 1, tileSize + 1);
      
      // 残破的石柱和墙壁
      const stoneCount = 3 + Math.floor(seededRandom(x, y, 60) * 3);
      for (let i = 0; i < stoneCount; i++) {
        const sx = screenX + tileSize * 0.1 + seededRandom(x, y, i * 9) * tileSize * 0.7;
        const sy = screenY + tileSize * 0.3 + seededRandom(x, y, i * 9 + 1) * tileSize * 0.5;
        const sw = tileSize * 0.12 + seededRandom(x, y, i * 9 + 2) * tileSize * 0.1;
        const sh = tileSize * 0.15 + seededRandom(x, y, i * 9 + 3) * tileSize * 0.2;
        
        // 石块阴影
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(sx + 2, sy + 2, sw, sh);
        
        // 石块主体
        ctx.fillStyle = i % 2 === 0 ? '#5a5a5a' : '#6a6a5a';
        ctx.fillRect(sx, sy, sw, sh);
        
        // 石块裂纹
        ctx.strokeStyle = '#3a3a3a';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(sx + sw * 0.3, sy);
        ctx.lineTo(sx + sw * 0.5, sy + sh);
        ctx.stroke();
      }
      
      // 倒塌的柱子
      if (seededRandom(x, y, 65) > 0.5) {
        const px = screenX + tileSize * 0.2;
        const py = screenY + tileSize * 0.6;
        ctx.fillStyle = '#7a7a7a';
        ctx.beginPath();
        ctx.ellipse(px, py, tileSize * 0.2, tileSize * 0.06, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#5a5a5a';
        ctx.beginPath();
        ctx.arc(px - tileSize * 0.15, py - tileSize * 0.02, tileSize * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // 野草覆盖
      ctx.fillStyle = '#5a6a4a';
      for (let i = 0; i < 3; i++) {
        const gx = screenX + seededRandom(x, y, i * 12 + 70) * tileSize;
        const gy = screenY + tileSize * 0.7 + seededRandom(x, y, i * 12 + 71) * tileSize * 0.25;
        ctx.fillRect(gx, gy, 2, tileSize * 0.1);
      }
      break;
    }
    
    case 'SNOW': {
      // 雪堆和阴影
      const driftCount = 3 + Math.floor(seededRandom(x, y, 70) * 2);
      for (let i = 0; i < driftCount; i++) {
        const dx = screenX + seededRandom(x, y, i * 10) * tileSize * 0.8;
        const dy = screenY + tileSize * 0.4 + seededRandom(x, y, i * 10 + 1) * tileSize * 0.5;
        const dw = tileSize * 0.15 + seededRandom(x, y, i * 10 + 2) * tileSize * 0.1;
        
        // 雪堆阴影
        ctx.fillStyle = colors.accent;
        ctx.beginPath();
        ctx.ellipse(dx + 2, dy + 2, dw * 1.3, dw * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // 雪堆
        ctx.fillStyle = colors.detail;
        ctx.beginPath();
        ctx.ellipse(dx, dy, dw * 1.3, dw * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // 偶尔有枯树
      if (seededRandom(x, y, 75) > 0.7) {
        const tx = screenX + tileSize * 0.5;
        const ty = screenY + tileSize * 0.6;
        ctx.strokeStyle = '#5a4a3a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tx, ty + tileSize * 0.3);
        ctx.lineTo(tx, ty - tileSize * 0.1);
        ctx.moveTo(tx - tileSize * 0.1, ty);
        ctx.lineTo(tx + tileSize * 0.1, ty - tileSize * 0.05);
        ctx.stroke();
      }
      break;
    }
    
    case 'DESERT': {
      // 沙丘纹理
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const waveY = screenY + tileSize * 0.2 + i * tileSize * 0.22;
        const offset = seededRandom(x, y, i * 11) * tileSize * 0.15;
        ctx.beginPath();
        ctx.moveTo(screenX, waveY + offset);
        ctx.quadraticCurveTo(
          screenX + tileSize * 0.25, 
          waveY - tileSize * 0.08 + offset,
          screenX + tileSize * 0.5, 
          waveY + offset
        );
        ctx.quadraticCurveTo(
          screenX + tileSize * 0.75, 
          waveY + tileSize * 0.08 + offset,
          screenX + tileSize, 
          waveY + offset
        );
        ctx.stroke();
      }
      
      // 偶尔有仙人掌或骷髅
      if (seededRandom(x, y, 80) > 0.85) {
        const cx = screenX + tileSize * 0.3 + seededRandom(x, y, 81) * tileSize * 0.4;
        const cy = screenY + tileSize * 0.5;
        ctx.fillStyle = '#5a6a3a';
        ctx.fillRect(cx - 2, cy - tileSize * 0.15, 4, tileSize * 0.2);
        ctx.fillRect(cx - 6, cy - tileSize * 0.08, 4, tileSize * 0.1);
        ctx.fillRect(cx + 2, cy - tileSize * 0.1, 4, tileSize * 0.08);
      } else if (seededRandom(x, y, 82) > 0.9) {
        // 骷髅装饰
        const sx = screenX + tileSize * 0.5;
        const sy = screenY + tileSize * 0.6;
        ctx.fillStyle = '#e8e0d0';
        ctx.beginPath();
        ctx.arc(sx, sy, tileSize * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
  }
};

// 绘制迷雾
const drawFogTile = (
  ctx: CanvasRenderingContext2D,
  tile: WorldTile,
  screenX: number,
  screenY: number,
  tileSize: number,
  partyX: number,
  partyY: number
) => {
  const dist = Math.sqrt(Math.pow(tile.x - partyX, 2) + Math.pow(tile.y - partyY, 2));
  
  if (!tile.explored) {
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(screenX - 1, screenY - 1, tileSize + 3, tileSize + 3);
  } else if (dist > VISION_RADIUS) {
    ctx.fillStyle = 'rgba(10, 10, 10, 0.65)';
    ctx.fillRect(screenX, screenY, tileSize + 1, tileSize + 1);
  } else if (dist > VISION_RADIUS - 1.5) {
    const alpha = (dist - (VISION_RADIUS - 1.5)) / 1.5 * 0.5;
    ctx.fillStyle = `rgba(10, 10, 10, ${alpha})`;
    ctx.fillRect(screenX, screenY, tileSize + 1, tileSize + 1);
  }
};

// 绘制实体（含名称标签）
const drawEntityIcon = (
  ctx: CanvasRenderingContext2D,
  entity: WorldEntity,
  screenX: number,
  screenY: number,
  tileSize: number
) => {
  const centerX = screenX + tileSize / 2;
  const centerY = screenY + tileSize / 2;
  const radius = tileSize * 0.35;
  
  const isBoss = !!entity.isBossEntity;
  
  let baseColor = '#334155';
  let accentColor = '#475569';
  let iconColor = '#e2e8f0';
  let nameColor = '#c8d0dc';
  
  if (isBoss) {
    // Boss实体：紫金色调
    baseColor = '#4a1942';
    accentColor = '#7b2d8e';
    iconColor = '#f5d742';
    nameColor = '#f5d742';
  } else if (entity.faction === 'HOSTILE') {
    baseColor = '#7f1d1d';
    accentColor = '#991b1b';
    iconColor = '#fecaca';
    nameColor = '#fca5a5';
  } else if (entity.faction === 'NEUTRAL') {
    baseColor = '#4a5568';
    accentColor = '#718096';
    iconColor = '#e2e8f0';
    nameColor = '#cbd5e1';
  }
  
  // Boss实体：外围光环
  if (isBoss) {
    const glowGradient = ctx.createRadialGradient(centerX, centerY, radius * 0.8, centerX, centerY, radius * 1.8);
    glowGradient.addColorStop(0, 'rgba(123, 45, 142, 0.4)');
    glowGradient.addColorStop(0.5, 'rgba(245, 215, 66, 0.15)');
    glowGradient.addColorStop(1, 'rgba(245, 215, 66, 0)');
    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // 阴影
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.arc(centerX + 2, centerY + 2, radius, 0, Math.PI * 2);
  ctx.fill();
  
  // 主体圆
  ctx.fillStyle = baseColor;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();
  
  // 边框
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = isBoss ? 3 : 2;
  ctx.stroke();
  
  // Boss实体：金色内圈
  if (isBoss) {
    ctx.strokeStyle = '#f5d742';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius - 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  
  ctx.fillStyle = iconColor;
  ctx.strokeStyle = iconColor;
  ctx.lineWidth = 1.5;
  
  const iconSize = radius * 0.5;
  
  // Boss实体使用专属骷髅图标
  if (isBoss) {
    // 骷髅头 - Boss专属图标
    const skullR = iconSize * 0.7;
    // 头骨轮廓
    ctx.fillStyle = iconColor;
    ctx.beginPath();
    ctx.arc(centerX, centerY - skullR * 0.1, skullR, 0, Math.PI * 2);
    ctx.fill();
    // 眼眶
    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.arc(centerX - skullR * 0.35, centerY - skullR * 0.2, skullR * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(centerX + skullR * 0.35, centerY - skullR * 0.2, skullR * 0.25, 0, Math.PI * 2);
    ctx.fill();
    // 鼻孔
    ctx.beginPath();
    ctx.arc(centerX, centerY + skullR * 0.15, skullR * 0.12, 0, Math.PI * 2);
    ctx.fill();
    // 下颌
    ctx.fillStyle = iconColor;
    ctx.fillRect(centerX - skullR * 0.5, centerY + skullR * 0.5, skullR, skullR * 0.35);
    // 牙齿
    ctx.fillStyle = baseColor;
    for (let t = -2; t <= 2; t++) {
      ctx.fillRect(centerX + t * skullR * 0.2 - skullR * 0.06, centerY + skullR * 0.5, skullR * 0.12, skullR * 0.15);
    }
  } else switch (entity.type) {
    case 'BANDIT':
      ctx.beginPath();
      ctx.moveTo(centerX - iconSize, centerY - iconSize);
      ctx.lineTo(centerX + iconSize, centerY + iconSize);
      ctx.moveTo(centerX + iconSize, centerY - iconSize);
      ctx.lineTo(centerX - iconSize, centerY + iconSize);
      ctx.stroke();
      break;
      
    case 'TRADER':
      ctx.beginPath();
      ctx.arc(centerX, centerY, iconSize * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = baseColor;
      ctx.fillRect(centerX - iconSize * 0.3, centerY - iconSize * 0.9, iconSize * 0.6, iconSize * 0.4);
      break;
      
    case 'ARMY':
      ctx.beginPath();
      ctx.moveTo(centerX, centerY - iconSize);
      ctx.lineTo(centerX + iconSize, centerY - iconSize * 0.3);
      ctx.lineTo(centerX + iconSize * 0.7, centerY + iconSize);
      ctx.lineTo(centerX, centerY + iconSize * 0.7);
      ctx.lineTo(centerX - iconSize * 0.7, centerY + iconSize);
      ctx.lineTo(centerX - iconSize, centerY - iconSize * 0.3);
      ctx.closePath();
      ctx.fill();
      break;
      
    case 'NOMAD':
      ctx.beginPath();
      ctx.arc(centerX, centerY, iconSize * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(centerX - iconSize * 0.3, centerY - iconSize * 0.5);
      ctx.lineTo(centerX - iconSize * 0.5, centerY - iconSize);
      ctx.lineTo(centerX - iconSize * 0.1, centerY - iconSize * 0.6);
      ctx.fill();
      break;
      
    case 'BEAST':
      ctx.beginPath();
      ctx.arc(centerX, centerY + iconSize * 0.2, iconSize * 0.5, 0, Math.PI * 2);
      ctx.fill();
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.arc(centerX + i * iconSize * 0.4, centerY - iconSize * 0.5, iconSize * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
      
    case 'CULT':
      // 邪教标志：三角形（类似邪眼）
      ctx.beginPath();
      ctx.moveTo(centerX, centerY - iconSize);
      ctx.lineTo(centerX + iconSize * 0.9, centerY + iconSize * 0.7);
      ctx.lineTo(centerX - iconSize * 0.9, centerY + iconSize * 0.7);
      ctx.closePath();
      ctx.fill();
      // 中心圆点（邪眼）
      ctx.fillStyle = baseColor;
      ctx.beginPath();
      ctx.arc(centerX, centerY + iconSize * 0.1, iconSize * 0.25, 0, Math.PI * 2);
      ctx.fill();
      break;
      
    default:
      ctx.font = `bold ${tileSize * 0.35}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', centerX, centerY);
  }
  
  // ---- 名称标签 ----
  const fontSize = Math.max(9, Math.min(13, tileSize * 0.28));
  ctx.font = `bold ${fontSize}px "Noto Serif SC", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  
  const labelY = centerY + radius + 4;
  const text = entity.name;
  
  // 描边（增加可读性）
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, centerX, labelY);
  
  // 填充
  ctx.fillStyle = nameColor;
  ctx.fillText(text, centerX, labelY);
};

// 绘制城市标签
const drawCityLabel = (
  ctx: CanvasRenderingContext2D,
  city: City,
  screenX: number,
  screenY: number,
  tileSize: number
) => {
  const centerX = screenX + tileSize / 2;
  const labelY = screenY - 4;
  
  // 根据城市类型设置样式
  let fontSize: number;
  let labelColor: string;
  let prefix = '';
  
  switch (city.type) {
    case 'CAPITAL':
      fontSize = Math.max(13, Math.min(18, tileSize * 0.4));
      labelColor = '#fbbf24';  // 金色
      prefix = '★ ';
      break;
    case 'TOWN':
      fontSize = Math.max(11, Math.min(15, tileSize * 0.33));
      labelColor = '#e2c89a';  // 浅金
      break;
    case 'VILLAGE':
    default:
      fontSize = Math.max(10, Math.min(13, tileSize * 0.28));
      labelColor = '#a8b0a0';  // 灰绿
      break;
  }
  
  ctx.font = `bold ${fontSize}px "Noto Serif SC", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  
  const text = prefix + city.name;
  
  // 文字背景条
  const textWidth = ctx.measureText(text).width;
  const bgPadX = 6;
  const bgPadY = 3;
  const bgX = centerX - textWidth / 2 - bgPadX;
  const bgY = labelY - fontSize - bgPadY;
  const bgW = textWidth + bgPadX * 2;
  const bgH = fontSize + bgPadY * 2;
  
  // 圆角背景
  const bgRadius = 3;
  ctx.fillStyle = 'rgba(10, 8, 5, 0.75)';
  ctx.beginPath();
  ctx.moveTo(bgX + bgRadius, bgY);
  ctx.lineTo(bgX + bgW - bgRadius, bgY);
  ctx.quadraticCurveTo(bgX + bgW, bgY, bgX + bgW, bgY + bgRadius);
  ctx.lineTo(bgX + bgW, bgY + bgH - bgRadius);
  ctx.quadraticCurveTo(bgX + bgW, bgY + bgH, bgX + bgW - bgRadius, bgY + bgH);
  ctx.lineTo(bgX + bgRadius, bgY + bgH);
  ctx.quadraticCurveTo(bgX, bgY + bgH, bgX, bgY + bgH - bgRadius);
  ctx.lineTo(bgX, bgY + bgRadius);
  ctx.quadraticCurveTo(bgX, bgY, bgX + bgRadius, bgY);
  ctx.closePath();
  ctx.fill();
  
  // 边框
  ctx.strokeStyle = 'rgba(180, 140, 80, 0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();
  
  // 描边文字
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, centerX, labelY);
  
  // 填充文字
  ctx.fillStyle = labelColor;
  ctx.fillText(text, centerX, labelY);
};

// 绘制玩家
const drawPlayerIcon = (
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  tileSize: number
) => {
  const centerX = screenX;
  const centerY = screenY;
  const radius = tileSize * 0.45;
  
  const gradient = ctx.createRadialGradient(centerX, centerY, radius * 0.5, centerX, centerY, radius * 1.5);
  gradient.addColorStop(0, 'rgba(245, 158, 11, 0.3)');
  gradient.addColorStop(1, 'rgba(245, 158, 11, 0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * 1.5, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.arc(centerX + 2, centerY + 2, radius, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#b45309';
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 3;
  ctx.stroke();
  
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${tileSize * 0.45}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('伍', centerX, centerY);
};

// 绘制目标路径线（带箭头）
const drawTargetPath = (
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  tileSize: number
) => {
  // 目标光晕
  const targetGradient = ctx.createRadialGradient(toX, toY, 0, toX, toY, tileSize * 0.6);
  targetGradient.addColorStop(0, 'rgba(239, 68, 68, 0.35)');
  targetGradient.addColorStop(0.6, 'rgba(239, 68, 68, 0.1)');
  targetGradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
  ctx.fillStyle = targetGradient;
  ctx.beginPath();
  ctx.arc(toX, toY, tileSize * 0.6, 0, Math.PI * 2);
  ctx.fill();
  
  // 虚线路径
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.45)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // 箭头
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dist = Math.hypot(dx, dy);
  if (dist > 10) {
    const arrowSize = Math.min(10, tileSize * 0.3);
    const angle = Math.atan2(dy, dx);
    // 箭头位置在线段末端前一点
    const ax = toX - Math.cos(angle) * tileSize * 0.25;
    const ay = toY - Math.sin(angle) * tileSize * 0.25;
    
    ctx.fillStyle = 'rgba(239, 68, 68, 0.7)';
    ctx.beginPath();
    ctx.moveTo(ax + Math.cos(angle) * arrowSize, ay + Math.sin(angle) * arrowSize);
    ctx.lineTo(ax + Math.cos(angle + 2.5) * arrowSize * 0.6, ay + Math.sin(angle + 2.5) * arrowSize * 0.6);
    ctx.lineTo(ax + Math.cos(angle - 2.5) * arrowSize * 0.6, ay + Math.sin(angle - 2.5) * arrowSize * 0.6);
    ctx.closePath();
    ctx.fill();
  }
  
  // 目标点
  ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
  ctx.beginPath();
  ctx.arc(toX, toY, 4, 0, Math.PI * 2);
  ctx.fill();
  
  // 目标点外圈
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(toX, toY, 8, 0, Math.PI * 2);
  ctx.stroke();
};

// ============================================================================
// 追踪系统 - 足迹绘制（仿战场兄弟）
// ============================================================================

const TRACK_RADIUS = 18;  // 足迹可见范围（比视野大很多）

// 在目标实体附近已探索的格子上绘制足迹标记
const drawTrackMarkers = (
  ctx: CanvasRenderingContext2D,
  targetEntity: WorldEntity,
  tiles: WorldTile[],
  partyX: number,
  partyY: number,
  toScreen: (wx: number, wy: number) => { x: number; y: number },
  tileSize: number,
  rectWidth: number,
  rectHeight: number,
  animTime: number
) => {
  const tx = targetEntity.x;
  const ty = targetEntity.y;
  const distToPlayer = Math.hypot(tx - partyX, ty - partyY);
  
  // 只在视野外但追踪范围内显示足迹
  if (distToPlayer <= VISION_RADIUS || distToPlayer > TRACK_RADIUS * 1.5) return;
  
  // 在从目标向玩家方向上散布足迹点
  const dx = partyX - tx;
  const dy = partyY - ty;
  const dist = Math.hypot(dx, dy);
  const ndx = dx / dist;
  const ndy = dy / dist;
  
  // 生成足迹点：从目标位置往玩家方向排列
  const trackCount = Math.min(8, Math.floor(dist / 2));
  
  for (let i = 1; i <= trackCount; i++) {
    const t = i / (trackCount + 1);
    // 沿方向线偏移 + 小幅随机扰动
    const baseX = tx + ndx * dist * t;
    const baseY = ty + ndy * dist * t;
    // 使用确定性伪随机（根据坐标和索引）
    const offsetX = Math.sin(baseX * 12.9898 + baseY * 78.233 + i * 43.12) * 1.5;
    const offsetY = Math.cos(baseX * 78.233 + baseY * 12.9898 + i * 17.45) * 1.5;
    const fx = Math.floor(baseX + offsetX);
    const fy = Math.floor(baseY + offsetY);
    
    if (fx < 0 || fx >= MAP_SIZE || fy < 0 || fy >= MAP_SIZE) continue;
    
    const tile = tiles[fy * MAP_SIZE + fx];
    if (!tile || !tile.explored) continue;
    
    // 只在玩家追踪范围内的格子上显示
    const distFromPlayer = Math.hypot(fx - partyX, fy - partyY);
    if (distFromPlayer > TRACK_RADIUS || distFromPlayer <= VISION_RADIUS - 1) continue;
    
    const pos = toScreen(fx + 0.5, fy + 0.5);
    if (pos.x < -tileSize || pos.x > rectWidth + tileSize || 
        pos.y < -tileSize || pos.y > rectHeight + tileSize) continue;
    
    // 绘制足迹标记 - 小爪印/脚印符号
    const alpha = 0.4 + Math.sin(animTime * 2 + i * 1.5) * 0.15;
    const markerSize = tileSize * 0.15;
    
    // 方向朝向目标
    const angle = Math.atan2(ty - fy, tx - fx);
    
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);
    
    // 足迹本体 - 两个椭圆（鞋印形状）
    ctx.fillStyle = `rgba(180, 100, 50, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(-markerSize * 0.4, -markerSize * 0.3, markerSize * 0.5, markerSize * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-markerSize * 0.4, markerSize * 0.3, markerSize * 0.5, markerSize * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // 脚趾印 - 前方小点
    ctx.fillStyle = `rgba(160, 80, 40, ${alpha * 0.8})`;
    for (let j = -1; j <= 1; j++) {
      ctx.beginPath();
      ctx.arc(markerSize * 0.5, j * markerSize * 0.35, markerSize * 0.15, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  }
};

// 绘制任务目标实体的高亮光环
const drawQuestTargetGlow = (
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  tileSize: number,
  animTime: number
) => {
  const centerX = screenX + tileSize / 2;
  const centerY = screenY + tileSize / 2;
  const pulseRadius = tileSize * 0.6 + Math.sin(animTime * 3) * tileSize * 0.1;
  
  // 外层脉冲光环
  const gradient = ctx.createRadialGradient(centerX, centerY, pulseRadius * 0.3, centerX, centerY, pulseRadius);
  gradient.addColorStop(0, 'rgba(239, 68, 68, 0)');
  gradient.addColorStop(0.5, `rgba(239, 68, 68, ${0.15 + Math.sin(animTime * 3) * 0.1})`);
  gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2);
  ctx.fill();
  
  // 红色标记环
  ctx.strokeStyle = `rgba(239, 68, 68, ${0.5 + Math.sin(animTime * 4) * 0.2})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.arc(centerX, centerY, tileSize * 0.55, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // 顶部"讨伐"标记
  const labelY = centerY - tileSize * 0.65;
  const fontSize = Math.max(8, tileSize * 0.2);
  ctx.font = `bold ${fontSize}px "Noto Serif SC", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeText('⚔ 讨伐目标', centerX, labelY);
  
  ctx.fillStyle = `rgba(239, 68, 68, ${0.8 + Math.sin(animTime * 3) * 0.2})`;
  ctx.fillText('⚔ 讨伐目标', centerX, labelY);
};

// ============================================================================
// 地图边界绘制 - 显示地图范围，超界区域加遮罩
// ============================================================================
const drawMapBoundary = (
  ctx: CanvasRenderingContext2D,
  toScreen: (wx: number, wy: number) => { x: number; y: number },
  tileSize: number,
  rectWidth: number,
  rectHeight: number,
  animTime: number
) => {
  // 将地图四角转换为屏幕坐标
  const topLeft = toScreen(0, 0);
  const topRight = toScreen(MAP_SIZE, 0);
  const bottomLeft = toScreen(0, MAP_SIZE);
  const bottomRight = toScreen(MAP_SIZE, MAP_SIZE);

  // --- 超界区域半透明遮罩 ---
  ctx.save();
  ctx.fillStyle = 'rgba(5, 5, 5, 0.45)';

  // 上方遮罩（地图上边以上）
  if (topLeft.y > 0) {
    ctx.fillRect(0, 0, rectWidth, topLeft.y);
  }
  // 下方遮罩（地图下边以下）
  if (bottomLeft.y < rectHeight) {
    ctx.fillRect(0, bottomLeft.y, rectWidth, rectHeight - bottomLeft.y);
  }
  // 左方遮罩（地图左边以左，排除已绘制的上下部分）
  const maskTop = Math.max(0, topLeft.y);
  const maskBottom = Math.min(rectHeight, bottomLeft.y);
  if (topLeft.x > 0 && maskBottom > maskTop) {
    ctx.fillRect(0, maskTop, topLeft.x, maskBottom - maskTop);
  }
  // 右方遮罩（地图右边以右）
  if (topRight.x < rectWidth && maskBottom > maskTop) {
    ctx.fillRect(topRight.x, maskTop, rectWidth - topRight.x, maskBottom - maskTop);
  }
  ctx.restore();

  // --- 边界线（虚线 + 琥珀色）---
  ctx.save();
  const pulseAlpha = 0.4 + Math.sin(animTime * 1.5) * 0.15;
  ctx.strokeStyle = `rgba(180, 130, 50, ${pulseAlpha})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.rect(topLeft.x, topLeft.y, topRight.x - topLeft.x, bottomLeft.y - topLeft.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // --- 四角标记 ---
  const cornerLen = Math.max(8, tileSize * 0.8);
  ctx.strokeStyle = `rgba(200, 150, 60, ${pulseAlpha + 0.15})`;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  const corners = [
    { x: topLeft.x, y: topLeft.y, dx: 1, dy: 1 },
    { x: topRight.x, y: topRight.y, dx: -1, dy: 1 },
    { x: bottomLeft.x, y: bottomLeft.y, dx: 1, dy: -1 },
    { x: bottomRight.x, y: bottomRight.y, dx: -1, dy: -1 },
  ];
  for (const c of corners) {
    ctx.beginPath();
    ctx.moveTo(c.x + c.dx * cornerLen, c.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(c.x, c.y + c.dy * cornerLen);
    ctx.stroke();
  }
  ctx.restore();
};

// ============================================================================
// 小地图绘制
// ============================================================================
const MINIMAP_SIZE = 160;
const MINIMAP_PADDING = 2; // 内边距

const drawMinimap = (
  minimapCanvas: HTMLCanvasElement,
  tiles: WorldTile[],
  party: Party,
  entities: WorldEntity[],
  cities: City[],
  camX: number,
  camY: number,
  viewportWidth: number,
  viewportHeight: number
) => {
  const ctx = minimapCanvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const displaySize = MINIMAP_SIZE;
  if (minimapCanvas.width !== displaySize * dpr || minimapCanvas.height !== displaySize * dpr) {
    minimapCanvas.width = displaySize * dpr;
    minimapCanvas.height = displaySize * dpr;
    minimapCanvas.style.width = displaySize + 'px';
    minimapCanvas.style.height = displaySize + 'px';
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 每格在小地图上的像素大小
  const pad = MINIMAP_PADDING;
  const drawArea = displaySize - pad * 2;
  const cellSize = drawArea / MAP_SIZE;

  // 背景
  ctx.fillStyle = '#080806';
  ctx.fillRect(0, 0, displaySize, displaySize);

  // 绘制已探索地形
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const tile = tiles[y * MAP_SIZE + x];
      if (!tile || !tile.explored) continue;

      const colors = TERRAIN_COLORS[tile.type];
      if (colors) {
        ctx.fillStyle = colors.base;
      } else {
        ctx.fillStyle = '#333';
      }
      ctx.fillRect(
        pad + x * cellSize,
        pad + y * cellSize,
        Math.ceil(cellSize),
        Math.ceil(cellSize)
      );
    }
  }

  // 绘制已探索城市标记
  for (const city of cities) {
    const cityTile = tiles[city.y * MAP_SIZE + city.x];
    if (!cityTile || !cityTile.explored) continue;

    const cx = pad + (city.x + 0.5) * cellSize;
    const cy = pad + (city.y + 0.5) * cellSize;
    const r = Math.max(2.5, cellSize * 1.2);

    // 城市光晕
    ctx.fillStyle = 'rgba(200, 170, 100, 0.4)';
    ctx.beginPath();
    ctx.arc(cx, cy, r + 1.5, 0, Math.PI * 2);
    ctx.fill();

    // 城市点
    ctx.fillStyle = '#d4a855';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 绘制视野范围内可见的敌方实体
  for (const ent of entities) {
    const distToParty = Math.hypot(ent.x - party.x, ent.y - party.y);
    if (distToParty > VISION_RADIUS) continue;

    const ex = pad + (ent.x + 0.5) * cellSize;
    const ey = pad + (ent.y + 0.5) * cellSize;

    if (ent.isBossEntity) {
      // Boss实体：紫金色，更大
      ctx.fillStyle = '#c084fc';
      ctx.beginPath();
      ctx.arc(ex, ey, Math.max(2.5, cellSize * 0.9), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f5d742';
      ctx.beginPath();
      ctx.arc(ex, ey, Math.max(1.5, cellSize * 0.5), 0, Math.PI * 2);
      ctx.fill();
    } else if (ent.faction === 'HOSTILE') {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(ex, ey, Math.max(1.5, cellSize * 0.6), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.arc(ex, ey, Math.max(1.5, cellSize * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 绘制视野框（当前 viewport 范围）
  const vpX = pad + (camX - viewportWidth / 2) * cellSize;
  const vpY = pad + (camY - viewportHeight / 2) * cellSize;
  const vpW = viewportWidth * cellSize;
  const vpH = viewportHeight * cellSize;

  ctx.strokeStyle = 'rgba(200, 160, 60, 0.7)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(vpX, vpY, vpW, vpH);

  // 绘制玩家位置标记（最后绘制，保证在最上层）
  const px = pad + (party.x + 0.5) * cellSize;
  const py = pad + (party.y + 0.5) * cellSize;
  const pr = Math.max(2.5, cellSize * 1.0);

  // 玩家光晕
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.beginPath();
  ctx.arc(px, py, pr + 2, 0, Math.PI * 2);
  ctx.fill();

  // 玩家点
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(px, py, pr, 0, Math.PI * 2);
  ctx.fill();

  // 外框
  ctx.strokeStyle = 'rgba(139, 90, 43, 0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, displaySize - 1, displaySize - 1);
};

interface WorldMapProps {
  tiles: WorldTile[];
  party: Party;
  entities: WorldEntity[];
  cities: City[];
  onSetTarget: (x: number, y: number) => void;
}

export const WorldMap: React.FC<WorldMapProps> = ({ tiles, party, entities, cities, onSetTarget }) => {
  const [viewportWidth, setViewportWidth] = useState(VIEWPORT_WIDTH);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
  const minimapFrameCounter = useRef(0);
  
  // 使用 ref 存储最新的 props，避免 useEffect 依赖变化导致重新创建渲染循环
  const propsRef = useRef({ tiles, party, entities, cities, viewportWidth });
  propsRef.current = { tiles, party, entities, cities, viewportWidth };
  
  // 离屏Canvas缓存
  const terrainCacheRef = useRef<HTMLCanvasElement | null>(null);
  
  // 缓存状态
  const cacheStateRef = useRef({
    startX: -Infinity,
    startY: -Infinity,
    viewportWidth: -1,
    cacheWidth: 0,
    cacheHeight: 0,
  });
  
  // Camera State
  const cameraRef = useRef({ x: party.x, y: party.y });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragDistRef = useRef(0);
  const requestRef = useRef<number>(0);
  const mouseScreenRef = useRef({ x: 0, y: 0 });
  const animTimeRef = useRef(0);

  // Sync camera with party when not dragging
  useEffect(() => {
    if (!isDraggingRef.current) {
      cameraRef.current = { x: party.x, y: party.y };
    }
  }, [party.x, party.y]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    const delta = Math.sign(e.deltaY) * 2;
    setViewportWidth(prev => Math.max(10, Math.min(MAP_SIZE, prev + delta)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    dragDistRef.current = 0;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const canvasRect = canvas.getBoundingClientRect();
    mouseScreenRef.current = { x: e.clientX - canvasRect.left, y: e.clientY - canvasRect.top };
    
    if (isDraggingRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      dragDistRef.current += Math.abs(dx) + Math.abs(dy);
      
      const { viewportWidth } = propsRef.current;
      const tilesPerPixel = viewportWidth / canvas.clientWidth;
      
      cameraRef.current.x = Math.max(0, Math.min(MAP_SIZE, cameraRef.current.x - dx * tilesPerPixel));
      cameraRef.current.y = Math.max(0, Math.min(MAP_SIZE, cameraRef.current.y - dy * tilesPerPixel));
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    }
    
    // 计算悬停的世界坐标
    const { viewportWidth: vw, tiles: t, entities: ents, cities: cts } = propsRef.current;
    const aspectRatio = canvas.clientWidth / canvas.clientHeight;
    const viewportHeight = vw / aspectRatio;
    const tileSize = canvas.clientWidth / vw;
    
    const camX = cameraRef.current.x;
    const camY = cameraRef.current.y;
    
    const worldX = mouseScreenRef.current.x / tileSize + (camX - vw / 2);
    const worldY = mouseScreenRef.current.y / tileSize + (camY - viewportHeight / 2);
    const tileX = Math.floor(worldX);
    const tileY = Math.floor(worldY);
    
    if (tileX >= 0 && tileX < MAP_SIZE && tileY >= 0 && tileY < MAP_SIZE) {
      const tile = t[tileY * MAP_SIZE + tileX];
      if (tile && tile.explored) {
        const biome = getBiome(tileY, MAP_SIZE);
        const biomeName = BIOME_CONFIGS[biome].name;
        const terrainName = TERRAIN_NAMES[tile.type] || tile.type;
        
        // 检测实体
        let entityName: string | undefined;
        let entityFaction: string | undefined;
        for (const ent of ents) {
          if (Math.floor(ent.x) === tileX && Math.floor(ent.y) === tileY) {
            entityName = ent.name;
            entityFaction = ent.faction === 'HOSTILE' ? '敌对' : ent.faction === 'NEUTRAL' ? '中立' : '友军';
            break;
          }
        }
        
        // 检测城市
        let cityName: string | undefined;
        let cityType: string | undefined;
        for (const c of cts) {
          if (c.x === tileX && c.y === tileY) {
            cityName = c.name;
            cityType = c.type === 'CAPITAL' ? '王都' : c.type === 'TOWN' ? '城镇' : '村落';
            break;
          }
        }
        
        setHoverInfo({
          screenX: e.clientX,
          screenY: e.clientY,
          terrainName,
          biomeName,
          entityName,
          entityFaction,
          cityName,
          cityType,
        });
      } else {
        setHoverInfo(null);
      }
    } else {
      setHoverInfo(null);
    }
  }, []);

  const handleMouseUp = useCallback(() => { 
    isDraggingRef.current = false; 
  }, []);
  
  const handleMouseLeave = useCallback(() => {
    isDraggingRef.current = false;
    setHoverInfo(null);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (dragDistRef.current > 5) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const { viewportWidth } = propsRef.current;
    const aspectRatio = canvas.clientWidth / canvas.clientHeight;
    const viewportHeight = viewportWidth / aspectRatio;
    const tileSize = canvas.clientWidth / viewportWidth;
    
    const worldX = (clickX / tileSize) + (cameraRef.current.x - viewportWidth / 2);
    const worldY = (clickY / tileSize) + (cameraRef.current.y - viewportHeight / 2);

    onSetTarget(Math.floor(worldX), Math.floor(worldY));
  }, [onSetTarget]);

  // ============================================================================
  // 主渲染循环 - 只初始化一次，通过 ref 读取最新数据
  // ============================================================================
  useEffect(() => {
    let isRunning = true;
    
    const render = () => {
      if (!isRunning) return;
      
      const canvas = canvasRef.current;
      if (!canvas) {
        requestRef.current = requestAnimationFrame(render);
        return;
      }
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        requestRef.current = requestAnimationFrame(render);
        return;
      }

      // 从 ref 读取最新的 props
      const { tiles, party, entities, cities, viewportWidth } = propsRef.current;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const canvasWidth = Math.floor(rect.width * dpr);
      const canvasHeight = Math.floor(rect.height * dpr);
      
      // 只在尺寸变化时重设Canvas大小
      if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        // 尺寸变化时清除缓存
        cacheStateRef.current.viewportWidth = -1;
      }
      
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const aspectRatio = rect.width / rect.height;
      const viewportHeight = viewportWidth / aspectRatio;
      const tileSize = rect.width / viewportWidth;

      const camX = cameraRef.current.x;
      const camY = cameraRef.current.y;
      
      // 计算可视区域（扩大边界以便缓存）
      const startX = Math.floor(camX - viewportWidth / 2) - 1;
      const startY = Math.floor(camY - viewportHeight / 2) - 1;
      const endX = startX + Math.ceil(viewportWidth) + 3;
      const endY = startY + Math.ceil(viewportHeight) + 3;

      // 检查是否需要重建地形缓存（只在整数格子变化时重建）
      const cache = cacheStateRef.current;
      const needsTerrainRebuild = 
        cache.startX !== startX ||
        cache.startY !== startY ||
        cache.viewportWidth !== viewportWidth ||
        cache.cacheWidth !== canvasWidth ||
        cache.cacheHeight !== canvasHeight;

      if (needsTerrainRebuild) {
        // 初始化或重建离屏Canvas
        if (!terrainCacheRef.current) {
          terrainCacheRef.current = document.createElement('canvas');
        }
        const terrainCache = terrainCacheRef.current;
        terrainCache.width = canvasWidth;
        terrainCache.height = canvasHeight;
        
        const tctx = terrainCache.getContext('2d');
        if (tctx) {
          tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          tctx.fillStyle = '#0a0a0a';
          tctx.fillRect(0, 0, rect.width, rect.height);
          
          // 辅助函数：检查某个位置是否是道路或城市
          const isRoadOrCity = (tx: number, ty: number): boolean => {
            if (tx < 0 || tx >= MAP_SIZE || ty < 0 || ty >= MAP_SIZE) return false;
            const t = tiles[ty * MAP_SIZE + tx];
            return t && (t.type === 'ROAD' || t.type === 'CITY');
          };
          
          // 绘制地形到缓存
          for (let y = startY; y <= endY; y++) {
            for (let x = startX; x <= endX; x++) {
              if (x < 0 || x >= MAP_SIZE || y < 0 || y >= MAP_SIZE) continue;
              
              const tile = tiles[y * MAP_SIZE + x];
              if (!tile) continue;
              
              const screenX = (x - startX) * tileSize;
              const screenY = (y - startY) * tileSize;
              
              // 如果是道路，计算相邻道路信息
              let roadNeighbors: RoadNeighbors | undefined;
              if (tile.type === 'ROAD') {
                roadNeighbors = {
                  north: isRoadOrCity(x, y - 1),
                  south: isRoadOrCity(x, y + 1),
                  east: isRoadOrCity(x + 1, y),
                  west: isRoadOrCity(x - 1, y)
                };
              }
              
              drawTerrainTile(tctx, tile, screenX, screenY, tileSize, roadNeighbors);
            }
          }
        }
        
        cache.startX = startX;
        cache.startY = startY;
        cache.viewportWidth = viewportWidth;
        cache.cacheWidth = canvasWidth;
        cache.cacheHeight = canvasHeight;
      }

      // 清空主Canvas
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, rect.width, rect.height);
      
      // 绘制地形缓存（带偏移以实现平滑滚动）
      if (terrainCacheRef.current) {
        const offsetX = -((camX - viewportWidth / 2) - startX) * tileSize;
        const offsetY = -((camY - viewportHeight / 2) - startY) * tileSize;
        ctx.drawImage(terrainCacheRef.current, offsetX, offsetY, rect.width, rect.height);
      }

      // 绘制迷雾层（每帧重绘，因为与玩家位置相关）
      for (let y = startY; y <= endY; y++) {
        for (let x = startX; x <= endX; x++) {
          if (x < 0 || x >= MAP_SIZE || y < 0 || y >= MAP_SIZE) continue;
          
          const tile = tiles[y * MAP_SIZE + x];
          if (!tile) continue;
          
          const screenX = (x - (camX - viewportWidth / 2)) * tileSize;
          const screenY = (y - (camY - viewportHeight / 2)) * tileSize;
          
          drawFogTile(ctx, tile, screenX, screenY, tileSize, party.x, party.y);
        }
      }

      // 坐标转换函数
      const toScreen = (wx: number, wy: number) => ({
        x: (wx - (camX - viewportWidth / 2)) * tileSize,
        y: (wy - (camY - viewportHeight / 2)) * tileSize
      });

      // ===== 地图边界线与超界遮罩 =====
      drawMapBoundary(ctx, toScreen, tileSize, rect.width, rect.height, animTimeRef.current);

      // 绘制城市名称标签（在迷雾之后、实体之前）
      for (const city of cities) {
        // 只显示已探索的城市
        const cityTile = tiles[city.y * MAP_SIZE + city.x];
        if (!cityTile || !cityTile.explored) continue;
        
        const pos = toScreen(city.x + 0.5, city.y + 0.5);
        if (pos.x < -tileSize * 2 || pos.x > rect.width + tileSize * 2 || 
            pos.y < -tileSize * 2 || pos.y > rect.height + tileSize * 2) continue;
        
        drawCityLabel(ctx, city, pos.x - tileSize / 2, pos.y - tileSize / 2, tileSize);
      }

      // ===== 追踪系统：足迹标记 =====
      animTimeRef.current += 0.016; // ~60fps
      const animTime = animTimeRef.current;
      
      // 查找任务目标实体
      let questTargetEntity: WorldEntity | null = null;
      if (party.activeQuest && party.activeQuest.type === 'HUNT' && party.activeQuest.targetEntityId) {
        questTargetEntity = entities.find(e => e.id === party.activeQuest!.targetEntityId) || null;
      }
      // 如果通过ID没找到，尝试通过名称匹配最近的
      if (!questTargetEntity && party.activeQuest && party.activeQuest.type === 'HUNT' && party.activeQuest.targetEntityName) {
        let bestDist = Infinity;
        for (const ent of entities) {
          if (ent.faction !== 'HOSTILE' || ent.name !== party.activeQuest.targetEntityName) continue;
          const d = Math.hypot(ent.x - party.x, ent.y - party.y);
          if (d < bestDist) { bestDist = d; questTargetEntity = ent; }
        }
      }
      
      // 绘制足迹追踪标记
      if (questTargetEntity) {
        drawTrackMarkers(ctx, questTargetEntity, tiles, party.x, party.y, toScreen, tileSize, rect.width, rect.height, animTime);
      }

      // 绘制动态实体（含名称标签） - 加 0.5 偏移到格子中心
      for (let i = 0; i < entities.length; i++) {
        const ent = entities[i];
        const distToParty = Math.hypot(ent.x - party.x, ent.y - party.y);
        if (distToParty > VISION_RADIUS) continue;

        const pos = toScreen(ent.x + 0.5, ent.y + 0.5);
        if (pos.x < -tileSize || pos.x > rect.width + tileSize || 
            pos.y < -tileSize || pos.y > rect.height + tileSize) continue;

        // 如果是任务目标，先绘制高亮光环
        if (questTargetEntity && ent.id === questTargetEntity.id) {
          drawQuestTargetGlow(ctx, pos.x - tileSize / 2, pos.y - tileSize / 2, tileSize, animTime);
        }
        
        drawEntityIcon(ctx, ent, pos.x - tileSize / 2, pos.y - tileSize / 2, tileSize);
      }

      // 绘制玩家 - 加 0.5 偏移到格子中心
      const pPos = toScreen(party.x + 0.5, party.y + 0.5);
      drawPlayerIcon(ctx, pPos.x, pPos.y, tileSize);

      // 目标路径线（带箭头）
      if (party.targetX !== null && party.targetY !== null) {
        const tPos = toScreen(party.targetX + 0.5, party.targetY + 0.5);
        drawTargetPath(ctx, pPos.x, pPos.y, tPos.x, tPos.y, tileSize);
      }

      // ===== 小地图（每 6 帧刷新一次，降低开销） =====
      minimapFrameCounter.current++;
      if (minimapCanvasRef.current && minimapFrameCounter.current % 6 === 0) {
        drawMinimap(
          minimapCanvasRef.current,
          tiles, party, entities, cities,
          camX, camY,
          viewportWidth, viewportHeight
        );
      }

      requestRef.current = requestAnimationFrame(render);
    };

    requestRef.current = requestAnimationFrame(render);
    
    return () => {
      isRunning = false;
      cancelAnimationFrame(requestRef.current);
    };
  }, []); // 空依赖数组 - 只初始化一次

  // 获取玩家当前位置信息
  const playerTileX = Math.floor(party.x);
  const playerTileY = Math.floor(party.y);
  const playerTile = (playerTileX >= 0 && playerTileX < MAP_SIZE && playerTileY >= 0 && playerTileY < MAP_SIZE)
    ? tiles[playerTileY * MAP_SIZE + playerTileX]
    : null;
  const playerBiome = getBiome(playerTileY, MAP_SIZE);
  const playerBiomeName = BIOME_CONFIGS[playerBiome].name;
  const playerTerrainName = playerTile ? (TERRAIN_NAMES[playerTile.type] || playerTile.type) : '未知';
  
  // 缩放等级
  const zoomPercent = Math.round((1 - (viewportWidth - 10) / (MAP_SIZE - 10)) * 100);

  // 查找任务目标实体（用于HUD显示）
  const questTarget = (() => {
    if (!party.activeQuest || party.activeQuest.type !== 'HUNT') return null;
    const quest = party.activeQuest;
    // 尝试通过ID找
    if (quest.targetEntityId) {
      const ent = entities.find(e => e.id === quest.targetEntityId);
      if (ent) return ent;
    }
    // 尝试通过名称匹配最近
    if (quest.targetEntityName) {
      let best: WorldEntity | null = null;
      let bestDist = Infinity;
      for (const ent of entities) {
        if (ent.faction !== 'HOSTILE' || ent.name !== quest.targetEntityName) continue;
        const d = Math.hypot(ent.x - party.x, ent.y - party.y);
        if (d < bestDist) { bestDist = d; best = ent; }
      }
      return best;
    }
    return null;
  })();

  const questTargetDist = questTarget ? Math.hypot(questTarget.x - party.x, questTarget.y - party.y) : null;
  const questTargetAngle = questTarget ? Math.atan2(questTarget.y - party.y, questTarget.x - party.x) : null;
  
  // 方向文字
  const getDirectionText = (angle: number): string => {
    const deg = ((angle * 180 / Math.PI) + 360) % 360;
    if (deg >= 337.5 || deg < 22.5) return '东';
    if (deg >= 22.5 && deg < 67.5) return '东南';
    if (deg >= 67.5 && deg < 112.5) return '南';
    if (deg >= 112.5 && deg < 157.5) return '西南';
    if (deg >= 157.5 && deg < 202.5) return '西';
    if (deg >= 202.5 && deg < 247.5) return '西北';
    if (deg >= 247.5 && deg < 292.5) return '北';
    return '东北';
  };

  // 距离描述
  const getDistanceText = (dist: number): string => {
    if (dist <= VISION_RADIUS) return '已发现目标！';
    if (dist <= 10) return '足迹清晰 · 近在咫尺';
    if (dist <= TRACK_RADIUS) return '足迹可见 · 尚有距离';
    return '足迹模糊 · 距离较远';
  };

  return (
    <div className="relative w-full h-full bg-[#0a0a0a] overflow-hidden select-none">
      <canvas 
        ref={canvasRef}
        className="w-full h-full cursor-move"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onWheel={handleWheel}
      />
      
      {/* ===== 悬停提示框 (Tooltip) ===== */}
      {hoverInfo && !isDraggingRef.current && (
        <div 
          className="fixed z-[200] pointer-events-none"
          style={{ 
            left: hoverInfo.screenX + 16, 
            top: hoverInfo.screenY - 10,
          }}
        >
          <div className="bg-[#0f0d0a]/90 border border-amber-900/50 rounded px-3 py-2 shadow-xl backdrop-blur-sm min-w-[120px]">
            {/* 城市名 */}
            {hoverInfo.cityName && (
              <div className="text-amber-400 font-bold text-sm mb-1 tracking-wide">
                {hoverInfo.cityName}
                <span className="text-amber-600 text-[10px] ml-1.5 font-normal">({hoverInfo.cityType})</span>
              </div>
            )}
            {/* 实体名 */}
            {hoverInfo.entityName && (
              <div className="text-red-400 font-bold text-sm mb-1">
                {hoverInfo.entityName}
                <span className="text-red-600/70 text-[10px] ml-1.5 font-normal">[{hoverInfo.entityFaction}]</span>
              </div>
            )}
            {/* 地形 + 区域 */}
            <div className="text-slate-400 text-xs">
              <span className="text-slate-300">{hoverInfo.biomeName}</span>
              <span className="text-slate-600 mx-1">·</span>
              <span>{hoverInfo.terrainName}</span>
            </div>
          </div>
        </div>
      )}
      
      {/* 左上角资源面板已移至顶部导航栏统一显示 */}

      {/* ===== 当前任务面板 (Quest HUD) ===== */}
      {party.activeQuest && (
        <div className="absolute top-4 right-4 z-50 pointer-events-none">
          <div className={`bg-[#0f0d0a]/85 border backdrop-blur-sm shadow-xl min-w-[220px] max-w-[280px] ${
            party.activeQuest.isCompleted ? 'border-emerald-700/60' : 'border-amber-900/50'
          }`}>
            <div className={`px-3 py-1.5 border-b flex items-center gap-2 ${
              party.activeQuest.isCompleted 
                ? 'bg-emerald-900/20 border-emerald-900/30' 
                : 'bg-amber-900/20 border-amber-900/30'
            }`}>
              <span className={`text-[9px] uppercase tracking-[0.2em] font-bold ${
                party.activeQuest.isCompleted ? 'text-emerald-500' : 'text-amber-700'
              }`}>
                {party.activeQuest.isCompleted ? '契约完成 - 返回交付' : '当前契约'}
              </span>
            </div>
            <div className="px-3 py-2 space-y-1.5">
              <div className={`text-sm font-bold tracking-wider ${
                party.activeQuest.isCompleted ? 'text-emerald-400' : 'text-amber-400'
              }`}>{party.activeQuest.title}</div>
              
              {/* 已完成：显示返回城市提示 */}
              {party.activeQuest.isCompleted && (
                <div className="mt-1.5 pt-1.5 border-t border-emerald-900/30 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-emerald-500 text-xs">&#10003;</span>
                    <span className="text-[10px] text-emerald-400 font-bold">目标已消灭</span>
                  </div>
                  <div className="text-[10px] text-slate-400 italic">
                    返回接取契约的城市交付以领取报酬
                  </div>
                </div>
              )}

              {/* 未完成：显示讨伐目标和追踪信息 */}
              {!party.activeQuest.isCompleted && party.activeQuest.type === 'HUNT' && party.activeQuest.targetEntityName && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-red-700 uppercase tracking-widest">讨伐</span>
                  <span className="text-red-400 text-xs font-bold">「{party.activeQuest.targetEntityName}」</span>
                </div>
              )}
              
              {/* 追踪信息（仅未完成时显示） */}
              {!party.activeQuest.isCompleted && party.activeQuest.type === 'HUNT' && questTarget && questTargetDist !== null && questTargetAngle !== null && (
                <div className="mt-1.5 pt-1.5 border-t border-amber-900/20 space-y-1">
                  {/* 方向指示 */}
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 flex items-center justify-center">
                      <svg width="20" height="20" viewBox="0 0 20 20" className="drop-shadow-sm">
                        <g transform={`rotate(${(questTargetAngle * 180 / Math.PI) - 90}, 10, 10)`}>
                          <polygon 
                            points="10,2 14,14 10,11 6,14" 
                            fill={questTargetDist <= VISION_RADIUS ? '#ef4444' : '#b45309'} 
                            opacity={0.9} 
                          />
                        </g>
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="text-[10px] text-slate-400">
                        方向 <span className="text-amber-500 font-bold">{getDirectionText(questTargetAngle)}</span>
                        <span className="text-slate-600 ml-1.5">约 {Math.round(questTargetDist)} 格</span>
                      </div>
                    </div>
                  </div>
                  {/* 足迹状态 */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px]">
                      {questTargetDist <= VISION_RADIUS ? '👁' : questTargetDist <= TRACK_RADIUS ? '👣' : '❓'}
                    </span>
                    <span className={`text-[10px] ${
                      questTargetDist <= VISION_RADIUS 
                        ? 'text-red-400 font-bold' 
                        : questTargetDist <= TRACK_RADIUS 
                          ? 'text-amber-500' 
                          : 'text-slate-500'
                    }`}>
                      {getDistanceText(questTargetDist)}
                    </span>
                  </div>
                </div>
              )}
              
              {/* 目标不存在 - 可能已被消灭或找不到（仅未完成时显示） */}
              {!party.activeQuest.isCompleted && party.activeQuest.type === 'HUNT' && !questTarget && party.activeQuest.targetEntityName && (
                <div className="mt-1.5 pt-1.5 border-t border-amber-900/20">
                  <span className="text-[10px] text-slate-600 italic">目标已不在此地…</span>
                </div>
              )}
              
              <div className="flex items-center justify-between text-[10px] pt-1">
                <span className="text-amber-600 font-mono">{party.activeQuest.rewardGold} 金</span>
                {!party.activeQuest.isCompleted && (
                  <span className="text-slate-600">剩余 {party.activeQuest.daysLeft} 天</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== 当前野心进度面板 (Ambition HUD) ===== */}
      {party.ambitionState.currentAmbition && (
        <div className={`absolute ${party.activeQuest ? 'top-[200px]' : 'top-4'} right-4 z-50 pointer-events-none`}>
          <div className="bg-[#0f0d0a]/85 border border-amber-900/40 backdrop-blur-sm shadow-xl min-w-[200px] max-w-[250px]">
            <div className="px-3 py-1 bg-amber-900/15 border-b border-amber-900/25 flex items-center gap-2">
              <span className="text-[9px] text-amber-700/80 uppercase tracking-[0.2em]">志向</span>
              {party.reputation > 0 && (
                <span className="text-[9px] text-yellow-700 ml-auto font-mono">声望 {party.reputation}</span>
              )}
            </div>
            <div className="px-3 py-2 space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm">{getAmbitionTypeInfo(party.ambitionState.currentAmbition.type).icon}</span>
                <span className="text-xs font-bold text-amber-300 tracking-wider">
                  {party.ambitionState.currentAmbition.name}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                {party.ambitionState.currentAmbition.description}
              </p>
              {(() => {
                const progress = getAmbitionProgress(party);
                return progress ? (
                  <div className="flex items-center gap-2 pt-1 border-t border-amber-900/15">
                    <span className="text-[9px] text-amber-700/70">进度</span>
                    <span className="text-[10px] text-amber-500 font-mono font-bold">{progress}</span>
                  </div>
                ) : null;
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ===== 底部信息栏 (Bottom HUD) ===== */}
      <div className="absolute bottom-0 left-0 right-0 z-50 pointer-events-none">
        <div className="bg-gradient-to-t from-black/80 via-black/50 to-transparent pt-10 pb-0">
          <div className="flex items-end justify-between px-5 pb-3">
            {/* 左侧：位置信息 */}
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-0.5">
                <div className="text-[10px] text-slate-600 tracking-widest uppercase">位置</div>
                <div className="text-xs font-mono text-slate-400">
                  <span className="text-amber-600/80">{playerBiomeName}</span>
                  <span className="text-slate-700 mx-1.5">|</span>
                  <span>{playerTerrainName}</span>
                  <span className="text-slate-700 mx-1.5">|</span>
                  <span className="text-slate-500">({playerTileX}, {playerTileY})</span>
                </div>
              </div>
            </div>
            
            {/* 中间：天数 + 资源 */}
            <div className="flex flex-col items-center gap-1">
              <div className="text-3xl font-bold text-amber-600 font-serif tracking-widest"
                   style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}>
                第 {Math.floor(party.day)} 天
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="font-mono">
                  <span className="text-amber-500 font-bold">{party.gold}</span>
                  <span className="text-amber-800 ml-0.5">金</span>
                </span>
                <span className="text-slate-700">|</span>
                <span className="font-mono">
                  <span className={`font-bold ${party.food <= party.mercenaries.length * 2 ? 'text-red-500' : 'text-emerald-500'}`}>{party.food}</span>
                  <span className={`ml-0.5 ${party.food <= party.mercenaries.length * 2 ? 'text-red-800' : 'text-emerald-800'}`}>粮</span>
                </span>
                <span className="text-slate-700">|</span>
                <span className="font-mono">
                  <span className="text-slate-400">{party.mercenaries.length}</span>
                  <span className="text-slate-600 ml-0.5">人</span>
                </span>
              </div>
            </div>
            
            {/* 右侧：缩放 */}
            <div className="flex flex-col items-end gap-0.5">
              <div className="text-[10px] text-slate-600 tracking-widest uppercase">视野</div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  {[10, 20, 35, 50, 64].map((level, i) => (
                    <div 
                      key={i}
                      className={`h-1.5 rounded-full transition-all ${
                        viewportWidth <= level 
                          ? 'bg-amber-600 w-3' 
                          : 'bg-slate-800 w-2'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-xs text-slate-500 font-mono ml-1">{zoomPercent}%</span>
              </div>
            </div>
          </div>
          
          {/* 底部装饰线 */}
          <div className="h-px bg-gradient-to-r from-transparent via-amber-900/30 to-transparent" />
        </div>
      </div>
      
      {/* ===== 小地图 (Minimap) ===== */}
      <div className="absolute bottom-14 left-4 z-50 pointer-events-none"
           style={{ 
             width: MINIMAP_SIZE, 
             height: MINIMAP_SIZE,
             opacity: 0.9,
           }}>
        <canvas 
          ref={minimapCanvasRef}
          style={{ width: MINIMAP_SIZE, height: MINIMAP_SIZE, display: 'block' }}
        />
      </div>

      {/* ===== Vignette 边缘效果（改进版） ===== */}
      <div className="absolute inset-0 pointer-events-none"
           style={{
             boxShadow: 'inset 0 0 80px 30px rgba(0,0,0,0.7), inset 0 -40px 60px -20px rgba(0,0,0,0.5)',
           }} />
      {/* 顶部画卷边缘 */}
      <div className="absolute top-0 left-0 right-0 h-8 pointer-events-none"
           style={{
             background: 'linear-gradient(to bottom, rgba(10,8,5,0.6) 0%, transparent 100%)',
           }} />
    </div>
  );
};
