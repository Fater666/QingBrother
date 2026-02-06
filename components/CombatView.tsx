import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { CombatState, CombatUnit, Ability, Item, MoraleStatus } from '../types.ts';
import { getHexNeighbors, getHexDistance, getUnitAbilities, ABILITIES, BACKGROUNDS, isInEnemyZoC, getAllEnemyZoCHexes } from '../constants';
import { Portrait } from './Portrait.tsx';
import { executeAITurn, AIAction } from '../services/combatAI.ts';
import {
  handleAllyDeath,
  handleHeavyDamage,
  handleEnemyKilled,
  handleTurnStartRecovery,
  applyMoraleResults,
  getMoraleEffects,
  getMoraleDisplayText,
  checkTeamRouted,
  getFleeTargetPosition,
  shouldSkipAction,
  MORALE_ICONS,
  MORALE_COLORS,
  MoraleCheckResult
} from '../services/moraleService.ts';
import {
  checkZoCOnMove,
  processZoCAttacks,
  getFreeAttackLogText,
  FreeAttackResult
} from '../services/zocService.ts';

interface CombatViewProps {
  initialState: CombatState;
  onCombatEnd: (victory: boolean, survivors: CombatUnit[], enemyUnits: CombatUnit[], rounds: number) => void;
}

type FloatingTextType = 'damage' | 'heal' | 'miss' | 'critical' | 'morale' | 'block' | 'intercept';

interface FloatingText {
    id: number;
    text: string;
    x: number;
    y: number;
    color: string;
    type: FloatingTextType;
    size?: 'sm' | 'md' | 'lg';
}

type CombatLogType = 'attack' | 'move' | 'morale' | 'kill' | 'skill' | 'intercept' | 'info' | 'flee';

interface CombatLogEntry {
    id: number;
    text: string;
    type: CombatLogType;
    timestamp: number;
}

interface CenterBanner {
    id: number;
    text: string;
    color: string;
    icon: string;
}

interface AttackLineEffect {
    fromQ: number;
    fromR: number;
    toQ: number;
    toR: number;
    startTime: number;
    color: string;
    duration: number;
}

interface DeathEffect {
    id: number;
    q: number;
    r: number;
    startTime: number;
}

// 日志类型颜色和图标映射
const LOG_STYLES: Record<CombatLogType, { color: string; icon: string }> = {
    attack: { color: '#ef4444', icon: '⚔' },
    move: { color: '#60a5fa', icon: '👣' },
    morale: { color: '#fbbf24', icon: '🛡' },
    kill: { color: '#f59e0b', icon: '💀' },
    skill: { color: '#a78bfa', icon: '✦' },
    intercept: { color: '#f97316', icon: '⚡' },
    info: { color: '#94a3b8', icon: '•' },
    flee: { color: '#f87171', icon: '💨' },
};

// ==================== 单位卡片组件 ====================
// 类型背景色映射
const TYPE_STYLES: Record<string, { bg: string; accent: string }> = {
  // 友军类型
  FARMER: { bg: 'bg-emerald-950/90', accent: 'border-emerald-700' },
  DESERTER: { bg: 'bg-slate-900/90', accent: 'border-slate-600' },
  HUNTER: { bg: 'bg-amber-950/90', accent: 'border-amber-700' },
  NOMAD: { bg: 'bg-cyan-950/90', accent: 'border-cyan-700' },
  NOBLE: { bg: 'bg-purple-950/90', accent: 'border-purple-700' },
  MONK: { bg: 'bg-indigo-950/90', accent: 'border-indigo-700' },
  // 敌军类型
  BANDIT: { bg: 'bg-red-950/90', accent: 'border-red-800' },
  BEAST: { bg: 'bg-orange-950/90', accent: 'border-orange-800' },
  ARMY: { bg: 'bg-zinc-900/90', accent: 'border-zinc-600' },
  ARCHER: { bg: 'bg-lime-950/90', accent: 'border-lime-800' },
  BERSERKER: { bg: 'bg-rose-950/90', accent: 'border-rose-800' },
};

const UnitCard: React.FC<{ unit: CombatUnit; isActive: boolean; isHit: boolean }> = ({ unit, isActive, isHit }) => {
  // 血量百分比和颜色
  const hpPercent = (unit.hp / unit.maxHp) * 100;
  const hpColor = hpPercent > 50 ? 'bg-gradient-to-r from-green-600 to-green-400' : hpPercent > 25 ? 'bg-gradient-to-r from-yellow-600 to-yellow-400' : 'bg-gradient-to-r from-red-700 to-red-500';
  const hpTextColor = hpPercent > 50 ? 'text-green-400' : hpPercent > 25 ? 'text-yellow-400' : 'text-red-400';

  // 护甲信息
  const armor = unit.equipment.armor;
  const armorPercent = armor ? (armor.durability / armor.maxDurability) * 100 : 0;
  const armorText = armor ? `${armor.durability}` : '--';

  // 武器名称（截取前4字）
  const weaponName = unit.equipment.mainHand?.name?.slice(0, 4) || '徒手';

  // 获取类型名称
  const bgKey = unit.team === 'ENEMY' ? (unit.aiType || 'BANDIT') : unit.background;
  const typeStyle = TYPE_STYLES[bgKey] || TYPE_STYLES['BANDIT'];
  const typeName = unit.team === 'ENEMY' 
    ? (unit.aiType === 'BEAST' ? '野兽' : unit.aiType === 'ARMY' ? '军士' : unit.aiType === 'ARCHER' ? '弓手' : '贼寇')
    : (BACKGROUNDS[unit.background]?.name || unit.background);

  const isEnemy = unit.team === 'ENEMY';
  
  // 士气状态
  const moraleIcon = MORALE_ICONS[unit.morale];
  const moraleColor = MORALE_COLORS[unit.morale];
  const isFleeing = unit.morale === MoraleStatus.FLEEING;

  // 立体感样式
  const cardStyle: React.CSSProperties = isEnemy ? {
    clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
    background: isFleeing 
      ? 'linear-gradient(135deg, rgba(100,50,50,0.95) 0%, rgba(50,25,25,0.98) 100%)'
      : 'linear-gradient(135deg, rgba(127,29,29,0.95) 0%, rgba(69,10,10,0.98) 100%)',
    boxShadow: isActive 
      ? '0 8px 20px rgba(251,191,36,0.4), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -2px 4px rgba(0,0,0,0.3)'
      : '0 4px 12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -2px 4px rgba(0,0,0,0.3)',
  } : {
    background: isFleeing
      ? 'linear-gradient(135deg, rgba(50,50,100,0.95) 0%, rgba(25,25,50,0.98) 100%)'
      : 'linear-gradient(135deg, rgba(30,58,138,0.95) 0%, rgba(23,37,84,0.98) 100%)',
    boxShadow: isActive 
      ? '0 8px 20px rgba(251,191,36,0.4), inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -2px 4px rgba(0,0,0,0.3)'
      : '0 4px 12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -2px 4px rgba(0,0,0,0.3)',
    borderRadius: '4px',
  };

  return (
    <div
      className={`
        w-[72px] p-1.5 text-center font-mono relative overflow-hidden
        border-2 ${isEnemy ? 'border-red-600/80' : 'border-blue-500/80'}
        ${isActive ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-black scale-105' : ''}
        ${isFleeing ? 'opacity-70' : ''}
        ${isHit ? 'anim-hit-shake' : ''}
        transition-all duration-200
      `}
      style={cardStyle}
    >
      {/* 受击红色闪光叠加 */}
      {isHit && (
        <div 
          className="absolute inset-0 z-10 pointer-events-none anim-hit-flash rounded"
          style={{ background: 'radial-gradient(circle, rgba(255,60,60,0.7) 0%, rgba(255,0,0,0.3) 70%, transparent 100%)' }}
        />
      )}
      {/* 顶部高光效果 */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent" />
      
      {/* 士气图标 - 显示在右上角 */}
      <div 
        className="absolute top-0.5 right-0.5 text-[10px] drop-shadow-md"
        style={{ color: moraleColor }}
        title={unit.morale}
      >
        {moraleIcon}
      </div>
      
      {/* 类型标签 */}
      <div className={`text-[9px] font-bold truncate mb-1 drop-shadow-md ${isEnemy ? 'text-red-300' : 'text-blue-300'}`}>
        {typeName}
      </div>

      {/* 血量条 - 带凹槽效果 */}
      <div className="h-[8px] bg-black/70 rounded-sm overflow-hidden mb-0.5 border border-black/50" style={{ boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)' }}>
        <div className={`h-full ${hpColor} transition-all relative`} style={{ width: `${hpPercent}%` }}>
          <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent h-1/2" />
        </div>
      </div>
      <div className={`text-[8px] font-bold ${hpTextColor} drop-shadow-sm`}>
        ♥ {unit.hp}/{unit.maxHp}
      </div>

      {/* 护甲条 */}
      {armor && (
        <>
          <div className="h-[6px] bg-black/70 rounded-sm overflow-hidden mb-0.5 mt-1 border border-black/50" style={{ boxShadow: 'inset 0 2px 3px rgba(0,0,0,0.5)' }}>
            <div className="h-full bg-gradient-to-r from-slate-500 to-slate-300 transition-all relative" style={{ width: `${armorPercent}%` }}>
              <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent h-1/2" />
            </div>
          </div>
          <div className="text-[7px] text-slate-300 drop-shadow-sm">⛨ {armorText}</div>
        </>
      )}

      {/* 武器名称 - 底部区域 */}
      <div className="text-[8px] text-amber-400 truncate mt-1 pt-1 border-t border-white/10 drop-shadow-sm font-semibold">
        {isFleeing ? '逃跑中' : weaponName}
      </div>

      {/* 底部阴影边缘 */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-t from-black/40 to-transparent" />
    </div>
  );
};

export const CombatView: React.FC<CombatViewProps> = ({ initialState, onCombatEnd }) => {
  const [state, setState] = useState(initialState);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const cameraRef = useRef({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.8);
  const [hoveredHex, setHoveredHex] = useState<{q:number, r:number} | null>(null);
  const [hoveredSkill, setHoveredSkill] = useState<Ability | null>(null);
  const [selectedAbility, setSelectedAbility] = useState<Ability | null>(null);

  // ==================== 新增：战斗特效状态 ====================
  const [hitUnits, setHitUnits] = useState<Set<string>>(new Set());
  const [screenShake, setScreenShake] = useState<'none' | 'light' | 'heavy'>('none');
  const [combatLogEntries, setCombatLogEntries] = useState<CombatLogEntry[]>([]);
  const [centerBanner, setCenterBanner] = useState<CenterBanner | null>(null);
  const attackLinesRef = useRef<AttackLineEffect[]>([]);
  const deathEffectsRef = useRef<DeathEffect[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const unitRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const activeUnit = state.units.find(u => u.id === state.turnOrder[state.currentUnitIndex]);
  const isPlayerTurn = activeUnit?.team === 'PLAYER';

  // ==================== 特效触发函数 ====================
  
  /** 触发受击闪烁+抖动 */
  const triggerHitEffect = useCallback((unitId: string) => {
    setHitUnits(prev => new Set(prev).add(unitId));
    setTimeout(() => {
      setHitUnits(prev => {
        const next = new Set(prev);
        next.delete(unitId);
        return next;
      });
    }, 400);
  }, []);

  /** 触发屏幕震动 */
  const triggerScreenShake = useCallback((intensity: 'light' | 'heavy') => {
    setScreenShake(intensity);
    setTimeout(() => setScreenShake('none'), intensity === 'heavy' ? 500 : 300);
  }, []);

  /** 触发攻击连线特效 */
  const triggerAttackLine = useCallback((fromQ: number, fromR: number, toQ: number, toR: number, color: string = '#ef4444') => {
    attackLinesRef.current.push({
      fromQ, fromR, toQ, toR,
      startTime: performance.now(),
      color,
      duration: 400,
    });
  }, []);

  /** 触发击杀特效 */
  const triggerDeathEffect = useCallback((q: number, r: number) => {
    deathEffectsRef.current.push({
      id: Date.now() + Math.random(),
      q, r,
      startTime: performance.now(),
    });
  }, []);

  /** 显示中央事件横幅 */
  const showCenterBanner = useCallback((text: string, color: string, icon: string) => {
    const banner: CenterBanner = { id: Date.now(), text, color, icon };
    setCenterBanner(banner);
    setTimeout(() => setCenterBanner(prev => prev?.id === banner.id ? null : prev), 2200);
  }, []);

  // --- 风格常量 ---
  const HEX_SIZE = 45;
  const HEX_GAP = 2;
  const HEIGHT_MULTIPLIER = 8; // 高度差乘数，增加立体感

  // 地形类型定义 - 带高度和颜色
  const TERRAIN_TYPES = {
    PLAINS: { 
      baseColor: '#3d4a2f', 
      lightColor: '#4a5a3a', 
      darkColor: '#2a3520',
      height: 0, 
      name: '平原' 
    },
    FOREST: { 
      baseColor: '#1f3320', 
      lightColor: '#2a4429', 
      darkColor: '#152215',
      height: 1, 
      name: '森林' 
    },
    MOUNTAIN: { 
      baseColor: '#4a4a4a', 
      lightColor: '#5a5a5a', 
      darkColor: '#333333',
      height: 3, 
      name: '山地' 
    },
    HILLS: { 
      baseColor: '#5a4a32', 
      lightColor: '#6a5a42', 
      darkColor: '#3a3022',
      height: 2, 
      name: '丘陵' 
    },
    SWAMP: { 
      baseColor: '#2a3a35', 
      lightColor: '#3a4a45', 
      darkColor: '#1a2a25',
      height: -1, 
      name: '沼泽' 
    },
    SNOW: { 
      baseColor: '#b8c4d0', 
      lightColor: '#d0d8e2', 
      darkColor: '#8a96a4',
      height: 0, 
      name: '雪原' 
    },
    DESERT: { 
      baseColor: '#9a7b4f', 
      lightColor: '#b08f60', 
      darkColor: '#7a6040',
      height: 0, 
      name: '荒漠' 
    },
  };
  const COLOR_FOG = "#080808";

  const getPixelPos = (q: number, r: number) => {
    const x = HEX_SIZE * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
    const y = HEX_SIZE * (1.5 * r);
    return { x, y };
  };

  // 预生成地形数据 - 基于世界地形类型和随机种子
  const gridRange = 15;

  // 每次战斗使用随机种子
  const combatSeed = useMemo(() => Math.floor(Math.random() * 100000), []);

  // 根据世界地形确定战斗地图的生物群落配置
  type CombatTerrainType = keyof typeof TERRAIN_TYPES;
  interface BiomeConfig {
    primary: CombatTerrainType;     // 主要地形（占比最大）
    secondary: CombatTerrainType;   // 次要地形
    tertiary: CombatTerrainType;    // 第三地形
    rare: CombatTerrainType;        // 稀有地形
    // 阈值：noise > t1 → rare, > t2 → tertiary, > t3 → secondary, else → primary
    thresholds: [number, number, number];
    // 额外低洼地形阈值 (noise < lowThreshold → lowTerrain)
    lowTerrain?: CombatTerrainType;
    lowThreshold?: number;
  }

  const biomeConfig = useMemo((): BiomeConfig => {
    const t = initialState.terrainType;
    switch (t) {
      case 'FOREST':
        return { primary: 'FOREST', secondary: 'PLAINS', tertiary: 'HILLS', rare: 'MOUNTAIN', thresholds: [0.75, 0.5, 0.2], lowTerrain: 'SWAMP', lowThreshold: -0.55 };
      case 'MOUNTAIN':
        return { primary: 'HILLS', secondary: 'MOUNTAIN', tertiary: 'PLAINS', rare: 'MOUNTAIN', thresholds: [0.55, 0.25, -0.1], lowTerrain: 'FOREST', lowThreshold: -0.5 };
      case 'SWAMP':
        return { primary: 'SWAMP', secondary: 'PLAINS', tertiary: 'FOREST', rare: 'HILLS', thresholds: [0.7, 0.4, 0.1], lowTerrain: 'SWAMP', lowThreshold: -0.3 };
      case 'SNOW':
        return { primary: 'SNOW', secondary: 'HILLS', tertiary: 'MOUNTAIN', rare: 'MOUNTAIN', thresholds: [0.7, 0.4, 0.15], lowTerrain: 'SNOW', lowThreshold: -0.3 };
      case 'DESERT':
        return { primary: 'DESERT', secondary: 'HILLS', tertiary: 'DESERT', rare: 'MOUNTAIN', thresholds: [0.75, 0.45, 0.15], lowTerrain: 'PLAINS', lowThreshold: -0.6 };
      case 'ROAD':
      case 'PLAINS':
      default:
        return { primary: 'PLAINS', secondary: 'FOREST', tertiary: 'HILLS', rare: 'MOUNTAIN', thresholds: [0.7, 0.45, 0.15], lowTerrain: 'SWAMP', lowThreshold: -0.55 };
    }
  }, [initialState.terrainType]);

  const terrainData = useMemo(() => {
    const data = new Map<string, { 
      type: CombatTerrainType,
      height: number,
    }>();
    
    // 简易 hash 伪随机数生成器（基于种子）
    const hash = (x: number, y: number, seed: number): number => {
      let h = seed + x * 374761393 + y * 668265263;
      h = (h ^ (h >> 13)) * 1274126177;
      h = h ^ (h >> 16);
      return (h & 0x7fffffff) / 0x7fffffff; // 归一化到 [0, 1]
    };

    // 多层噪声，使用 hash 实现类似 value noise 的效果
    const smoothNoise = (q: number, r: number, scale: number, seed: number): number => {
      const sq = q * scale, sr = r * scale;
      const q0 = Math.floor(sq), r0 = Math.floor(sr);
      const fq = sq - q0, fr = sr - r0;
      // 双线性插值
      const v00 = hash(q0, r0, seed);
      const v10 = hash(q0 + 1, r0, seed);
      const v01 = hash(q0, r0 + 1, seed);
      const v11 = hash(q0 + 1, r0 + 1, seed);
      const top = v00 * (1 - fq) + v10 * fq;
      const bot = v01 * (1 - fq) + v11 * fq;
      return top * (1 - fr) + bot * fr;
    };

    const combinedNoise = (q: number, r: number): number => {
      // 多层叠加，频率递增、振幅递减
      const n1 = smoothNoise(q, r, 0.15, combatSeed) * 0.5;
      const n2 = smoothNoise(q, r, 0.3, combatSeed + 1000) * 0.3;
      const n3 = smoothNoise(q, r, 0.6, combatSeed + 2000) * 0.2;
      return (n1 + n2 + n3) * 2 - 1; // 映射到 [-1, 1]
    };
    
    const [t1, t2, t3] = biomeConfig.thresholds;
    
    for (let q = -gridRange; q <= gridRange; q++) {
      for (let r = Math.max(-gridRange, -q - gridRange); r <= Math.min(gridRange, -q + gridRange); r++) {
        const n = combinedNoise(q, r);
        let type: CombatTerrainType;
        
        if (n > t1) type = biomeConfig.rare;
        else if (n > t2) type = biomeConfig.tertiary;
        else if (n > t3) type = biomeConfig.secondary;
        else if (biomeConfig.lowTerrain && biomeConfig.lowThreshold !== undefined && n < biomeConfig.lowThreshold) type = biomeConfig.lowTerrain;
        else type = biomeConfig.primary;
        
        data.set(`${q},${r}`, { 
          type, 
          height: TERRAIN_TYPES[type].height 
        });
      }
    }
    return data;
  }, [combatSeed, biomeConfig]);

  // 视野计算 - 战斗中使用更大的视野范围
  const visibleSet = useMemo(() => {
    const set = new Set<string>();
    state.units.filter(u => u.team === 'PLAYER' && !u.isDead).forEach(u => {
      const radius = 12; // 增大战斗视野范围
      for (let q = -radius; q <= radius; q++) {
        for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
          if (getHexDistance({q:0, r:0}, {q, r}) <= radius) {
            set.add(`${u.combatPos.q + q},${u.combatPos.r + r}`);
          }
        }
      }
    });
    return set;
  }, [state.units]);

  // --- 优化：预计算六边形顶点 ---
  const hexPoints = useMemo(() => {
    const points: { x: number, y: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i + 30);
      points.push({ x: Math.cos(angle), y: Math.sin(angle) });
    }
    return points;
  }, []);

  // --- 渲染系统（优化版）---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    // 优化：使用预计算的顶点
    const drawHex = (x: number, y: number, size: number) => {
      ctx.beginPath();
      ctx.moveTo(x + size * hexPoints[0].x, y + size * hexPoints[0].y);
      for (let i = 1; i < 6; i++) {
        ctx.lineTo(x + size * hexPoints[i].x, y + size * hexPoints[i].y);
      }
      ctx.closePath();
    };

    // 计算可见范围内的地块
    const getVisibleHexes = () => {
      const visible: { q: number, r: number, key: string }[] = [];
      const rect = canvas.getBoundingClientRect();
      const viewWidth = rect.width / zoom + 200;
      const viewHeight = rect.height / zoom + 200;
      
      terrainData.forEach((_, key) => {
        const [q, r] = key.split(',').map(Number);
        const { x, y } = getPixelPos(q, r);
        const screenX = x + cameraRef.current.x;
        const screenY = y + cameraRef.current.y;
        
        // 只渲染在视野范围内的地块
        if (Math.abs(screenX) < viewWidth / 2 && Math.abs(screenY) < viewHeight / 2) {
          visible.push({ q, r, key });
        }
      });
      return visible;
    };

    let animId: number;
    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
      }
      
      // 清屏
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, rect.width, rect.height);

      ctx.save();
      ctx.translate(rect.width / 2, rect.height / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(cameraRef.current.x, cameraRef.current.y);

      // 只渲染可见地块
      const visibleHexes = getVisibleHexes();
      
      // 按高度排序，先绘制低处的（伪3D效果）
      visibleHexes.sort((a, b) => {
        const dataA = terrainData.get(a.key);
        const dataB = terrainData.get(b.key);
        return (dataA?.height || 0) - (dataB?.height || 0);
      });

      // 1. 绘制地块
      visibleHexes.forEach(({ q, r, key }) => {
        const data = terrainData.get(key);
        if (!data) return;
        
        const { x, y } = getPixelPos(q, r);
        const isVisible = visibleSet.has(key);
        const isHovered = hoveredHex?.q === q && hoveredHex?.r === r;
        const terrain = TERRAIN_TYPES[data.type];
        const heightOffset = data.height * HEIGHT_MULTIPLIER; // 高度偏移

        if (isVisible) {
          // 绘制侧面（高度效果）
          if (data.height > 0) {
            ctx.fillStyle = terrain.darkColor;
            ctx.beginPath();
            // 绘制底部轮廓形成侧面
            for (let i = 2; i <= 5; i++) {
              const px = x + (HEX_SIZE - HEX_GAP) * hexPoints[i].x;
              const py = y + (HEX_SIZE - HEX_GAP) * hexPoints[i].y;
              if (i === 2) ctx.moveTo(px, py + heightOffset);
              else ctx.lineTo(px, py + heightOffset);
            }
            ctx.lineTo(x + (HEX_SIZE - HEX_GAP) * hexPoints[5].x, y + (HEX_SIZE - HEX_GAP) * hexPoints[5].y - heightOffset);
            for (let i = 5; i >= 2; i--) {
              const px = x + (HEX_SIZE - HEX_GAP) * hexPoints[i].x;
              const py = y + (HEX_SIZE - HEX_GAP) * hexPoints[i].y - heightOffset;
              ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
          }

          // 绘制顶面
          const topY = y - heightOffset;
          
          // 基础颜色（带轻微渐变模拟）
          ctx.fillStyle = isHovered ? terrain.lightColor : terrain.baseColor;
          drawHex(x, topY, HEX_SIZE - HEX_GAP);
          ctx.fill();

          // 顶部高光（简化：只画上半部分边缘）
          ctx.strokeStyle = `rgba(255,255,255,${isHovered ? 0.25 : 0.1})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + (HEX_SIZE - HEX_GAP) * hexPoints[5].x, topY + (HEX_SIZE - HEX_GAP) * hexPoints[5].y);
          for (let i = 0; i <= 2; i++) {
            ctx.lineTo(x + (HEX_SIZE - HEX_GAP) * hexPoints[i].x, topY + (HEX_SIZE - HEX_GAP) * hexPoints[i].y);
          }
          ctx.stroke();

          // 底部暗边
          ctx.strokeStyle = 'rgba(0,0,0,0.4)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x + (HEX_SIZE - HEX_GAP) * hexPoints[2].x, topY + (HEX_SIZE - HEX_GAP) * hexPoints[2].y);
          for (let i = 3; i <= 5; i++) {
            ctx.lineTo(x + (HEX_SIZE - HEX_GAP) * hexPoints[i].x, topY + (HEX_SIZE - HEX_GAP) * hexPoints[i].y);
          }
          ctx.stroke();

          // 地形图标（简化）
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          if (data.type === 'FOREST') {
            ctx.fillStyle = 'rgba(100,180,100,0.3)';
            ctx.font = '14px serif';
            ctx.fillText('🌲', x, topY);
          } else if (data.type === 'MOUNTAIN') {
            ctx.fillStyle = 'rgba(180,180,180,0.3)';
            ctx.font = '12px serif';
            ctx.fillText('⛰', x, topY);
          } else if (data.type === 'SWAMP') {
            ctx.fillStyle = 'rgba(100,150,130,0.2)';
            ctx.font = '12px serif';
            ctx.fillText('〰', x, topY);
          } else if (data.type === 'SNOW') {
            ctx.fillStyle = 'rgba(200,220,240,0.25)';
            ctx.font = '12px serif';
            ctx.fillText('❄', x, topY);
          } else if (data.type === 'DESERT') {
            ctx.fillStyle = 'rgba(200,170,100,0.25)';
            ctx.font = '12px serif';
            ctx.fillText('🏜', x, topY);
          }

          // 技能范围高亮（简化，无shadowBlur）
          if (isPlayerTurn && activeUnit && selectedAbility?.type === 'ATTACK') {
            const dist = getHexDistance(activeUnit.combatPos, {q, r});
            if (dist >= selectedAbility.range[0] && dist <= selectedAbility.range[1]) {
              ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
              ctx.lineWidth = 2;
              drawHex(x, topY, HEX_SIZE - HEX_GAP - 2);
              ctx.stroke();
              // 内发光效果（用半透明填充替代shadowBlur）
              ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
              drawHex(x, topY, HEX_SIZE - HEX_GAP - 2);
              ctx.fill();
            }
          }
          
          // 控制区可视化 - 显示敌方单位的控制区
          if (isPlayerTurn && activeUnit) {
            const enemyZoCSet = getAllEnemyZoCHexes(activeUnit.team, state);
            if (enemyZoCSet.has(key)) {
              // 用橙色边框标记敌方控制区
              ctx.strokeStyle = 'rgba(249, 115, 22, 0.6)'; // 橙色
              ctx.lineWidth = 1.5;
              drawHex(x, topY, HEX_SIZE - HEX_GAP - 4);
              ctx.stroke();
              // 轻微的橙色填充
              ctx.fillStyle = 'rgba(249, 115, 22, 0.08)';
              drawHex(x, topY, HEX_SIZE - HEX_GAP - 4);
              ctx.fill();
            }
            
            // 如果当前单位在敌方控制区内，高亮显示（警告）
            if (activeUnit.combatPos.q === q && activeUnit.combatPos.r === r && enemyZoCSet.has(key)) {
              ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)'; // 红色警告
              ctx.lineWidth = 2;
              ctx.setLineDash([4, 4]); // 虚线
              drawHex(x, topY, HEX_SIZE - HEX_GAP);
              ctx.stroke();
              ctx.setLineDash([]); // 重置虚线
            }
          }
        } else {
          // 迷雾
          ctx.fillStyle = COLOR_FOG;
          drawHex(x, y, HEX_SIZE - HEX_GAP);
          ctx.fill();
        }
      });

      // 2. 渲染单位指示器（简化版）
      state.units.forEach(u => {
        if (u.isDead) return;
        const key = `${u.combatPos.q},${u.combatPos.r}`;
        if (!visibleSet.has(key) && u.team === 'ENEMY') return;

        const terrainAtUnit = terrainData.get(key);
        const heightOffset = (terrainAtUnit?.height || 0) * HEIGHT_MULTIPLIER;
        const { x, y: baseY } = getPixelPos(u.combatPos.q, u.combatPos.r);
        const y = baseY - heightOffset;

        // 单位脚下的阴影圈 - 在地块顶面上
        ctx.fillStyle = u.team === 'PLAYER' ? 'rgba(59, 130, 246, 0.35)' : 'rgba(239, 68, 68, 0.35)';
        ctx.beginPath();
        ctx.ellipse(x, y + 5, 22, 11, 0, 0, Math.PI * 2);
        ctx.fill();

        // 当前单位高亮环
        if (activeUnit?.id === u.id) {
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.ellipse(x, y + 5, 26, 13, 0, 0, Math.PI * 2);
          ctx.stroke();
          // 内圈
          ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(x, y + 5, 20, 10, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      });

      // 3. 渲染攻击连线特效
      const now = performance.now();
      attackLinesRef.current = attackLinesRef.current.filter(line => {
        const elapsed = now - line.startTime;
        if (elapsed > line.duration) return false;
        
        const progress = elapsed / line.duration;
        const alpha = 1 - progress;
        
        const from = getPixelPos(line.fromQ, line.fromR);
        const to = getPixelPos(line.toQ, line.toR);
        const fromTerrain = terrainData.get(`${line.fromQ},${line.fromR}`);
        const toTerrain = terrainData.get(`${line.toQ},${line.toR}`);
        const fromHeight = (fromTerrain?.height || 0) * HEIGHT_MULTIPLIER;
        const toHeight = (toTerrain?.height || 0) * HEIGHT_MULTIPLIER;
        
        // 绘制闪光线
        ctx.save();
        ctx.strokeStyle = line.color;
        ctx.globalAlpha = alpha * 0.8;
        ctx.lineWidth = 3 * (1 - progress * 0.5);
        ctx.shadowColor = line.color;
        ctx.shadowBlur = 12 * alpha;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y - fromHeight);
        ctx.lineTo(to.x, to.y - toHeight);
        ctx.stroke();
        
        // 内发光线
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = alpha * 0.5;
        ctx.lineWidth = 1.5 * (1 - progress * 0.5);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y - fromHeight);
        ctx.lineTo(to.x, to.y - toHeight);
        ctx.stroke();
        ctx.restore();
        
        return true;
      });
      
      // 4. 渲染击杀爆发效果
      deathEffectsRef.current = deathEffectsRef.current.filter(effect => {
        const elapsed = now - effect.startTime;
        if (elapsed > 800) return false;
        
        const progress = elapsed / 800;
        const { x, y } = getPixelPos(effect.q, effect.r);
        const terrain = terrainData.get(`${effect.q},${effect.r}`);
        const heightOffset = (terrain?.height || 0) * HEIGHT_MULTIPLIER;
        
        // 扩散红色圆环
        ctx.save();
        const radius = 15 + progress * 40;
        const alpha = (1 - progress) * 0.6;
        
        ctx.strokeStyle = '#ef4444';
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 3 * (1 - progress);
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 15 * (1 - progress);
        ctx.beginPath();
        ctx.arc(x, y - heightOffset, radius, 0, Math.PI * 2);
        ctx.stroke();
        
        // 内部闪光
        ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
        ctx.globalAlpha = alpha * 0.5;
        ctx.beginPath();
        ctx.arc(x, y - heightOffset, radius * 0.6, 0, Math.PI * 2);
        ctx.fill();
        
        // 小骷髅标记（中心）
        if (progress < 0.5) {
          ctx.globalAlpha = 1 - progress * 2;
          ctx.fillStyle = '#fbbf24';
          ctx.font = `${16 + progress * 10}px serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('💀', x, y - heightOffset);
        }
        
        ctx.restore();
        return true;
      });

      ctx.restore();
      animId = requestAnimationFrame(render);
    };
    
    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [terrainData, visibleSet, hoveredHex, activeUnit, selectedAbility, zoom, hexPoints]);

  // DOM 图层同步 - 考虑地形高度
  useEffect(() => {
    let anim: number;
    const sync = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const cx = rect.width / 2, cy = rect.height / 2;
      
      state.units.forEach(u => {
        const el = unitRefs.current.get(u.id);
        if (el) {
          const key = `${u.combatPos.q},${u.combatPos.r}`;
          const isVisible = visibleSet.has(key);
          if (u.isDead || (!isVisible && u.team === 'ENEMY')) {
            el.style.display = 'none';
          } else {
            el.style.display = 'block';
            const { x, y } = getPixelPos(u.combatPos.q, u.combatPos.r);
            // 获取地形高度偏移
            const terrain = terrainData.get(key);
            const heightOffset = (terrain?.height || 0) * HEIGHT_MULTIPLIER;
            // 调整偏移量：卡片锚点在底部中心，让卡片"站"在地块上
            const screenX = cx + (x + cameraRef.current.x) * zoom - 36; // 水平居中 (72px / 2)
            const screenY = cy + (y - heightOffset + cameraRef.current.y) * zoom - 85; // 卡片底部对齐到地块顶部偏上
            el.style.transform = `translate3d(${screenX}px, ${screenY}px, 0) scale(${zoom})`;
          }
        }
      });
      anim = requestAnimationFrame(sync);
    };
    anim = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(anim);
  }, [state.units, zoom, visibleSet, terrainData]);

  // --- 逻辑函数 ---
  const addToLog = (msg: string, logType: CombatLogType = 'info') => {
    const entry: CombatLogEntry = { id: Date.now() + Math.random(), text: msg, type: logType, timestamp: Date.now() };
    setCombatLogEntries(prev => [entry, ...prev].slice(0, 15));
    // 也保留原始 combatLog 以防其他系统使用
    setState(prev => ({ ...prev, combatLog: [msg, ...prev.combatLog].slice(0, 15) }));
  };

  // ==================== 士气系统处理 ====================
  
  /**
   * 显示士气变化的浮动文字
   */
  const showMoraleFloatingText = (result: MoraleCheckResult, unit: CombatUnit) => {
    if (result.newMorale === result.previousMorale) return;
    
    const text = result.newMorale === MoraleStatus.FLEEING 
      ? '溃逃!' 
      : MORALE_ICONS[result.newMorale];
    const color = MORALE_COLORS[result.newMorale];
    
    setFloatingTexts(prev => [...prev, {
      id: Date.now() + Math.random(),
      text,
      x: unit.combatPos.q,
      y: unit.combatPos.r,
      color,
      type: 'morale' as FloatingTextType,
      size: result.newMorale === MoraleStatus.FLEEING ? 'lg' : 'md',
    }]);
    
    // 士气崩溃/溃逃 显示中央横幅
    if (result.newMorale === MoraleStatus.FLEEING) {
      showCenterBanner(`${unit.name} 溃逃了！`, '#ef4444', '💨');
    } else if (result.newMorale === MoraleStatus.BREAKING) {
      showCenterBanner(`${unit.name} 士气崩溃！`, '#f59e0b', '😱');
    }
    
    setTimeout(() => setFloatingTexts(prev => prev.filter(ft => ft.id !== (Date.now() + Math.random()))), 1500);
  };

  /**
   * 处理单位受伤后的士气检定
   */
  const processDamageWithMorale = useCallback((
    targetId: string,
    damage: number,
    attackerId: string
  ) => {
    setState(prev => {
      const target = prev.units.find(u => u.id === targetId);
      const attacker = prev.units.find(u => u.id === attackerId);
      if (!target) return prev;
      
      const previousHp = target.hp;
      const newHp = Math.max(0, target.hp - damage);
      const isDead = newHp <= 0;
      
      let updatedUnits = prev.units.map(u => {
        if (u.id === targetId) {
          return { ...u, hp: newHp, isDead };
        }
        return u;
      });
      
      const newState = { ...prev, units: updatedUnits };
      const allResults: MoraleCheckResult[] = [];
      
      // 1. 如果目标死亡，触发友军士气检定
      if (isDead) {
        const deathResults = handleAllyDeath(
          { ...target, hp: 0, isDead: true },
          newState
        );
        allResults.push(...deathResults);
        
        // 攻击者击杀敌人，尝试提升士气
        if (attacker && !attacker.isDead) {
          const killResult = handleEnemyKilled(attacker, newState);
          if (killResult) {
            allResults.push(killResult);
          }
        }
      } else {
        // 2. 目标未死但受重伤，触发自身士气检定
        const updatedTarget = updatedUnits.find(u => u.id === targetId)!;
        const heavyDmgResult = handleHeavyDamage(
          updatedTarget,
          previousHp,
          newState
        );
        if (heavyDmgResult) {
          allResults.push(heavyDmgResult);
        }
      }
      
      // 应用所有士气检定结果
      if (allResults.length > 0) {
        const { updatedUnits: finalUnits, chainResults } = applyMoraleResults(
          { ...newState, units: updatedUnits },
          allResults
        );
        updatedUnits = finalUnits;
        
        // 记录日志并显示浮动文字
        [...allResults, ...chainResults].forEach(result => {
          const displayText = getMoraleDisplayText(result);
          if (displayText) {
            addToLog(displayText, 'morale');
            const unit = finalUnits.find(u => u.id === result.unitId);
            if (unit) {
              showMoraleFloatingText(result, unit);
            }
          }
        });
      }
      
      return { ...prev, units: updatedUnits };
    });
  }, []);

  /**
   * 处理逃跑单位的自动行动
   */
  const executeFleeAction = useCallback(async (unit: CombatUnit) => {
    const fleeTarget = getFleeTargetPosition(unit, state);
    if (!fleeTarget) return;
    
    // 检查目标位置是否被占用
    const isOccupied = state.units.some(u => 
      !u.isDead && 
      u.combatPos.q === fleeTarget.q && 
      u.combatPos.r === fleeTarget.r
    );
    
    if (isOccupied) {
      // 尝试找一个相邻的空位置
      const neighbors = getHexNeighbors(unit.combatPos.q, unit.combatPos.r);
      const emptyNeighbor = neighbors.find(n => 
        !state.units.some(u => !u.isDead && u.combatPos.q === n.q && u.combatPos.r === n.r)
      );
      if (emptyNeighbor) {
        setState(prev => ({
          ...prev,
          units: prev.units.map(u => 
            u.id === unit.id 
              ? { ...u, combatPos: emptyNeighbor, currentAP: 0 }
              : u
          )
        }));
        addToLog(`${unit.name} 惊慌逃窜！`, 'flee');
      }
    } else {
      setState(prev => ({
        ...prev,
        units: prev.units.map(u => 
          u.id === unit.id 
            ? { ...u, combatPos: fleeTarget, currentAP: 0 }
            : u
        )
      }));
      addToLog(`${unit.name} 惊慌逃窜！`, 'flee');
    }
  }, [state]);

  /**
   * 回合开始时的士气恢复检定
   */
  const processTurnStartMorale = useCallback((unit: CombatUnit) => {
    if (unit.morale === MoraleStatus.CONFIDENT || unit.morale === MoraleStatus.STEADY) {
      return;
    }
    
    const result = handleTurnStartRecovery(unit, state);
    if (result) {
      const { updatedUnits, chainResults } = applyMoraleResults(state, [result]);
      
      setState(prev => ({
        ...prev,
        units: prev.units.map(u => {
          const updated = updatedUnits.find(uu => uu.id === u.id);
          return updated ? { ...u, morale: updated.morale } : u;
        })
      }));
      
      const displayText = getMoraleDisplayText(result);
      if (displayText) {
        addToLog(displayText, 'morale');
        showMoraleFloatingText(result, unit);
      }
    }
  }, [state]);

  const nextTurn = useCallback(() => {
    setState(prev => {
      let nextIdx = (prev.currentUnitIndex + 1) % prev.turnOrder.length;
      
      // 跳过死亡单位
      let attempts = 0;
      while (attempts < prev.turnOrder.length) {
        const nextUnit = prev.units.find(u => u.id === prev.turnOrder[nextIdx]);
        if (nextUnit && !nextUnit.isDead) break;
        nextIdx = (nextIdx + 1) % prev.turnOrder.length;
        attempts++;
      }
      
      const isNewRound = nextIdx === 0;
      
      return { 
        ...prev, 
        currentUnitIndex: nextIdx,
        round: isNewRound ? prev.round + 1 : prev.round,
        units: prev.units.map(u => {
          // 新回合开始时重置所有单位的截击使用状态
          if (isNewRound) {
            if (u.id === prev.turnOrder[nextIdx]) {
              return { ...u, currentAP: 9, hasUsedFreeAttack: false };
            }
            return { ...u, hasUsedFreeAttack: false };
          }
          // 当前单位回合开始时恢复AP
          if (u.id === prev.turnOrder[nextIdx]) {
            return { ...u, currentAP: 9 };
          }
          return u;
        })
      };
    });
    setSelectedAbility(null);
  }, []);

  // ==================== 敌人 AI 行动逻辑 ====================
  const isProcessingAI = useRef(false);
  
  useEffect(() => {
    console.log('[AI Effect] activeUnit:', activeUnit?.name, 'team:', activeUnit?.team, 'isDead:', activeUnit?.isDead);
    
    // 如果不是敌人回合，直接返回
    if (!activeUnit) {
      console.log('[AI] 没有活动单位');
      isProcessingAI.current = false;
      return;
    }
    
    if (activeUnit.team === 'PLAYER') {
      console.log('[AI] 玩家回合，跳过');
      isProcessingAI.current = false;
      
      // 玩家回合开始时，处理逃跑单位和士气恢复
      if (activeUnit.morale === MoraleStatus.FLEEING) {
        // 逃跑单位自动行动
        setTimeout(async () => {
          await executeFleeAction(activeUnit);
          await new Promise(r => setTimeout(r, 500));
          nextTurn();
        }, 300);
      } else {
        // 尝试士气恢复
        processTurnStartMorale(activeUnit);
        
        // 检查崩溃状态是否跳过行动
        if (activeUnit.morale === MoraleStatus.BREAKING && shouldSkipAction(activeUnit)) {
          addToLog(`${activeUnit.name} 惊慌失措，无法行动！`, 'morale');
          setTimeout(nextTurn, 800);
        }
      }
      return;
    }
    
    if (activeUnit.isDead) {
      console.log('[AI] 单位已死亡，跳过');
      isProcessingAI.current = false;
      nextTurn();
      return;
    }
    
    // 防止重复处理
    if (isProcessingAI.current) {
      console.log('[AI] 正在处理中，跳过');
      return;
    }
    isProcessingAI.current = true;
    
    console.log(`[AI开始] ${activeUnit.name} 的回合, AP: ${activeUnit.currentAP}, 士气: ${activeUnit.morale}, 位置: (${activeUnit.combatPos.q}, ${activeUnit.combatPos.r})`);
    
    // 异步执行 AI 回合
    const runAITurn = async () => {
      // 处理逃跑单位
      if (activeUnit.morale === MoraleStatus.FLEEING) {
        await executeFleeAction(activeUnit);
        await new Promise(r => setTimeout(r, 500));
        isProcessingAI.current = false;
        nextTurn();
        return;
      }
      
      // 尝试士气恢复
      processTurnStartMorale(activeUnit);
      
      // 检查崩溃状态是否跳过行动
      if (activeUnit.morale === MoraleStatus.BREAKING && shouldSkipAction(activeUnit)) {
        addToLog(`${activeUnit.name} 惊慌失措，无法行动！`, 'morale');
        await new Promise(r => setTimeout(r, 800));
        isProcessingAI.current = false;
        nextTurn();
        return;
      }
      
      let actionsPerformed = 0;
      const maxActions = 3;
      
      // 复制当前状态用于 AI 决策
      let currentAP = activeUnit.currentAP;
      let currentPos = { ...activeUnit.combatPos };
      
      while (actionsPerformed < maxActions && currentAP >= 2) {
        // 等待一下让玩家看清
        await new Promise(r => setTimeout(r, 500));
        
        // 构造用于 AI 决策的单位状态
        const unitForAI = { ...activeUnit, currentAP, combatPos: currentPos };
        
        console.log(`[AI决策前] 单位: ${unitForAI.name}, AP: ${unitForAI.currentAP}, 位置: (${unitForAI.combatPos.q}, ${unitForAI.combatPos.r})`);
        console.log(`[AI决策前] 装备武器: ${unitForAI.equipment?.mainHand?.name || '无'}`);
        console.log(`[AI决策前] state.units 数量: ${state.units.length}, 玩家单位: ${state.units.filter(u => u.team === 'PLAYER' && !u.isDead).length}`);
        
        // 获取 AI 决策
        const action = executeAITurn(unitForAI, state);
        console.log(`[AI决策] ${activeUnit.name}: ${action.type}`, JSON.stringify(action));
        
        if (action.type === 'WAIT') {
          addToLog(`${activeUnit.name} 观望形势。`, 'info');
          break;
        }
        
        if (action.type === 'MOVE' && action.targetPos) {
          const moveCost = getHexDistance(currentPos, action.targetPos) * 2;
          currentAP -= moveCost;
          
          // ==================== AI移动时的控制区检查 ====================
          const aiUnit = state.units.find(u => u.id === activeUnit.id);
          if (aiUnit) {
            const zocCheck = checkZoCOnMove(aiUnit, currentPos, action.targetPos, state);
            
            if (zocCheck.inEnemyZoC && zocCheck.threateningEnemies.length > 0) {
              // 处理截击攻击
              const { results, movementAllowed, totalDamage } = processZoCAttacks(
                aiUnit,
                currentPos,
                state
              );
              
              // 显示截击结果
              for (const result of results) {
                addToLog(getFreeAttackLogText(result), 'intercept');
                
                if (result.hit && result.damage > 0) {
                  setFloatingTexts(prev => [...prev, {
                    id: Date.now() + Math.random(),
                    text: `⚡-${result.damage}`,
                    x: currentPos.q,
                    y: currentPos.r,
                    color: '#3b82f6',
                    type: 'intercept' as FloatingTextType,
                    size: 'md' as const,
                  }]);
                  triggerHitEffect(activeUnit.id);
                  triggerAttackLine(result.attacker.combatPos.q, result.attacker.combatPos.r, currentPos.q, currentPos.r, '#3b82f6');
                  triggerScreenShake('light');
                }
              }
              
              // 更新状态
              setState(prev => {
                let newUnits = prev.units.map(u => {
                  // 标记已使用截击的玩家单位
                  const usedFreeAttack = results.find(r => r.attacker.id === u.id);
                  if (usedFreeAttack) {
                    return { ...u, hasUsedFreeAttack: true };
                  }
                  // 更新AI单位
                  if (u.id === activeUnit.id) {
                    const newHp = Math.max(0, u.hp - totalDamage);
                    const isDead = newHp <= 0;
                    return {
                      ...u,
                      hp: newHp,
                      isDead,
                      combatPos: movementAllowed && !isDead ? action.targetPos! : u.combatPos,
                      currentAP
                    };
                  }
                  return u;
                });
                return { ...prev, units: newUnits };
              });
              
              if (movementAllowed) {
                currentPos = { ...action.targetPos };
                addToLog(`${activeUnit.name} 受到截击后继续移动。`, 'move');
              } else {
                addToLog(`${activeUnit.name} 的移动被截击阻止！`, 'intercept');
              }
              
              actionsPerformed++;
              
              // 如果AI单位死亡，结束回合
              const updatedAiUnit = state.units.find(u => u.id === activeUnit.id);
              if (updatedAiUnit && updatedAiUnit.hp - totalDamage <= 0) {
                break;
              }
              
              continue; // 已处理，继续下一个行动
            }
          }
          
          // 没有截击，正常移动
          currentPos = { ...action.targetPos };
          
          // 更新状态
          setState(prev => ({
            ...prev,
            units: prev.units.map(u => 
              u.id === activeUnit.id 
                ? { ...u, combatPos: action.targetPos!, currentAP }
                : u
            )
          }));
          addToLog(`${activeUnit.name} 移动。`, 'move');
          actionsPerformed++;
          
        } else if (action.type === 'ATTACK' && action.targetUnitId && action.ability) {
          const target = state.units.find(u => u.id === action.targetUnitId && !u.isDead);
          if (target) {
            // 应用士气对伤害的影响
            const moraleEffects = getMoraleEffects(activeUnit.morale);
            const baseDamage = action.damage || Math.floor(Math.random() * 20) + 10;
            const damage = Math.floor(baseDamage * (1 + moraleEffects.damageMod / 100));
            currentAP -= action.ability.apCost;
            
            const isCritical = damage >= 25;
            const willKill = target.hp - damage <= 0;
            const weaponName = activeUnit.equipment.mainHand?.name || '徒手';
            
            // 显示伤害数字（增强版）
            setFloatingTexts(prev => [...prev, { 
              id: Date.now(), 
              text: isCritical ? `💥-${damage}` : `-${damage}`, 
              x: target.combatPos.q, 
              y: target.combatPos.r, 
              color: isCritical ? '#ff6b35' : '#ef4444',
              type: (isCritical ? 'critical' : 'damage') as FloatingTextType,
              size: isCritical ? 'lg' as const : 'md' as const,
            }]);
            
            // 触发受击特效
            triggerHitEffect(target.id);
            triggerAttackLine(currentPos.q, currentPos.r, target.combatPos.q, target.combatPos.r, '#ef4444');
            triggerScreenShake(isCritical || willKill ? 'heavy' : 'light');
            
            // 先更新攻击者AP
            setState(prev => ({
              ...prev,
              units: prev.units.map(u => {
                if (u.id === activeUnit.id) {
                  return { ...u, currentAP };
                }
                return u;
              })
            }));
            
            // 详细播报
            const logMsg = `${activeUnit.name}「${weaponName}」${action.ability.name} → ${target.name}，${isCritical ? '暴击！' : ''}造成 ${damage} 伤害！`;
            addToLog(logMsg, 'attack');
            
            // 暴击横幅
            if (isCritical) {
              showCenterBanner(`${activeUnit.name} 暴击！-${damage}`, '#ff6b35', '💥');
            }
            
            setTimeout(() => setFloatingTexts(prev => prev.slice(1)), 1200);
            
            // 处理伤害和士气检定
            processDamageWithMorale(target.id, damage, activeUnit.id);
            
            // 击杀特效
            if (willKill) {
              triggerDeathEffect(target.combatPos.q, target.combatPos.r);
              showCenterBanner(`${target.name} 被 ${activeUnit.name} 击杀！`, '#f59e0b', '💀');
              addToLog(`💀 ${target.name} 阵亡！`, 'kill');
            }
            
            actionsPerformed++;
          } else {
            break; // 目标无效，结束行动
          }
        } else {
          break; // 无法执行更多动作
        }
        
        // 动作之间的间隔
        await new Promise(r => setTimeout(r, 400));
      }
      
      // AI 回合结束
      console.log(`[AI结束] ${activeUnit.name} 完成 ${actionsPerformed} 个动作`);
      await new Promise(r => setTimeout(r, 300));
      isProcessingAI.current = false;
      nextTurn();
    };
    
    // 延迟开始 AI 回合
    const timeoutId = setTimeout(runAITurn, 600);
    return () => {
      clearTimeout(timeoutId);
      isProcessingAI.current = false;
    };
  }, [activeUnit?.id]); // 只依赖 activeUnit 的 id 变化

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) { isDraggingRef.current = true; dragStartRef.current = { x: e.clientX, y: e.clientY }; }
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingRef.current) {
      cameraRef.current.x += (e.clientX - dragStartRef.current.x) / zoom;
      cameraRef.current.y += (e.clientY - dragStartRef.current.y) / zoom;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const worldX = (e.clientX - rect.left - rect.width / 2) / zoom - cameraRef.current.x;
    const worldY = (e.clientY - rect.top - rect.height / 2) / zoom - cameraRef.current.y;
    const r = Math.round(worldY / (HEX_SIZE * 1.5));
    const q = Math.round((worldX - HEX_SIZE * (Math.sqrt(3) / 2) * r) / (HEX_SIZE * Math.sqrt(3)));
    if (hoveredHex?.q !== q || hoveredHex?.r !== r) setHoveredHex({ q, r });
    setMousePos({ x: e.clientX, y: e.clientY });
  };
  const handleMouseUp = () => isDraggingRef.current = false;

  const performAttack = () => {
    if (!hoveredHex || !activeUnit || !isPlayerTurn || !selectedAbility) return;
    
    // 检查玩家单位是否在逃跑状态
    if (activeUnit.morale === MoraleStatus.FLEEING) {
      addToLog(`${activeUnit.name} 正在逃跑，无法行动！`, 'flee');
      return;
    }
    
    const isVisible = visibleSet.has(`${hoveredHex.q},${hoveredHex.r}`);
    if (!isVisible) return;

    // ==================== 脱身技能处理 ====================
    if (selectedAbility.id === 'FOOTWORK_SKILL') {
      const dist = getHexDistance(activeUnit.combatPos, hoveredHex);
      
      // 脱身只能移动1格
      if (dist !== 1) {
        addToLog('脱身技能只能移动一格！');
        return;
      }
      
      // 检查AP和疲劳是否足够
      if (activeUnit.currentAP < selectedAbility.apCost) {
        addToLog('AP不足！');
        return;
      }
      
      // 检查目标位置是否被占用
      if (state.units.some(u => !u.isDead && u.combatPos.q === hoveredHex.q && u.combatPos.r === hoveredHex.r)) {
        addToLog('目标位置已被占用！');
        return;
      }
      
      // 执行脱身移动（无视控制区）
      setState(prev => ({
        ...prev,
        units: prev.units.map(u => {
          if (u.id === activeUnit.id) {
            return {
              ...u,
              combatPos: hoveredHex,
              currentAP: u.currentAP - selectedAbility.apCost,
              fatigue: Math.min(u.maxFatigue, u.fatigue + selectedAbility.fatCost)
            };
          }
          return u;
        })
      }));
      
      addToLog(`${activeUnit.name} 使用脱身，灵巧地避开了敌人！`, 'skill');
      setSelectedAbility(null);
      return;
    }

    const target = state.units.find(u => !u.isDead && u.combatPos.q === hoveredHex.q && u.combatPos.r === hoveredHex.r);
    if (target && target.team === 'ENEMY') {
        const dist = getHexDistance(activeUnit.combatPos, hoveredHex);
        if (dist >= selectedAbility.range[0] && dist <= selectedAbility.range[1]) {
            if (activeUnit.currentAP < selectedAbility.apCost) return;
            
            // 应用士气对伤害的影响
            const moraleEffects = getMoraleEffects(activeUnit.morale);
            const baseDmg = Math.floor(Math.random() * 20) + 15;
            const dmg = Math.floor(baseDmg * (1 + moraleEffects.damageMod / 100));
            
            const isCritical = dmg >= 25;
            const willKill = target.hp - dmg <= 0;
            const weaponName = activeUnit.equipment.mainHand?.name || '徒手';
            
            setFloatingTexts(prev => [...prev, { 
              id: Date.now(), 
              text: isCritical ? `💥-${dmg}` : `-${dmg}`, 
              x: hoveredHex.q, 
              y: hoveredHex.r, 
              color: isCritical ? '#ff6b35' : '#ef4444',
              type: (isCritical ? 'critical' : 'damage') as FloatingTextType,
              size: isCritical ? 'lg' as const : 'md' as const,
            }]);
            
            // 触发受击特效
            triggerHitEffect(target.id);
            triggerAttackLine(activeUnit.combatPos.q, activeUnit.combatPos.r, hoveredHex.q, hoveredHex.r, '#3b82f6');
            triggerScreenShake(isCritical || willKill ? 'heavy' : 'light');
            
            // 先更新攻击者的 AP
            setState(prev => ({
                ...prev,
                units: prev.units.map(u => {
                    if (u.id === activeUnit.id) return { ...u, currentAP: u.currentAP - (selectedAbility.apCost || 4) };
                    return u;
                })
            }));
            
            // 详细播报
            const logMsg = `${activeUnit.name}「${weaponName}」${selectedAbility.name} → ${target.name}，${isCritical ? '暴击！' : ''}造成 ${dmg} 伤害。`;
            addToLog(logMsg, 'attack');
            
            if (isCritical) {
              showCenterBanner(`${activeUnit.name} 暴击！-${dmg}`, '#ff6b35', '💥');
            }
            
            setTimeout(() => setFloatingTexts(prev => prev.slice(1)), 1200);
            
            // 处理伤害和士气检定
            processDamageWithMorale(target.id, dmg, activeUnit.id);
            
            // 击杀特效
            if (willKill) {
              triggerDeathEffect(target.combatPos.q, target.combatPos.r);
              showCenterBanner(`${target.name} 被 ${activeUnit.name} 击杀！`, '#f59e0b', '💀');
              addToLog(`💀 ${target.name} 阵亡！`, 'kill');
            }
        }
    }
  };

  const performMove = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!hoveredHex || !activeUnit || !isPlayerTurn) return;
    
    // 检查玩家单位是否在逃跑状态
    if (activeUnit.morale === MoraleStatus.FLEEING) {
      addToLog(`${activeUnit.name} 正在逃跑，无法控制！`, 'flee');
      return;
    }
    
    if (!visibleSet.has(`${hoveredHex.q},${hoveredHex.r}`)) return;
    
    const dist = getHexDistance(activeUnit.combatPos, hoveredHex);
    const apCost = dist * 2;
    
    // 检查AP是否足够且目标位置未被占用
    if (activeUnit.currentAP < apCost || state.units.some(u => !u.isDead && u.combatPos.q === hoveredHex.q && u.combatPos.r === hoveredHex.r)) {
      return;
    }
    
    // ==================== 控制区检查 ====================
    const zocCheck = checkZoCOnMove(activeUnit, activeUnit.combatPos, hoveredHex, state);
    
    if (zocCheck.inEnemyZoC && zocCheck.threateningEnemies.length > 0) {
      // 处理截击攻击
      const { results, movementAllowed, totalDamage } = processZoCAttacks(
        activeUnit,
        activeUnit.combatPos,
        state
      );
      
      // 显示截击结果
      results.forEach((result, index) => {
        setTimeout(() => {
          // 添加日志
          addToLog(getFreeAttackLogText(result), 'intercept');
          
          // 显示伤害浮动文字
          if (result.hit && result.damage > 0) {
            setFloatingTexts(prev => [...prev, {
              id: Date.now() + index,
              text: `⚡-${result.damage}`,
              x: activeUnit.combatPos.q,
              y: activeUnit.combatPos.r,
              color: '#f97316',
              type: 'intercept' as FloatingTextType,
              size: 'md' as const,
            }]);
            triggerHitEffect(activeUnit.id);
            triggerAttackLine(result.attacker.combatPos.q, result.attacker.combatPos.r, activeUnit.combatPos.q, activeUnit.combatPos.r, '#f97316');
            triggerScreenShake('light');
            setTimeout(() => setFloatingTexts(prev => prev.slice(1)), 1200);
          }
        }, index * 300);
      });
      
      // 更新状态：标记截击者已使用截击，处理伤害
      setState(prev => {
        let newUnits = prev.units.map(u => {
          // 标记已使用截击的敌人
          const usedFreeAttack = results.find(r => r.attacker.id === u.id);
          if (usedFreeAttack) {
            return { ...u, hasUsedFreeAttack: true };
          }
          return u;
        });
        
        // 处理移动单位的伤害
        if (totalDamage > 0) {
          newUnits = newUnits.map(u => {
            if (u.id === activeUnit.id) {
              const newHp = Math.max(0, u.hp - totalDamage);
              return { 
                ...u, 
                hp: newHp,
                isDead: newHp <= 0,
                // 如果移动被允许，执行移动并扣除AP
                combatPos: movementAllowed ? hoveredHex : u.combatPos,
                currentAP: u.currentAP - apCost
              };
            }
            return u;
          });
        } else if (movementAllowed) {
          // 无伤害但移动允许
          newUnits = newUnits.map(u => {
            if (u.id === activeUnit.id) {
              return { 
                ...u, 
                combatPos: hoveredHex,
                currentAP: u.currentAP - apCost
              };
            }
            return u;
          });
        } else {
          // 移动被阻止，只扣除AP
          newUnits = newUnits.map(u => {
            if (u.id === activeUnit.id) {
              return { 
                ...u, 
                currentAP: u.currentAP - apCost
              };
            }
            return u;
          });
        }
        
        return { ...prev, units: newUnits };
      });
      
      // 如果移动被阻止，显示提示
      if (!movementAllowed) {
        const lastResult = results[results.length - 1];
        if (lastResult?.targetKilled) {
          addToLog(`${activeUnit.name} 被截击击杀！`, 'kill');
          triggerDeathEffect(activeUnit.combatPos.q, activeUnit.combatPos.r);
          showCenterBanner(`${activeUnit.name} 被截击击杀！`, '#ef4444', '💀');
        }
      }
      
      // 处理截击造成的士气影响
      if (totalDamage > 0) {
        setTimeout(() => {
          results.forEach(result => {
            if (result.hit) {
              processDamageWithMorale(activeUnit.id, result.damage, result.attacker.id);
            }
          });
        }, results.length * 300 + 100);
      }
    } else {
      // 没有截击，正常移动
      setState(prev => ({
        ...prev,
        units: prev.units.map(u => u.id === activeUnit.id ? { ...u, combatPos: hoveredHex, currentAP: u.currentAP - apCost } : u)
      }));
    }
  };

  useEffect(() => {
    // 检查是否有一方全部死亡或逃跑
    const enemyRouted = checkTeamRouted('ENEMY', state);
    const playerRouted = checkTeamRouted('PLAYER', state);
    
    // 传统胜负判定
    const noEnemiesAlive = !state.units.some(u => u.team === 'ENEMY' && !u.isDead);
    const noPlayersAlive = !state.units.some(u => u.team === 'PLAYER' && !u.isDead);
    
    // 敌人溃逃判定：需要至少一半敌人已死亡，剩余全部溃逃才算胜利
    // 防止杀死一个敌人后士气连锁导致直接胜利
    const totalEnemies = state.units.filter(u => u.team === 'ENEMY').length;
    const deadEnemies = state.units.filter(u => u.team === 'ENEMY' && u.isDead).length;
    const enemyRoutedValid = enemyRouted && deadEnemies >= Math.ceil(totalEnemies / 2);
    
    if (noEnemiesAlive || enemyRoutedValid) {
      // 敌人全部死亡或半数以上阵亡且剩余溃逃，玩家胜利
      const survivors = state.units.filter(u => u.team === 'PLAYER' && !u.isDead);
      const enemyUnits = state.units.filter(u => u.team === 'ENEMY');
      onCombatEnd(true, survivors, enemyUnits, state.round);
    } else if (noPlayersAlive || playerRouted) {
      // 玩家全部死亡或溃逃，玩家失败
      const enemyUnits = state.units.filter(u => u.team === 'ENEMY');
      onCombatEnd(false, [], enemyUnits, state.round);
    }
  }, [state.units]);

  // ==================== 键盘快捷键 ====================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 只在玩家回合响应
      if (!isPlayerTurn || !activeUnit) return;

      const abilities = getUnitAbilities(activeUnit).filter(a => a.id !== 'MOVE');
      
      // 数字键 1-9 选择技能
      if (e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key) - 1;
        if (index < abilities.length) {
          setSelectedAbility(abilities[index]);
          e.preventDefault();
        }
      }

      // Space 或 Enter 结束回合
      if (e.key === ' ' || e.key === 'Enter') {
        nextTurn();
        e.preventDefault();
      }

      // Escape 取消选择的技能
      if (e.key === 'Escape') {
        setSelectedAbility(null);
        e.preventDefault();
      }

      // WASD 移动镜头
      const cameraSpeed = 30;
      if (e.key === 'w' || e.key === 'W') {
        cameraRef.current.y += cameraSpeed;
        e.preventDefault();
      }
      if (e.key === 's' || e.key === 'S') {
        cameraRef.current.y -= cameraSpeed;
        e.preventDefault();
      }
      if (e.key === 'a' || e.key === 'A') {
        cameraRef.current.x += cameraSpeed;
        e.preventDefault();
      }
      if (e.key === 'd' || e.key === 'D') {
        cameraRef.current.x -= cameraSpeed;
        e.preventDefault();
      }

      // + / - 缩放
      if (e.key === '=' || e.key === '+') {
        setZoom(z => Math.min(2, z + 0.1));
        e.preventDefault();
      }
      if (e.key === '-' || e.key === '_') {
        setZoom(z => Math.max(0.4, z - 0.1));
        e.preventDefault();
      }

      // R 重置镜头到当前单位
      if (e.key === 'r' || e.key === 'R') {
        const { x, y } = getPixelPos(activeUnit.combatPos.q, activeUnit.combatPos.r);
        cameraRef.current.x = -x;
        cameraRef.current.y = -y;
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlayerTurn, activeUnit, nextTurn]);

  return (
    <div className="flex flex-col h-full w-full bg-[#050505] font-serif select-none overflow-hidden relative">
      <div className="h-16 bg-black border-b border-amber-900/40 flex items-center px-6 gap-3 z-50 shrink-0">
        {state.turnOrder.map((uid, i) => {
          const u = state.units.find(u => u.id === uid);
          if (!u || u.isDead) return null;
          const isCurrent = i === state.currentUnitIndex;
          return (
            <div key={uid} className={`relative flex-shrink-0 transition-all duration-300 ${isCurrent ? 'scale-110' : 'opacity-40 grayscale'}`}>
              <Portrait character={u} size="sm" className={u.team === 'ENEMY' ? 'border-red-900' : 'border-blue-900'} />
              {isCurrent && <div className="absolute -bottom-1 left-0 w-full h-1 bg-amber-500" />}
            </div>
          );
        })}
      </div>

      <div ref={containerRef} className={`flex-1 relative bg-[#0a0a0a] ${screenShake === 'heavy' ? 'anim-screen-shake-heavy' : screenShake === 'light' ? 'anim-screen-shake-light' : ''}`} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onWheel={e => setZoom(z => Math.max(0.4, Math.min(2, z - Math.sign(e.deltaY) * 0.05)))}>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" onClick={performAttack} onContextMenu={performMove} />
        
        <div className="absolute inset-0 pointer-events-none">
          {state.units.map(u => (
            <div 
              key={u.id} 
              ref={el => { if(el) unitRefs.current.set(u.id, el); else unitRefs.current.delete(u.id); }} 
              className="absolute"
              style={{ width: '72px', height: 'auto' }}
            >
              <UnitCard unit={u} isActive={activeUnit?.id === u.id} isHit={hitUnits.has(u.id)} />
            </div>
          ))}
          {floatingTexts.map(ft => {
            const { x, y } = getPixelPos(ft.x, ft.y);
            const screenX = (window.innerWidth/2) + (x + cameraRef.current.x) * zoom;
            const screenY = (window.innerHeight/2) + (y + cameraRef.current.y) * zoom - 60;
            const fontSize = ft.size === 'lg' ? 'text-3xl' : ft.size === 'sm' ? 'text-sm' : 'text-xl';
            const animClass = ft.type === 'critical' ? 'anim-float-up-crit' 
              : ft.type === 'miss' ? 'anim-float-miss'
              : 'anim-float-up';
            return (
              <div 
                key={ft.id} 
                className={`absolute ${fontSize} font-bold ${animClass} pointer-events-none`} 
                style={{ 
                  left: screenX, 
                  top: screenY, 
                  color: ft.color, 
                  textShadow: ft.type === 'critical' 
                    ? '0 0 10px rgba(255,107,53,0.8), 2px 2px 0 black' 
                    : '2px 2px 0 black, 0 0 6px rgba(0,0,0,0.5)',
                  zIndex: ft.type === 'critical' ? 60 : 55,
                }}
              >
                {ft.text}
              </div>
            );
          })}
        </div>

        {hoveredHex && isPlayerTurn && activeUnit && visibleSet.has(`${hoveredHex.q},${hoveredHex.r}`) && (() => {
          const terrainAtHover = terrainData.get(`${hoveredHex.q},${hoveredHex.r}`);
          const terrainInfo = terrainAtHover ? TERRAIN_TYPES[terrainAtHover.type] : null;
          const heightDiff = terrainAtHover ? terrainAtHover.height - (terrainData.get(`${activeUnit.combatPos.q},${activeUnit.combatPos.r}`)?.height || 0) : 0;
          
          // 检查当前单位是否在敌方控制区内（移动会触发截击）
          const zocCheck = checkZoCOnMove(activeUnit, activeUnit.combatPos, hoveredHex, state);
          const willTriggerZoC = zocCheck.inEnemyZoC && zocCheck.threateningEnemies.length > 0;
          
          return (
            <div 
              className="absolute pointer-events-none bg-gradient-to-b from-black/95 to-gray-900/95 border border-amber-900/50 p-2.5 text-[10px] text-amber-500 z-50 rounded shadow-xl"
              style={{ left: mousePos.x + 20, top: mousePos.y + 20, boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}
            >
              {/* 地形信息 */}
              {terrainInfo && (
                <div className="flex items-center gap-2 mb-1.5 pb-1.5 border-b border-white/10">
                  <span className="text-slate-300 font-bold">{terrainInfo.name}</span>
                  {heightDiff > 0 && <span className="text-green-400 text-[9px]">↑高地+{heightDiff}</span>}
                  {heightDiff < 0 && <span className="text-red-400 text-[9px]">↓低地{heightDiff}</span>}
                </div>
              )}
              <div className="font-bold">移动消耗: {getHexDistance(activeUnit.combatPos, hoveredHex) * 2} AP</div>
              
              {/* 控制区警告 */}
              {willTriggerZoC && (
                <div className="mt-1.5 pt-1.5 border-t border-orange-500/30">
                  <div className="flex items-center gap-1 text-orange-400 font-bold">
                    <span>⚠️</span>
                    <span>离开敌方控制区！</span>
                  </div>
                  <div className="text-orange-300 text-[9px] mt-0.5">
                    将触发 {zocCheck.threateningEnemies.length} 次截击攻击
                  </div>
                  <div className="text-orange-200/70 text-[8px] mt-0.5">
                    截击可能阻止移动
                  </div>
                  {zocCheck.canUseFootwork && (
                    <div className="text-green-400 text-[8px] mt-1">
                      💨 可使用"脱身"技能安全撤离
                    </div>
                  )}
                </div>
              )}
              
              <div className="text-slate-400 mt-1.5 text-[9px] border-t border-white/10 pt-1.5">
                <span className="bg-slate-700 px-1 rounded mr-1">右键</span> 移动
                <span className="mx-2">|</span>
                <span className="bg-slate-700 px-1 rounded mr-1">左键</span> 攻击
              </div>
            </div>
          );
        })()}
      </div>

      <div className="h-32 bg-[#0d0d0d] border-t border-amber-900/60 z-50 flex items-center px-10 justify-between shrink-0 shadow-2xl">
        <div className="flex items-center gap-6 w-72">
          {activeUnit && (
            <>
              <Portrait character={activeUnit} size="md" className="border-amber-600 border-2" />
              <div className="flex flex-col">
                <span className="text-xl font-bold text-amber-500 tracking-widest">{activeUnit.name}</span>
                <div className="flex gap-4 mt-1 text-[10px] font-mono">
                  <span className="text-slate-400">AP <b className="text-white">{activeUnit.currentAP}</b></span>
                  <span className="text-slate-400">生命 <b className="text-white">{activeUnit.hp}/{activeUnit.maxHp}</b></span>
                </div>
                {/* 士气状态显示 */}
                <div className="flex items-center gap-2 mt-1">
                  <span 
                    className="text-[11px] font-bold px-1.5 py-0.5 rounded"
                    style={{ 
                      color: MORALE_COLORS[activeUnit.morale],
                      backgroundColor: `${MORALE_COLORS[activeUnit.morale]}20`,
                      border: `1px solid ${MORALE_COLORS[activeUnit.morale]}40`
                    }}
                  >
                    {MORALE_ICONS[activeUnit.morale]} {activeUnit.morale}
                  </span>
                  {activeUnit.morale === MoraleStatus.FLEEING && (
                    <span className="text-[9px] text-red-400 animate-pulse">无法控制!</span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3">
          {isPlayerTurn && activeUnit && getUnitAbilities(activeUnit).filter(a => a.id !== 'MOVE').map((skill, index) => (
            <button 
              key={skill.id} 
              onClick={() => setSelectedAbility(skill)} 
              onMouseEnter={() => setHoveredSkill(skill)} 
              onMouseLeave={() => setHoveredSkill(null)} 
              className={`w-14 h-14 border-2 transition-all flex flex-col items-center justify-center relative
                ${selectedAbility?.id === skill.id 
                  ? 'border-amber-400 bg-gradient-to-b from-amber-900/60 to-amber-950/80 -translate-y-2 shadow-lg shadow-amber-500/30' 
                  : 'border-amber-900/30 bg-gradient-to-b from-black/40 to-black/60 hover:border-amber-600 hover:from-amber-900/20'
                }
              `}
              style={{ boxShadow: selectedAbility?.id === skill.id ? 'inset 0 1px 0 rgba(255,255,255,0.1)' : 'inset 0 -2px 4px rgba(0,0,0,0.3)' }}
            >
              {/* 快捷键提示 */}
              <span className="absolute -top-2 -left-1 w-4 h-4 bg-amber-700 text-[9px] font-bold text-white rounded flex items-center justify-center shadow">
                {index + 1}
              </span>
              <span className="text-2xl drop-shadow-md">{skill.icon}</span>
              <span className="absolute top-1 right-1 text-[8px] font-mono text-amber-500">{skill.apCost}</span>
            </button>
          ))}
        </div>

        <div className="w-48 flex flex-col items-end gap-3">
          {isPlayerTurn ? (
            <button 
              onClick={nextTurn} 
              className="px-8 py-2 bg-gradient-to-b from-amber-900/20 to-amber-950/40 border border-amber-600/50 text-amber-500 font-bold text-xs hover:from-amber-600 hover:to-amber-700 hover:text-white transition-all tracking-widest uppercase flex items-center gap-2"
              style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)' }}
            >
              结束回合
              <span className="text-[9px] bg-amber-700/60 px-1.5 py-0.5 rounded text-amber-200">Space</span>
            </button>
          ) : (
            <div className="text-amber-900 animate-pulse font-bold tracking-widest text-sm uppercase">敌军行动...</div>
          )}
        </div>
      </div>

      {hoveredSkill && (
        <div 
          className="fixed bottom-36 left-1/2 -translate-x-1/2 w-72 bg-gradient-to-b from-gray-900/98 to-black/98 border border-amber-900/50 p-3 z-[100] rounded shadow-2xl"
          style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="text-amber-400 font-bold text-sm">{hoveredSkill.name}</div>
            <div className="flex gap-2 text-[9px]">
              <span className="bg-red-900/60 text-red-300 px-1.5 py-0.5 rounded">AP {hoveredSkill.apCost}</span>
              <span className="bg-blue-900/60 text-blue-300 px-1.5 py-0.5 rounded">疲劳 {hoveredSkill.fatCost}</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">"{hoveredSkill.description}"</p>
          {hoveredSkill.range[1] > 0 && (
            <div className="text-[9px] text-slate-500 mt-2 pt-2 border-t border-white/10">
              射程: {hoveredSkill.range[0]}-{hoveredSkill.range[1]} 格
            </div>
          )}
        </div>
      )}

      {/* ==================== 战斗日志面板（左侧悬浮） ==================== */}
      <div className="fixed left-3 top-20 w-72 max-h-[45vh] z-[60] pointer-events-none">
        <div className="bg-gradient-to-b from-black/85 to-black/70 border border-amber-900/30 rounded-sm overflow-hidden backdrop-blur-sm">
          {/* 日志标题 */}
          <div className="px-3 py-1.5 border-b border-amber-900/30 flex items-center gap-2">
            <span className="text-amber-600 text-[10px] font-bold tracking-widest">战斗日志</span>
            <span className="text-slate-600 text-[9px]">第{state.round}回合</span>
          </div>
          {/* 日志条目 */}
          <div className="px-2 py-1 space-y-0.5 max-h-[38vh] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
            {combatLogEntries.slice(0, 12).map((entry, i) => {
              const style = LOG_STYLES[entry.type];
              return (
                <div 
                  key={entry.id}
                  className={`flex items-start gap-1.5 py-1 px-1.5 rounded-sm text-[11px] leading-snug ${i === 0 ? 'anim-slide-in' : ''}`}
                  style={{ 
                    opacity: Math.max(0.3, 1 - i * 0.07),
                    borderLeft: i === 0 ? `2px solid ${style.color}` : '2px solid transparent',
                    backgroundColor: i === 0 ? `${style.color}10` : 'transparent',
                  }}
                >
                  <span className="flex-shrink-0 mt-0.5" style={{ color: style.color }}>{style.icon}</span>
                  <span style={{ color: i === 0 ? style.color : '#94a3b8' }}>{entry.text}</span>
                </div>
              );
            })}
            {combatLogEntries.length === 0 && (
              <div className="text-slate-600 text-[10px] py-2 text-center italic">战斗开始...</div>
            )}
          </div>
        </div>
      </div>

      {/* ==================== 中央事件横幅 ==================== */}
      {centerBanner && (
        <div 
          key={centerBanner.id}
          className="fixed top-1/3 left-1/2 z-[100] anim-banner pointer-events-none"
          style={{ transform: 'translateX(-50%)' }}
        >
          <div 
            className="px-10 py-3 border-2 rounded-sm flex items-center gap-3 whitespace-nowrap"
            style={{ 
              backgroundColor: 'rgba(0,0,0,0.9)',
              borderColor: centerBanner.color,
              boxShadow: `0 0 30px ${centerBanner.color}40, 0 0 60px ${centerBanner.color}20, inset 0 1px 0 rgba(255,255,255,0.1)`,
            }}
          >
            <span className="text-2xl">{centerBanner.icon}</span>
            <span 
              className="text-xl font-bold tracking-wider"
              style={{ color: centerBanner.color, textShadow: `0 0 10px ${centerBanner.color}60` }}
            >
              {centerBanner.text}
            </span>
          </div>
        </div>
      )}

      {/* 快捷键帮助面板 */}
      <div className="fixed bottom-2 left-2 text-[8px] text-slate-600 z-50 bg-black/50 px-2 py-1 rounded">
        <span className="text-slate-500">快捷键:</span>
        <span className="ml-2"><b className="text-slate-400">1-9</b> 技能</span>
        <span className="ml-2"><b className="text-slate-400">WASD</b> 移动视角</span>
        <span className="ml-2"><b className="text-slate-400">+/-</b> 缩放</span>
        <span className="ml-2"><b className="text-slate-400">R</b> 聚焦</span>
        <span className="ml-2"><b className="text-slate-400">Esc</b> 取消</span>
      </div>
    </div>
  );
};

function lightenColor(color: string, percent: number) {
    const num = parseInt(color.replace("#",""), 16), amt = Math.round(2.55 * percent),
    R = (num >> 16) + amt, B = (num >> 8 & 0x00FF) + amt, G = (num & 0x0000FF) + amt;
    return "#" + (0x1000000 + (R<255?R<1?0:R:255)*0x10000 + (B<255?B<1?0:B:255)*0x100 + (G<255?G<1?0:G:255)).toString(16).slice(1);
}

function darkenColor(color: string, percent: number) {
    const num = parseInt(color.replace("#",""), 16), amt = Math.round(2.55 * percent),
    R = Math.max(0, (num >> 16) - amt), 
    G = Math.max(0, (num >> 8 & 0x00FF) - amt), 
    B = Math.max(0, (num & 0x0000FF) - amt);
    return "#" + (0x1000000 + R*0x10000 + G*0x100 + B).toString(16).slice(1);
}
