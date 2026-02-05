
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { WorldTile, Party, WorldEntity } from '../types.ts';
import { MAP_SIZE, VIEWPORT_WIDTH, VISION_RADIUS } from '../constants.tsx';

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

// 绘制实体
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
  
  let baseColor = '#334155';
  let accentColor = '#475569';
  let iconColor = '#e2e8f0';
  
  if (entity.faction === 'HOSTILE') {
    baseColor = '#7f1d1d';
    accentColor = '#991b1b';
    iconColor = '#fecaca';
  } else if (entity.faction === 'NEUTRAL') {
    baseColor = '#4a5568';
    accentColor = '#718096';
    iconColor = '#e2e8f0';
  }
  
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.arc(centerX + 2, centerY + 2, radius, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = baseColor;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;
  ctx.stroke();
  
  ctx.fillStyle = iconColor;
  ctx.strokeStyle = iconColor;
  ctx.lineWidth = 1.5;
  
  const iconSize = radius * 0.5;
  
  switch (entity.type) {
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
      
    default:
      ctx.font = `bold ${tileSize * 0.35}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', centerX, centerY);
  }
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

interface WorldMapProps {
  tiles: WorldTile[];
  party: Party;
  entities: WorldEntity[];
  onSetTarget: (x: number, y: number) => void;
}

export const WorldMap: React.FC<WorldMapProps> = ({ tiles, party, entities, onSetTarget }) => {
  const [viewportWidth, setViewportWidth] = useState(VIEWPORT_WIDTH);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // 使用 ref 存储最新的 props，避免 useEffect 依赖变化导致重新创建渲染循环
  const propsRef = useRef({ tiles, party, entities, viewportWidth });
  propsRef.current = { tiles, party, entities, viewportWidth };
  
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
  const requestRef = useRef<number>(0);

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
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { viewportWidth } = propsRef.current;
    const tilesPerPixel = viewportWidth / canvas.clientWidth;
    
    cameraRef.current.x = Math.max(0, Math.min(MAP_SIZE, cameraRef.current.x - dx * tilesPerPixel));
    cameraRef.current.y = Math.max(0, Math.min(MAP_SIZE, cameraRef.current.y - dy * tilesPerPixel));
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseUp = useCallback(() => { 
    isDraggingRef.current = false; 
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (isDraggingRef.current && (Math.abs(e.clientX - dragStartRef.current.x) > 5)) return;
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
      const { tiles, party, entities, viewportWidth } = propsRef.current;

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

      // 绘制动态实体 - 加 0.5 偏移到格子中心
      for (let i = 0; i < entities.length; i++) {
        const ent = entities[i];
        const distToParty = Math.hypot(ent.x - party.x, ent.y - party.y);
        if (distToParty > VISION_RADIUS) continue;

        const pos = toScreen(ent.x + 0.5, ent.y + 0.5);
        if (pos.x < -tileSize || pos.x > rect.width + tileSize || 
            pos.y < -tileSize || pos.y > rect.height + tileSize) continue;

        drawEntityIcon(ctx, ent, pos.x - tileSize / 2, pos.y - tileSize / 2, tileSize);
      }

      // 绘制玩家 - 加 0.5 偏移到格子中心
      const pPos = toScreen(party.x + 0.5, party.y + 0.5);
      drawPlayerIcon(ctx, pPos.x, pPos.y, tileSize);

      // 目标线
      if (party.targetX !== null && party.targetY !== null) {
        // 加 0.5 偏移到格子中心
        const tPos = toScreen(party.targetX + 0.5, party.targetY + 0.5);
        
        const targetGradient = ctx.createRadialGradient(tPos.x, tPos.y, 0, tPos.x, tPos.y, tileSize * 0.6);
        targetGradient.addColorStop(0, 'rgba(239, 68, 68, 0.4)');
        targetGradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
        ctx.fillStyle = targetGradient;
        ctx.beginPath();
        ctx.arc(tPos.x, tPos.y, tileSize * 0.6, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(pPos.x, pPos.y);
        ctx.lineTo(tPos.x, tPos.y);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
        ctx.beginPath();
        ctx.arc(tPos.x, tPos.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      requestRef.current = requestAnimationFrame(render);
    };

    requestRef.current = requestAnimationFrame(render);
    
    return () => {
      isRunning = false;
      cancelAnimationFrame(requestRef.current);
    };
  }, []); // 空依赖数组 - 只初始化一次

  return (
    <div className="relative w-full h-full bg-[#0a0a0a] overflow-hidden select-none">
      <canvas 
        ref={canvasRef}
        className="w-full h-full cursor-move"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        onWheel={handleWheel}
      />
      <div className="absolute bottom-8 right-8 z-50 text-right pointer-events-none">
        <div className="text-4xl font-bold text-amber-600 font-serif tracking-widest drop-shadow-2xl"
             style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}>
            第 {Math.floor(party.day)} 天
        </div>
      </div>
      
      <div className="absolute inset-0 pointer-events-none"
           style={{
             boxShadow: 'inset 0 0 60px 20px rgba(0,0,0,0.6)',
           }} />
    </div>
  );
};
