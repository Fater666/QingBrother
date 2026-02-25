import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { CombatState, CombatUnit, Ability, Item, MoraleStatus } from '../types.ts';
import { getHexNeighbors, getHexDistance, getUnitAbilities, ABILITIES, BACKGROUNDS, isInEnemyZoC, getAllEnemyZoCHexes, calculateHitChance, rollHitCheck, getSurroundingBonus } from '../constants';
import { executeAITurn, AIAction } from '../services/combatAI.ts';
import {
  getPathMoveCost, checkNineLives, hasPerk,
  getBerserkAPRecovery, hasHeadHunter, getKillingFrenzyMultiplier,
  getOverwhelmStacks, getReachAdvantageBonus, hasFearsome,
  resetTurnStartStates, applyAdrenalineTurnOrder,
  getWeaponMasteryFatigueMultiplier, getWeaponMasteryEffects,
  isLoneWolfActive, getLoneWolfMultiplier,
} from '../services/perkService';
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
  getRetreatTargetPosition,
  shouldSkipAction,
  MORALE_ICONS,
  MORALE_COLORS,
  MoraleCheckResult
} from '../services/moraleService.ts';
import {
  checkZoCOnMove,
  checkZoCEnterOnStep,
  processZoCAttacks,
  processSpearwallEntryAttacks,
  getFreeAttackLogText,
  FreeAttackResult
} from '../services/zocService.ts';
import { getPolearmAdjacentHitPenalty } from '../services/combatUtils';
import {
  calculateDamage,
  getDamageLogText,
  getInterceptDamageLogText,
  DamageResult,
  HitLocation
} from '../services/damageService.ts';

// --- HELPER COMPONENTS ---

const RenderIcon: React.FC<{ icon: string; className?: string; style?: React.CSSProperties }> = ({ icon, className, style }) => {
  if (icon.startsWith('/assets/')) {
    return <img src={icon} alt="" className={className} style={{ ...style, display: 'inline-block', verticalAlign: 'middle' }} />;
  }
  return <span className={className} style={style}>{icon}</span>;
};

interface CombatViewProps {
  initialState: CombatState;
  onCombatEnd: (victory: boolean, survivors: CombatUnit[], enemyUnits: CombatUnit[], rounds: number, isRetreat?: boolean) => void;
  onTriggerTip?: (tipId: string) => void;
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

type HexPos = { q: number; r: number };

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

// 武器图标映射
const getWeaponIcon = (w: Item | null): string => {
  if (!w) return '/assets/icons/fist.png';
  const n = w.name;
  if (n.includes('爪') || n.includes('牙') || n.includes('獠')) return '🐺';
  if (n.includes('弓')) return '/assets/icons/bow.png';
  if (n.includes('弩')) return '/assets/icons/bow.png';
  if (n.includes('斧') || n.includes('飞斧')) return '/assets/icons/axe.png';
  if (n.includes('矛') || n.includes('枪') || n.includes('标枪') || n.includes('投矛')) return '/assets/icons/spear.png';
  if (n.includes('锤') || n.includes('骨朵')) return '/assets/icons/mace.png';
  if (n.includes('棒') || n.includes('殳')) return '/assets/icons/mace.png';
  if (n.includes('戈') || n.includes('戟')) return '/assets/icons/spear.png';
  if (n.includes('匕')) return '/assets/icons/dagger.png';
  if (n.includes('飞石') || n.includes('飞蝗')) return '🪨';
  if (n.includes('鞭') || n.includes('锏') || n.includes('铁链')) return '/assets/icons/mace.png';
  return '/assets/icons/sword.png';
};
// 技能图标兜底，避免个别平台 emoji 缺字导致显示为空
const getAbilityIcon = (ability: Ability | null | undefined): string => {
  if (!ability) return '✦';
  // 保持技能图标原始配置（CSV/常量中的 emoji）
  return ability.icon || '✦';
};

const isCrossbowWeapon = (weapon: Item | null | undefined): boolean => {
  if (!weapon) return false;
  return weapon.weaponClass === 'crossbow' || weapon.name.includes('弩');
};

const isCrossbowUnit = (unit: CombatUnit | null | undefined): boolean => {
  if (!unit) return false;
  return isCrossbowWeapon(unit.equipment.mainHand);
};

const isCrossbowLoaded = (unit: CombatUnit | null | undefined): boolean => {
  if (!unit) return false;
  // 默认视为已装填；仅显式 false 才判定未装填。
  return unit.crossbowLoaded !== false;
};

const AIMED_SHOT_DAMAGE_MULT = 1.2;
const TURN_START_FATIGUE_RECOVERY = 15;
const HAMMER_BASH_STUN_CHANCE_ONE_HANDED = 35;
const HAMMER_BASH_STUN_CHANCE_TWO_HANDED = 45;
const HAMMER_BASH_STUN_HEADSHOT_BONUS = 10;

const clampPercent = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const isHammerBashStunAttack = (ability: Ability, attacker: CombatUnit): boolean => {
  const weapon = attacker.equipment.mainHand;
  if (!weapon || ability.id !== 'BASH') return false;
  return weapon.weaponClass === 'hammer';
};

const getHammerBashStunChance = (
  attacker: CombatUnit,
  target: CombatUnit,
  hitLocation: HitLocation
): number => {
  const weapon = attacker.equipment.mainHand;
  const weaponId = weapon?.id;
  const baseChance = weapon?.twoHanded ? HAMMER_BASH_STUN_CHANCE_TWO_HANDED : HAMMER_BASH_STUN_CHANCE_ONE_HANDED;
  const headBonus = hitLocation === 'HEAD' ? HAMMER_BASH_STUN_HEADSHOT_BONUS : 0;
  const masteryBonus = hasPerk(attacker, 'hammer_mastery') ? 10 : 0;
  // 破军锤「震慑」（被动）：击晕+20%，忽略50%胆识
  let uniqueBonus = 0;
  let resolveReductionMult = 1;
  if (weaponId === 'w_unique_pojun') { uniqueBonus = 20; resolveReductionMult = 0.5; }
  const resolveReduction = Math.max(0, Math.floor((target.stats.resolve - 40) / 5)) * resolveReductionMult;
  return clampPercent(baseChance + headBonus + masteryBonus + uniqueBonus - resolveReduction, 15, 75);
};

interface DisplayStatus {
  id: string;
  icon: string;
  label: string;
  tone: 'buff' | 'debuff' | 'utility';
  badge?: string;
}

const getUnitDisplayStatuses = (unit: CombatUnit): DisplayStatus[] => {
  const statuses: DisplayStatus[] = [];

  if (unit.isShieldWall) {
    statuses.push({ id: 'shieldwall', icon: '🛡️', label: '盾墙', tone: 'buff' });
  }
  if (unit.isHalberdWall) {
    statuses.push({ id: 'spearwall', icon: '🚧', label: '矛墙', tone: 'buff' });
  }
  if (unit.isRiposte) {
    statuses.push({ id: 'riposte', icon: '🔄', label: '反击姿态', tone: 'buff' });
  }
  if (unit.isIndomitable) {
    statuses.push({ id: 'indomitable', icon: '🗿', label: '不屈', tone: 'buff' });
  }
  if (unit.adrenalineActive) {
    statuses.push({ id: 'adrenaline', icon: '💉', label: '血勇（下回合先手）', tone: 'buff' });
  }
  if (unit.taunting) {
    statuses.push({ id: 'taunt', icon: '🤬', label: '挑衅（敌方优先攻击）', tone: 'buff' });
  }
  if (unit.isBannerman) {
    statuses.push({ id: 'bannerman', icon: '🚩', label: '旗手（士气光环）', tone: 'buff' });
  }
  if ((unit.killingFrenzyTurns || 0) > 0) {
    statuses.push({
      id: 'killing_frenzy',
      icon: '🔥',
      label: '杀意（伤害提升）',
      tone: 'buff',
      badge: `${unit.killingFrenzyTurns}T`,
    });
  }
  if ((unit.overwhelmStacks || 0) > 0) {
    statuses.push({
      id: 'overwhelm',
      icon: '🕸️',
      label: '压制（攻击力下降）',
      tone: 'debuff',
      badge: `${unit.overwhelmStacks}`,
    });
  }
  if ((unit.stunnedTurns || 0) > 0) {
    statuses.push({
      id: 'stunned',
      icon: '😵',
      label: '击晕（下回合无法行动）',
      tone: 'debuff',
      badge: `${unit.stunnedTurns}T`,
    });
  }
  if (unit.headHunterActive) {
    statuses.push({ id: 'head_hunter', icon: '🎯', label: '索首（下次必中头部）', tone: 'buff' });
  }
  if ((unit.fastAdaptationStacks || 0) > 0) {
    statuses.push({
      id: 'fast_adaptation',
      icon: '📈',
      label: '临机应变（命中率提升）',
      tone: 'buff',
      badge: `${unit.fastAdaptationStacks}`,
    });
  }
  if ((unit.reachAdvantageBonus || 0) > 0) {
    statuses.push({
      id: 'reach_advantage',
      icon: '🧱',
      label: '兵势（近战防御加成）',
      tone: 'buff',
      badge: `+${unit.reachAdvantageBonus}`,
    });
  }

  return statuses;
};

const UnitCard: React.FC<{
  unit: CombatUnit;
  isActive: boolean;
  isHit: boolean;
  turnIndex: number;
  compactFontScale: number;
  isCompactLandscape: boolean;
  showDetail: boolean;
  dodgeDirection?: 'left' | 'right' | null;
}> = ({
  unit,
  isActive,
  isHit,
  turnIndex,
  compactFontScale,
  isCompactLandscape,
  showDetail,
  dodgeDirection = null
}) => {
  // 血量百分比和颜色（用 hex 避免 Android WebView 下 oklch/渐变不显示）
  const hpPercent = (unit.hp / unit.maxHp) * 100;
  const hpBarColor = hpPercent > 50 ? '#22c55e' : hpPercent > 25 ? '#eab308' : '#dc2626';

  // 护甲信息
  const armor = unit.equipment.armor;
  const armorPercent = armor ? (armor.durability / armor.maxDurability) * 100 : 0;

  // 头甲信息
  const helmet = unit.equipment.helmet;
  const helmetPercent = helmet ? (helmet.durability / helmet.maxDurability) * 100 : 0;

  // 武器信息
  const weapon = unit.equipment.mainHand;
  const weaponName = weapon?.name || '徒手';
  const weaponIcon = getWeaponIcon(weapon);
  const weaponDamageText = weapon?.damage ? `${weapon.damage[0]}-${weapon.damage[1]}` : '--';
  const weaponHitText = weapon?.hitChanceMod ? `${weapon.hitChanceMod > 0 ? '+' : ''}${weapon.hitChanceMod}` : '0';
  const weaponDurabilityText = weapon ? `${weapon.durability}/${weapon.maxDurability}` : '-';
  const isCrossbow = isCrossbowWeapon(weapon);
  const crossbowLoaded = unit.crossbowLoaded !== false;

  // 盾牌信息
  const shield = unit.equipment.offHand;
  const hasShield = shield?.type === 'SHIELD';
  const shieldDefenseText = hasShield && shield?.defenseBonus ? `${shield.defenseBonus}` : '0';
  const shieldDurabilityText = hasShield && shield ? `${shield.durability}/${shield.maxDurability}` : '-';

  // 获取类型名称
  const bgKey = unit.team === 'ENEMY' ? (unit.aiType || 'BANDIT') : unit.background;
  const typeName = unit.team === 'ENEMY' 
    ? (unit.aiType === 'BEAST' ? '野兽' : unit.aiType === 'ARMY' ? '军士' : unit.aiType === 'ARCHER' ? '弓手' : '贼寇')
    : (BACKGROUNDS[unit.background]?.name || unit.background);

  const isEnemy = unit.team === 'ENEMY';
  const displayStatuses = getUnitDisplayStatuses(unit);
  
  // 士气状态
  const moraleIcon = MORALE_ICONS[unit.morale];
  const moraleColor = MORALE_COLORS[unit.morale];
  const isFleeing = unit.morale === MoraleStatus.FLEEING;
  const cardWidth = Math.max(96, Math.round((showDetail ? 136 : 112) * compactFontScale));
  const iconCardMinWidth = showDetail ? '68px' : '32px';
  const iconCardMaxWidth = showDetail ? '96px' : '40px';

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
      className={`relative ${dodgeDirection === 'left' ? 'anim-dodge-left' : dodgeDirection === 'right' ? 'anim-dodge-right' : ''}`}
      style={{ width: `${cardWidth}px` }}
    >
      <div
        className={`absolute left-1/2 -translate-x-1/2 -top-3 px-1.5 py-0.5 rounded-full text-[8px] leading-none font-black z-30 border ${
          isActive
            ? 'bg-amber-500 border-amber-300 text-black'
            : 'bg-slate-800 border-slate-600 text-slate-200'
        }`}
        style={{ boxShadow: isActive ? '0 0 6px rgba(245,158,11,0.6)' : '0 1px 3px rgba(0,0,0,0.5)' }}
        title={isActive ? '当前行动' : `第${turnIndex + 1}个行动`}
      >
        {turnIndex + 1}
      </div>
      {/* 主卡片 */}
      <div
        className={`
          p-1 text-center font-mono relative overflow-hidden
          border-2 ${isEnemy ? 'border-red-600/80' : 'border-blue-500/80'}
          ${isActive ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-black scale-[1.03]' : ''}
          ${isFleeing ? 'opacity-70' : ''}
          ${isHit ? 'anim-hit-shake' : ''}
          transition-all duration-200
        `}
        style={{ ...cardStyle, width: `${cardWidth}px` }}
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
          className={`absolute top-0.5 right-0.5 ${showDetail ? 'text-[10px]' : 'text-[9px]'} drop-shadow-md`}
          style={{ color: moraleColor }}
          title={unit.morale}
        >
          {moraleIcon}
        </div>
        
        {/* 角色名字 - 小字副标题 */}
        <div
          className={`${showDetail ? 'text-[7px]' : 'text-[8px]'} truncate drop-shadow-sm mb-0.5 ${isEnemy ? 'text-red-300/70' : 'text-blue-300/70'}`}
          style={isCompactLandscape ? { fontSize: `${showDetail ? 7 : 8}px` } : undefined}
        >
          {unit.name.slice(0, showDetail ? 4 : 3)}{showDetail && typeName ? ` · ${typeName}` : ''}
        </div>

        {displayStatuses.length > 0 && (
          <div className={`flex flex-wrap justify-center gap-0.5 mb-0.5 ${showDetail ? 'min-h-[12px]' : 'min-h-[10px]'}`}>
            {displayStatuses.map(status => {
              const toneClass = status.tone === 'debuff'
                ? 'border-rose-600/70 bg-rose-950/60'
                : status.tone === 'utility'
                  ? 'border-slate-500/70 bg-slate-900/60'
                  : 'border-emerald-600/70 bg-emerald-950/60';
              return (
                <div
                  key={status.id}
                  className={`relative px-0.5 rounded border ${toneClass}`}
                  title={status.label}
                >
                  <RenderIcon icon={status.icon} className={showDetail ? 'text-[9px] leading-none' : 'text-[8px] leading-none'} />
                  {status.badge && (
                    <span className="absolute -top-1 -right-1 min-w-[10px] h-[10px] px-[1px] rounded-full bg-black/90 border border-amber-500/70 text-[6px] leading-[8px] text-amber-300 text-center font-bold">
                      {status.badge}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {showDetail && (
          <>
            {/* 头甲条 */}
            {helmet && (
              <div className="flex items-center gap-0.5 mb-0.5">
                <span className="text-[7px] text-slate-400 min-w-[10px] w-2.5 flex-shrink-0" style={{ display: 'inline-block', textAlign: 'center' }}>⛑</span>
                <div className="flex-1 min-w-[46px] h-[7px] rounded-sm overflow-hidden border border-black/50" style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)', backgroundColor: 'rgba(0,0,0,0.7)' }}>
                  <div className="h-full transition-all relative" style={{ width: `${helmetPercent}%`, background: 'linear-gradient(to right, #0e7490, #06b6d4)' }}>
                    <div className="absolute inset-0 h-1/2" style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.25), transparent)' }} />
                  </div>
                </div>
                <span className="text-[6px] text-cyan-300 font-bold w-8 text-right">{helmet.durability}/{helmet.maxDurability}</span>
              </div>
            )}

            {/* 体甲条 */}
            {armor && (
              <div className="flex items-center gap-0.5 mb-0.5">
                <span className="text-[7px] text-slate-400 min-w-[10px] w-2.5 flex-shrink-0" style={{ display: 'inline-block', textAlign: 'center' }}>🛡</span>
                <div className="flex-1 min-w-[46px] h-[7px] rounded-sm overflow-hidden border border-black/50" style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)', backgroundColor: 'rgba(0,0,0,0.7)' }}>
                  <div className="h-full transition-all relative" style={{ width: `${armorPercent}%`, background: 'linear-gradient(to right, #64748b, #cbd5e1)' }}>
                    <div className="absolute inset-0 h-1/2" style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.3), transparent)' }} />
                  </div>
                </div>
                <span className="text-[6px] text-slate-300 font-bold w-8 text-right">{armor.durability}/{armor.maxDurability}</span>
              </div>
            )}

            {/* HP条 */}
            <div className="flex items-center gap-0.5 mb-0.5">
              <span className="text-[7px] w-2.5 flex-shrink-0" style={{ color: hpBarColor }}>♥</span>
              <div className="flex-1 min-w-[46px] h-[8px] rounded-sm overflow-hidden border border-black/50" style={{ boxShadow: 'inset 0 2px 3px rgba(0,0,0,0.5)', backgroundColor: 'rgba(0,0,0,0.7)' }}>
                <div className="h-full transition-all relative" style={{ width: `${hpPercent}%`, backgroundColor: hpBarColor }}>
                  <div className="absolute inset-0 h-1/2" style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.2), transparent)' }} />
                </div>
              </div>
              <span className="text-[6px] font-bold w-8 text-right" style={{ color: hpBarColor }}>{unit.hp}/{unit.maxHp}</span>
            </div>
            <div className="text-[6px] text-amber-300/90 leading-none truncate mt-0.5">
              ⚔ {weaponName.slice(0, 6)} 伤害 {weaponDamageText}
            </div>
            {hasShield && (
              <div className="text-[6px] text-sky-300/90 leading-none truncate mt-0.5">
                🛡 格挡 {shieldDefenseText} 耐久 {shieldDurabilityText}
              </div>
            )}
          </>
        )}

        {/* 底部阴影边缘 */}
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-t from-black/40 to-transparent" />
      </div>

      {/* 武器子卡片 - 己方在右侧(面朝右), 敌方在左侧(面朝左) */}
      {!isFleeing && (
        <div
          className="absolute flex flex-col gap-0.5"
          style={isEnemy ? { 
            right: '100%', top: '42%', transform: 'translateY(-50%)', marginRight: showDetail ? '-5px' : '-3px'
          } : { 
            left: '100%', top: '42%', transform: 'translateY(-50%)', marginLeft: showDetail ? '-5px' : '-3px'
          }}
        >
          {/* 主手武器 */}
          <div
            className="px-1 py-0.5 text-center rounded-sm border border-amber-800/50 relative"
            style={{ 
              background: 'linear-gradient(180deg, rgba(60,40,20,0.95) 0%, rgba(40,25,10,0.98) 100%)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
              transform: isEnemy 
                ? `rotate(${hasShield ? '8deg' : '5deg'})` 
                : `rotate(${hasShield ? '-8deg' : '-5deg'})`,
              minWidth: iconCardMinWidth,
              maxWidth: iconCardMaxWidth,
            }}
          >
            {isCrossbow && (
              <div
                className="absolute -top-1 -right-1 text-[8px] leading-none bg-black/70 border border-amber-600/70 rounded-full w-3.5 h-3.5 flex items-center justify-center"
                title={crossbowLoaded ? '弩已装填' : '弩未装填'}
              >
                {crossbowLoaded ? '🟢' : '🔴'}
              </div>
            )}
            <div className={showDetail ? 'text-[10px] leading-none' : 'text-[8px] leading-none'}>
              <RenderIcon icon={weaponIcon} style={{ width: showDetail ? '30px' : '24px', height: showDetail ? '30px' : '24px' }} />
            </div>
            {showDetail && (
              <>
                <div className="text-[7px] text-amber-300 font-bold mt-0.5 leading-none break-words">{weaponName}</div>
                <div className="text-[6px] text-amber-400/90 leading-none mt-0.5">伤害 {weaponDamageText}</div>
                <div className="text-[6px] text-amber-400/90 leading-none mt-0.5">命中 {weaponHitText}</div>
                <div className="text-[6px] text-amber-400/90 leading-none mt-0.5">耐久 {weaponDurabilityText}</div>
                {isCrossbow && (
                  <div className={`text-[6px] leading-none mt-0.5 ${crossbowLoaded ? 'text-emerald-300' : 'text-rose-300'}`}>
                    装填 {crossbowLoaded ? '已装' : '未装'}
                  </div>
                )}
              </>
            )}
          </div>

          {/* 副手盾牌 */}
          {showDetail && hasShield && shield && (
            <div
              className="px-1 py-0.5 text-center rounded-sm border border-sky-800/50"
              style={{
                background: 'linear-gradient(180deg, rgba(20,40,60,0.95) 0%, rgba(10,25,40,0.98) 100%)',
                boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                transform: isEnemy ? 'rotate(-5deg)' : 'rotate(5deg)',
                minWidth: iconCardMinWidth,
                maxWidth: iconCardMaxWidth,
              }}
            >
              <div className="text-[10px] leading-none">
                <RenderIcon icon="/assets/icons/shield.png" style={{ width: '20px', height: '20px' }} />
              </div>
              <div className="text-[6px] text-sky-300/90 leading-none mt-0.5">格挡 {shieldDefenseText}</div>
              <div className="text-[6px] text-sky-300/90 leading-none mt-0.5">耐久 {shieldDurabilityText}</div>
            </div>
          )}
        </div>
      )}

      {/* 逃跑状态显示 */}
      {isFleeing && (
        <div 
          className="absolute left-1/2 -translate-x-1/2 text-[8px] text-red-400 font-bold animate-pulse whitespace-nowrap"
          style={{ top: '100%', marginTop: '-2px' }}
        >
          💨 逃跑中
        </div>
      )}
    </div>
  );
};

export const CombatView: React.FC<CombatViewProps> = ({ initialState, onCombatEnd, onTriggerTip }) => {
  const [state, setState] = useState(initialState);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const cameraRef = useRef({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.8);
  const [hoveredHex, setHoveredHex] = useState<{q:number, r:number} | null>(null);
  const hoveredHexRef = useRef<{q:number, r:number} | null>(null);
  const [pendingMoveHex, setPendingMoveHex] = useState<{q:number, r:number} | null>(null);
  const [selectedAbility, setSelectedAbility] = useState<Ability | null>(null);
  const [isRetreating, setIsRetreating] = useState(false);

  // ==================== 新增：战斗特效状态 ====================
  const [hitUnits, setHitUnits] = useState<Set<string>>(new Set());
  const [dodgingUnits, setDodgingUnits] = useState<Map<string, 'left' | 'right'>>(new Map());
  const [screenShake, setScreenShake] = useState<'none' | 'light' | 'heavy'>('none');
  const [combatLogEntries, setCombatLogEntries] = useState<CombatLogEntry[]>([]);
  const [centerBanner, setCenterBanner] = useState<CenterBanner | null>(null);
  const [isCombatLogCollapsed, setIsCombatLogCollapsed] = useState(false);
  const [isStatsPanelCollapsed, setIsStatsPanelCollapsed] = useState(false);
  const [isSkillsPanelCollapsed, setIsSkillsPanelCollapsed] = useState(false);
  const attackLinesRef = useRef<AttackLineEffect[]>([]);
  const deathEffectsRef = useRef<DeathEffect[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const unitRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  // 单位动画位置（世界坐标），用于平滑移动
  const animPosRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // ==================== 移动端触控支持 ====================
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [isCompactLandscape, setIsCompactLandscape] = useState(false);
  const [compactFontScale, setCompactFontScale] = useState(1);
  const [showUnitDetail, setShowUnitDetail] = useState(false);
  const [showChaseChoice, setShowChaseChoice] = useState(false);
  const isMobile = isMobileLayout;
  // 触控相关 refs（避免高频 re-render）
  const touchStartRef = useRef<{ x: number; y: number; time: number }>({ x: 0, y: 0, time: 0 });
  const touchStartCameraRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isTouchDraggingRef = useRef(false);
  const touchMovedDistRef = useRef(0);
  // 双指缩放 refs
  const pinchStartDistRef = useRef(0);
  const pinchStartZoomRef = useRef(0.8);
  const isPinchingRef = useRef(false);
  const pinchMidpointRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  // 移动端攻击确认状态
  const [mobileAttackTarget, setMobileAttackTarget] = useState<{
    unit: CombatUnit;
    hitBreakdown: ReturnType<typeof calculateHitChance>;
    ability: Ability;
  } | null>(null);
  const lastSelfSkillClickRef = useRef<{ skillId: string; time: number } | null>(null);
  const lastTurnActionClickRef = useRef<{ action: 'wait' | 'end' | 'retreat'; time: number } | null>(null);
  const chaseChoiceHandledRef = useRef(false);

  const isWaitAbility = (ability: Ability) =>
    ability.id === 'WAIT' ||
    ability.name === '等待' ||
    ability.icon === '⏳' ||
    ability.description.includes('推迟行动顺序');

  const requireDoubleClickForTurnAction = (action: 'wait' | 'end' | 'retreat', onConfirm: () => void) => {
    const now = Date.now();
    const last = lastTurnActionClickRef.current;
    const isDoubleClick = !!last && last.action === action && now - last.time <= 420;
    lastTurnActionClickRef.current = { action, time: now };
    if (!isDoubleClick) {
      const actionText = action === 'wait' ? '等待' : action === 'end' ? '结束回合' : '撤退';
      addToLog(`再次点击${actionText}以确认`, 'info');
      return;
    }
    onConfirm();
  };

  // 推撞属于特殊攻击技能：虽然在数据里是 SKILL，但需要走攻击命中率与目标确认流程。
  const isAttackLikeAbility = (ability: Ability | null | undefined): ability is Ability =>
    !!ability && (ability.type === 'ATTACK' || ability.id === 'KNOCK_BACK');

  const activeUnit = state.units.find(u => u.id === state.turnOrder[state.currentUnitIndex]);
  const isPlayerTurn = activeUnit?.team === 'PLAYER';
  const movePreviewHex = pendingMoveHex ?? hoveredHex;
  const movePreviewHexKey = movePreviewHex ? `${movePreviewHex.q},${movePreviewHex.r}` : null;

  // 地形类型定义 - 带高度、颜色、移动消耗和战斗修正（对齐战场兄弟）
  const TERRAIN_TYPES = {
    PLAINS: {
      baseColor: '#4a6b30',
      lightColor: '#5c8040',
      darkColor: '#385220',
      height: 0,
      name: '平原',
      moveCost: 2, passable: true,
      rangedDefMod: 0, meleeDefMod: 0, meleeAtkMod: 0,
      description: '',
    },
    FOREST: {
      baseColor: '#1a4a20',
      lightColor: '#2a5c2a',
      darkColor: '#0f3510',
      height: 1,
      name: '森林',
      moveCost: 3, passable: true,
      rangedDefMod: 0, meleeDefMod: 0, meleeAtkMod: 0,
      description: '移动消耗增加',
    },
    MOUNTAIN: {
      baseColor: '#606068',
      lightColor: '#75757e',
      darkColor: '#404048',
      height: 3,
      name: '山地',
      moveCost: 0, passable: false,
      rangedDefMod: 0, meleeDefMod: 0, meleeAtkMod: 0,
      description: '不可通行',
    },
    HILLS: {
      baseColor: '#7a6842',
      lightColor: '#8d7d55',
      darkColor: '#5a4c2a',
      height: 2,
      name: '丘陵',
      moveCost: 3, passable: true,
      rangedDefMod: 0, meleeDefMod: 0, meleeAtkMod: 0,
      description: '移动消耗增加',
    },
    SWAMP: {
      baseColor: '#2a4540',
      lightColor: '#3a5855',
      darkColor: '#1a3530',
      height: -1,
      name: '沼泽',
      moveCost: 4, passable: true,
      rangedDefMod: -10, meleeDefMod: -15, meleeAtkMod: -10,
      description: '近战攻击-10, 近战防御-15, 远程防御-10',
    },
    SNOW: {
      baseColor: '#c8d5e0',
      lightColor: '#dce6ef',
      darkColor: '#9aabb8',
      height: 0,
      name: '雪原',
      moveCost: 3, passable: true,
      rangedDefMod: 0, meleeDefMod: 0, meleeAtkMod: 0,
      description: '移动消耗增加',
    },
    DESERT: {
      baseColor: '#c09050',
      lightColor: '#d4a868',
      darkColor: '#906830',
      height: 0,
      name: '荒漠',
      moveCost: 3, passable: true,
      rangedDefMod: 0, meleeDefMod: 0, meleeAtkMod: 0,
      description: '移动消耗增加',
    },
  };

  // 预生成地形数据 - 基于世界地形类型和随机种子
  const gridRange = 15;

  // 每次战斗使用随机种子
  const combatSeed = useMemo(() => Math.floor(Math.random() * 100000), []);

  // 根据世界地形确定战斗地图的生物群落配置
  type CombatTerrainType = keyof typeof TERRAIN_TYPES;
  interface BiomeConfig {
    primary: CombatTerrainType;
    secondary: CombatTerrainType;
    tertiary: CombatTerrainType;
    rare: CombatTerrainType;
    thresholds: [number, number, number];
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

    const hash = (x: number, y: number, seed: number): number => {
      let h = seed + x * 374761393 + y * 668265263;
      h = (h ^ (h >> 13)) * 1274126177;
      h = h ^ (h >> 16);
      return (h & 0x7fffffff) / 0x7fffffff;
    };

    const smoothNoise = (q: number, r: number, scale: number, seed: number): number => {
      const sq = q * scale, sr = r * scale;
      const q0 = Math.floor(sq), r0 = Math.floor(sr);
      const fq = sq - q0, fr = sr - r0;
      const v00 = hash(q0, r0, seed);
      const v10 = hash(q0 + 1, r0, seed);
      const v01 = hash(q0, r0 + 1, seed);
      const v11 = hash(q0 + 1, r0 + 1, seed);
      const top = v00 * (1 - fq) + v10 * fq;
      const bot = v01 * (1 - fq) + v11 * fq;
      return top * (1 - fr) + bot * fr;
    };

    const combinedNoise = (q: number, r: number): number => {
      const n1 = smoothNoise(q, r, 0.15, combatSeed) * 0.5;
      const n2 = smoothNoise(q, r, 0.3, combatSeed + 1000) * 0.3;
      const n3 = smoothNoise(q, r, 0.6, combatSeed + 2000) * 0.2;
      return (n1 + n2 + n3) * 2 - 1;
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

        // 部署区域保护：部署区域内不生成不可通行地形
        if (!TERRAIN_TYPES[type].passable) {
          const inPlayerZone = q >= -6 && q <= -1 && r >= -5 && r <= 5;
          const inEnemyZone = q >= 3 && q <= 8 && r >= -5 && r <= 5;
          if (inPlayerZone || inEnemyZone) {
            type = biomeConfig.primary;
          }
        }

        data.set(`${q},${r}`, {
          type,
          height: TERRAIN_TYPES[type].height
        });
      }
    }
    return data;
  }, [combatSeed, biomeConfig]);

  const buildBlockedHexSet = useCallback((
    units: CombatUnit[],
    movingUnitId: string,
    movingTeam: CombatUnit['team'],
    tData?: Map<string, { type: CombatTerrainType; height: number }>
  ): Set<string> => {
    const blocked = new Set<string>();
    units.forEach(u => {
      if (u.isDead || u.hasEscaped || u.id === movingUnitId) return;
      // 允许穿过己方单位，但不能穿过敌方单位。
      if (u.team === movingTeam) return;
      blocked.add(`${u.combatPos.q},${u.combatPos.r}`);
    });
    // 不可通行地形也加入阻挡集合
    if (tData) {
      tData.forEach((data, key) => {
        if (!TERRAIN_TYPES[data.type as CombatTerrainType].passable) {
          blocked.add(key);
        }
      });
    }
    return blocked;
  }, []);

  const getMaxMoveSteps = useCallback((unit: CombatUnit, currentAP: number, currentFatigue: number): number => {
    const remainingFatigue = unit.maxFatigue - currentFatigue;
    if (currentAP < 2 || remainingFatigue <= 0) return 0;
    // 返回 AP 作为移动预算，Dijkstra 按地形消耗扣减
    return currentAP;
  }, []);

  const isPathHexInBounds = useCallback((pos: HexPos) => {
    const range = gridRange;
    const { q, r } = pos;
    if (q < -range || q > range) return false;
    const minR = Math.max(-range, -q - range);
    const maxR = Math.min(range, -q + range);
    return r >= minR && r <= maxR;
  }, []);

  const findPathWithinSteps = useCallback((
    start: HexPos,
    target: HexPos,
    blockedHexes: Set<string>,
    maxAP: number,
    tData?: Map<string, { type: string; height: number }>,
    pathfinderPerk: boolean = false,
    allowPartial: boolean = false,
    allyOccupiedHexes?: Set<string>
  ): HexPos[] | null => {
    if (maxAP < 2) return null;
    const startKey = `${start.q},${start.r}`;
    const targetKey = `${target.q},${target.r}`;
    if (startKey === targetKey) return [];
    if (blockedHexes.has(targetKey) && !allowPartial) return null;
    if (!isPathHexInBounds(target) && !allowPartial) return null;

    // Dijkstra：按累计 AP 成本寻路
    const costMap = new Map<string, number>();
    costMap.set(startKey, 0);
    const parent = new Map<string, string>();
    // 简单优先队列（数组+排序，格子数量有限足够高效）
    const queue: Array<{ pos: HexPos; cost: number }> = [{ pos: start, cost: 0 }];

    while (queue.length > 0) {
      queue.sort((a, b) => a.cost - b.cost);
      const current = queue.shift()!;
      const currentKey = `${current.pos.q},${current.pos.r}`;

      // 如果当前成本已超过记录的最优，跳过
      if (current.cost > (costMap.get(currentKey) ?? Infinity)) continue;

      if (currentKey === targetKey) {
        // 回溯路径
        const path: HexPos[] = [];
        let traceKey = targetKey;
        while (traceKey !== startKey) {
          const [q, r] = traceKey.split(',').map(Number);
          path.push({ q, r });
          const prevKey = parent.get(traceKey);
          if (!prevKey) break;
          traceKey = prevKey;
        }
        path.reverse();
        return path;
      }

      const neighbors = getHexNeighbors(current.pos.q, current.pos.r);
      for (const next of neighbors) {
        const nextKey = `${next.q},${next.r}`;
        if (blockedHexes.has(nextKey)) continue;
        if (!isPathHexInBounds(next)) continue;

        // 获取目标格的移动消耗
        let tileCost = 2; // 默认平原消耗
        if (tData) {
          const td = tData.get(nextKey);
          if (td) {
            const terrainDef = (TERRAIN_TYPES as Record<string, { moveCost: number; passable: boolean }>)[td.type];
            if (terrainDef && !terrainDef.passable) continue;
            if (terrainDef) tileCost = terrainDef.moveCost;
          }
        }
        if (pathfinderPerk) tileCost = 2; // 识途天赋：所有地形2AP

        const newCost = current.cost + tileCost;
        if (newCost > maxAP) continue;

        const prevCost = costMap.get(nextKey);
        if (prevCost === undefined || newCost < prevCost) {
          costMap.set(nextKey, newCost);
          parent.set(nextKey, currentKey);
          queue.push({ pos: next, cost: newCost });
        }
      }
    }

    // 部分路径模式：无法到达目标时，寻找 AP 预算内离目标最近的可达格
    if (allowPartial && costMap.size > 1) {
      let bestKey = '';
      let bestDist = Infinity;
      for (const [key] of costMap) {
        if (key === startKey) continue;
        // 跳过被友方单位占据的格子（可以途经但不能作为终点）
        if (allyOccupiedHexes && allyOccupiedHexes.has(key)) continue;
        const [q, r] = key.split(',').map(Number);
        const dist = getHexDistance({ q, r }, target);
        if (dist < bestDist) {
          bestDist = dist;
          bestKey = key;
        }
      }
      if (bestKey) {
        const path: HexPos[] = [];
        let traceKey = bestKey;
        while (traceKey !== startKey) {
          const [q, r] = traceKey.split(',').map(Number);
          path.push({ q, r });
          const prevKey = parent.get(traceKey);
          if (!prevKey) break;
          traceKey = prevKey;
        }
        path.reverse();
        if (path.length > 0) return path;
      }
    }

    return null;
  }, [isPathHexInBounds]);

  const evaluateMovePathOutcome = useCallback((unit: CombatUnit, path: HexPos[], liveUnits?: CombatUnit[]) => {
    let cursor = unit.combatPos;
    let stepsMoved = 0;
    let enteredEnemyZoC = false;
    let threateningEnemies: CombatUnit[] = [];

    // 使用传入的最新单位列表（AI回合内state可能过期），否则使用state中的单位
    const unitsSnapshot = liveUnits || state.units;

    // 检查某个位置是否被任何其他活着的单位占据（不能停留在已有单位的格子上）
    const isOccupiedByOther = (pos: HexPos) => unitsSnapshot.some(u =>
      !u.isDead && !u.hasEscaped && u.id !== unit.id &&
      u.combatPos.q === pos.q && u.combatPos.r === pos.r
    );

    // 记录最后一个未被占据的安全停留位置
    let lastSafePos = unit.combatPos;
    let lastSafeSteps = 0;

    for (const step of path) {
      const enterCheck = checkZoCEnterOnStep(unit, cursor, step, state);
      cursor = step;
      stepsMoved += 1;

      if (!isOccupiedByOther(step)) {
        lastSafePos = step;
        lastSafeSteps = stepsMoved;
      }

      if (enterCheck.enteringEnemyZoC) {
        enteredEnemyZoC = true;
        threateningEnemies = enterCheck.threateningEnemies;
        break;
      }
    }

    // 如果最终停留位置被其他单位占据，回退到最后一个安全位置
    if (stepsMoved > 0 && isOccupiedByOther(cursor)) {
      cursor = lastSafePos;
      stepsMoved = lastSafeSteps;
      // 回退后已不在原ZoC进入点，取消ZoC进入状态
      enteredEnemyZoC = false;
      threateningEnemies = [];
    }

    return {
      finalPos: cursor,
      stepsMoved,
      enteredEnemyZoC,
      threateningEnemies,
    };
  }, [state]);

  // 从路径提取每格地形移动消耗
  const getPathTerrainCosts = useCallback((path: HexPos[], tData: Map<string, { type: string; height: number }>): number[] => {
    return path.map(p => {
      const td = tData.get(`${p.q},${p.r}`);
      if (td) {
        const terrainDef = (TERRAIN_TYPES as Record<string, { moveCost: number }>)[td.type];
        if (terrainDef) return terrainDef.moveCost;
      }
      return 2; // 默认平原
    });
  }, []);

  // 获取攻击者和目标位置的地形战斗修正
  const getTerrainCombatMods = useCallback((
    atkPos: { q: number; r: number },
    defPos: { q: number; r: number },
    tData: Map<string, { type: string; height: number }>
  ) => {
    const atkTd = tData.get(`${atkPos.q},${atkPos.r}`);
    const defTd = tData.get(`${defPos.q},${defPos.r}`);
    const atkTerrain = atkTd ? (TERRAIN_TYPES as Record<string, { meleeAtkMod: number; meleeDefMod: number; rangedDefMod: number }>)[atkTd.type] : null;
    const defTerrain = defTd ? (TERRAIN_TYPES as Record<string, { meleeAtkMod: number; meleeDefMod: number; rangedDefMod: number }>)[defTd.type] : null;
    return {
      atkMeleeAtkMod: atkTerrain?.meleeAtkMod || 0,
      defRangedDefMod: defTerrain?.rangedDefMod || 0,
      defMeleeDefMod: defTerrain?.meleeDefMod || 0,
    };
  }, []);

  const movePreviewPath = useMemo(() => {
    if (!activeUnit || !isPlayerTurn || selectedAbility || !movePreviewHex || !movePreviewHexKey) return null;

    const blocked = buildBlockedHexSet(state.units, activeUnit.id, activeUnit.team, terrainData);
    const maxSteps = getMaxMoveSteps(activeUnit, activeUnit.currentAP, activeUnit.fatigue);
    return findPathWithinSteps(activeUnit.combatPos, movePreviewHex, blocked, maxSteps, terrainData, hasPerk(activeUnit, 'pathfinder'));
  }, [
    activeUnit,
    isPlayerTurn,
    selectedAbility,
    movePreviewHex,
    movePreviewHexKey,
    state.units,
    buildBlockedHexSet,
    getMaxMoveSteps,
    findPathWithinSteps,
  ]);

  const movePreviewOutcome = useMemo(() => {
    if (!activeUnit || !movePreviewPath) return null;
    return evaluateMovePathOutcome(activeUnit, movePreviewPath);
  }, [activeUnit, movePreviewPath, evaluateMovePathOutcome]);

  const effectiveMovePreviewPath = useMemo(() => {
    if (!movePreviewPath || !movePreviewOutcome) return movePreviewPath;
    return movePreviewPath.slice(0, movePreviewOutcome.stepsMoved);
  }, [movePreviewPath, movePreviewOutcome]);

  const movePreviewPathSet = useMemo(() => {
    const set = new Set<string>();
    if (!effectiveMovePreviewPath) return set;
    effectiveMovePreviewPath.forEach(p => set.add(`${p.q},${p.r}`));
    return set;
  }, [effectiveMovePreviewPath]);

  // ==================== 底栏操作预览消耗计算 ====================
  const previewCosts = useMemo(() => {
    if (!activeUnit || !isPlayerTurn) return null;

    // 选中技能时显示技能消耗
    if (selectedAbility && selectedAbility.id !== 'MOVE') {
      let apCost = selectedAbility.apCost || 4;
      let fatigueCost = selectedAbility.fatCost || 0;

      const masteryEffects = getWeaponMasteryEffects(activeUnit);
      if (masteryEffects.reducedApCost) {
        apCost = Math.min(apCost, masteryEffects.reducedApCost);
      }
      if (masteryEffects.daggerReducedAp && selectedAbility.type === 'ATTACK') {
        apCost = Math.min(apCost, masteryEffects.daggerReducedAp);
      }
      const fatigueMult = getWeaponMasteryFatigueMultiplier(activeUnit);
      fatigueCost = Math.floor(fatigueCost * fatigueMult);

      return { apCost, fatigueCost };
    }

    // 未选技能时显示移动消耗（基于预览路径的实际可移动步数和地形消耗）
    if (movePreviewOutcome && movePreviewOutcome.stepsMoved > 0 && effectiveMovePreviewPath) {
        const tileCosts = getPathTerrainCosts(effectiveMovePreviewPath, terrainData);
        const moveCost = getPathMoveCost(tileCosts, hasPerk(activeUnit, 'pathfinder'));
        return { apCost: moveCost.apCost, fatigueCost: moveCost.fatigueCost };
    }

    return null;
  }, [activeUnit, isPlayerTurn, selectedAbility, movePreviewOutcome, effectiveMovePreviewPath, getPathTerrainCosts]);

  useEffect(() => {
    // 回合切换/模式切换时清空待确认移动，避免误触二次确认。
    setPendingMoveHex(null);
  }, [activeUnit?.id, selectedAbility?.id, isPlayerTurn]);

  // ==================== 玩法提示触发 ====================
  const tipPrevUnitsRef = useRef(state.units);
  const tipFirstAttackFired = useRef(false);

  useEffect(() => {
    const prev = tipPrevUnitsRef.current;
    const curr = state.units;

    for (const unit of curr) {
      if (unit.team !== 'PLAYER' || unit.isDead) continue;
      const prevUnit = prev.find(u => u.id === unit.id);
      if (!prevUnit) continue;

      // 首次攻击检测（玩家单位AP减少 = 执行了动作）
      if (!tipFirstAttackFired.current && prevUnit.currentAP > unit.currentAP && state.round >= 1) {
        tipFirstAttackFired.current = true;
        onTriggerTip?.('combat_first_attack');
      }

      // 护甲跌破50%
      const armor = unit.equipment.armor;
      const prevArmor = prevUnit.equipment.armor;
      if (armor && prevArmor && armor.maxDurability > 0) {
        if (prevArmor.durability >= prevArmor.maxDurability * 0.5 && armor.durability < armor.maxDurability * 0.5) {
          onTriggerTip?.('combat_armor_break');
        }
      }

      // 士气下降
      if ((prevUnit.morale === MoraleStatus.STEADY || prevUnit.morale === MoraleStatus.CONFIDENT) &&
          (unit.morale !== MoraleStatus.STEADY && unit.morale !== MoraleStatus.CONFIDENT)) {
        onTriggerTip?.('combat_morale_change');
      }
    }

    tipPrevUnitsRef.current = curr;
  }, [state.units]);

  // 行动力耗尽提示
  useEffect(() => {
    if (activeUnit && activeUnit.team === 'PLAYER' && activeUnit.currentAP === 0) {
      onTriggerTip?.('combat_ap_zero');
    }
  }, [state.currentUnitIndex, activeUnit?.currentAP]);

  // 移动端检测：统一触屏横屏规则 + DPR 归一化缩放
  useEffect(() => {
    const detect = () => {
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
      const isLandscape = viewportWidth > viewportHeight;
      const compactLandscape = coarsePointer && isLandscape;
      const shortest = Math.min(viewportWidth, viewportHeight);
      const dpr = window.devicePixelRatio || 1;
      const BASELINE_DPR = 1.7;
      const scale = Math.max(0.58, Math.min(1.08, (shortest / 440) * (BASELINE_DPR / dpr)));
      setIsMobileLayout(coarsePointer || viewportWidth < 1024);
      setIsCompactLandscape(compactLandscape);
      setCompactFontScale(scale);
    };
    detect();
    window.addEventListener('resize', detect);
    window.visualViewport?.addEventListener('resize', detect);
    return () => {
      window.removeEventListener('resize', detect);
      window.visualViewport?.removeEventListener('resize', detect);
    };
  }, []);

  // 切换技能或活动单位时，清除移动端攻击确认面板
  useEffect(() => { setMobileAttackTarget(null); }, [selectedAbility, activeUnit?.id]);

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

  /** 触发闪避位移（未命中反馈） */
  const triggerDodgeEffect = useCallback((targetUnitId: string, attackerPos: { q: number; r: number }, targetPos: { q: number; r: number }) => {
    const direction: 'left' | 'right' = attackerPos.q <= targetPos.q ? 'right' : 'left';
    setDodgingUnits(prev => {
      const next = new Map(prev);
      next.set(targetUnitId, direction);
      return next;
    });
    setTimeout(() => {
      setDodgingUnits(prev => {
        if (!prev.has(targetUnitId)) return prev;
        const next = new Map(prev);
        next.delete(targetUnitId);
        return next;
      });
    }, 320);
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

  const renderBannerIcon = (icon: string) => {
    return <RenderIcon icon={icon} style={{ fontSize: '1.5rem', width: '32px', height: '32px' }} />;
  };

  /** 统一处理“行动点不足”提示：日志 + 横幅（无震屏） */
  const showInsufficientActionPoints = useCallback((ability: Ability, unit = activeUnit) => {
    if (!unit) return;
    const required = ability.apCost ?? 0;
    const current = unit.currentAP ?? 0;
    addToLog(`行动点不足！${ability.name} 需要 ${required} 点，当前仅 ${current} 点。`, 'info');
    showCenterBanner(`行动点不足 ${current}/${required}`, '#ef4444', '⚠️');
  }, [activeUnit, showCenterBanner]);

  const getRemainingFatigue = useCallback((unit: CombatUnit): number => {
    return Math.max(0, unit.maxFatigue - unit.fatigue);
  }, []);

  const getEffectiveFatigueCost = useCallback((unit: CombatUnit, ability: Ability): number => {
    const baseFatigue = ability.fatCost || 0;
    if (baseFatigue <= 0) return 0;
    if (ability.type === 'ATTACK') {
      const fatigueMult = getWeaponMasteryFatigueMultiplier(unit);
      return Math.floor(baseFatigue * fatigueMult);
    }
    return baseFatigue;
  }, []);

  /** 统一处理“疲劳不足”提示：日志 + 横幅 + 轻微震屏 */
  const showInsufficientFatigue = useCallback((actionName: string, required: number, unit = activeUnit) => {
    if (!unit) return;
    const remaining = Math.max(0, unit.maxFatigue - unit.fatigue);
    addToLog(`疲劳不足！${actionName} 需要 ${required} 点，当前仅剩 ${remaining} 点。`, 'info');
    showCenterBanner(`疲劳不足 ${remaining}/${required}`, '#3b82f6', '💨');
    triggerScreenShake('light');
  }, [activeUnit, showCenterBanner, triggerScreenShake]);

  // --- 风格常量 ---
  const HEX_SIZE = 45;
  const HEX_GAP = 2;
  const HEIGHT_MULTIPLIER = 8; // 高度差乘数，增加立体感

  const COLOR_FOG = "#080808";

  const getPixelPos = (q: number, r: number) => {
    const x = HEX_SIZE * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
    const y = HEX_SIZE * (1.5 * r);
    return { x, y };
  };

  const isHexInBounds = useCallback((pos: { q: number; r: number }) => {
    const { q, r } = pos;
    if (q < -gridRange || q > gridRange) return false;
    const minR = Math.max(-gridRange, -q - gridRange);
    const maxR = Math.min(gridRange, -q + gridRange);
    return r >= minR && r <= maxR;
  }, []);

  const isEdgeHex = useCallback((pos: { q: number; r: number }) => {
    if (!isHexInBounds(pos)) return false;
    const { q, r } = pos;
    const minR = Math.max(-gridRange, -q - gridRange);
    const maxR = Math.min(gridRange, -q + gridRange);
    return q === -gridRange || q === gridRange || r === minR || r === maxR;
  }, [isHexInBounds]);

  // 视野计算 - 战斗中使用更大的视野范围
  const visibleSet = useMemo(() => {
    const set = new Set<string>();
    state.units.filter(u => u.team === 'PLAYER' && !u.isDead && !u.hasEscaped).forEach(u => {
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

  // --- 预渲染地形纹理到离屏 canvas ---
  const VARIANT_COUNT = 3;
  const terrainTextures = useMemo(() => {
    const textures = new Map<string, HTMLCanvasElement>();
    const hexEffectiveSize = HEX_SIZE - HEX_GAP;
    const texW = Math.ceil(hexEffectiveSize * 2) + 4;
    const texH = Math.ceil(hexEffectiveSize * 2) + 4;

    // 确定性伪随机
    const seededRandom = (seed: number) => {
      let s = seed;
      return () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
      };
    };

    // 在离屏 canvas 上绘制六边形 clip 路径
    const drawHexClip = (c: CanvasRenderingContext2D, cx: number, cy: number, size: number) => {
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 180) * (60 * i + 30);
        const px = cx + Math.cos(angle) * size;
        const py = cy + Math.sin(angle) * size;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.closePath();
    };

    const terrainKeys = ['PLAINS', 'FOREST', 'HILLS', 'MOUNTAIN', 'SWAMP', 'SNOW', 'DESERT'] as const;

    terrainKeys.forEach((type, typeIdx) => {
      for (let v = 0; v < VARIANT_COUNT; v++) {
        const offCanvas = document.createElement('canvas');
        offCanvas.width = texW;
        offCanvas.height = texH;
        const c = offCanvas.getContext('2d')!;
        const cx = texW / 2;
        const cy = texH / 2;

        // 先 clip 六边形区域
        c.save();
        drawHexClip(c, cx, cy, hexEffectiveSize);
        c.clip();

        const rand = seededRandom(combatSeed + typeIdx * 999 + v * 77);

        switch (type) {
          case 'PLAINS': {
            // 草叶纹理
            for (let i = 0; i < 12; i++) {
              const gx = cx + (rand() - 0.5) * hexEffectiveSize * 1.4;
              const gy = cy + (rand() - 0.5) * hexEffectiveSize * 1.2;
              const bladeCount = 2 + Math.floor(rand() * 2);
              for (let b = 0; b < bladeCount; b++) {
                c.strokeStyle = `rgba(80, 145, 50, ${0.3 + rand() * 0.25})`;
                c.lineWidth = 1;
                c.beginPath();
                c.moveTo(gx + (rand() - 0.5) * 3, gy);
                c.quadraticCurveTo(
                  gx + (rand() - 0.5) * 6, gy - 5 - rand() * 4,
                  gx + (rand() - 0.5) * 5, gy - 9 - rand() * 5
                );
                c.stroke();
              }
            }
            break;
          }
          case 'FOREST': {
            // 树冠纹理
            const trees = [
              { tx: cx, ty: cy + 2, scale: 1.0 },
              { tx: cx - 11 + rand() * 4, ty: cy + 6, scale: 0.7 },
              { tx: cx + 9 + rand() * 4, ty: cy + 5, scale: 0.8 },
            ];
            trees.forEach(({ tx, ty, scale }) => {
              // 树冠
              c.fillStyle = `rgba(30, 105, 40, ${0.45 + rand() * 0.2})`;
              c.beginPath();
              c.moveTo(tx, ty - 13 * scale);
              c.lineTo(tx - 7 * scale, ty + 1);
              c.lineTo(tx + 7 * scale, ty + 1);
              c.closePath();
              c.fill();
              // 高光侧
              c.fillStyle = `rgba(60, 145, 65, 0.25)`;
              c.beginPath();
              c.moveTo(tx, ty - 13 * scale);
              c.lineTo(tx + 3.5 * scale, ty - 5 * scale);
              c.lineTo(tx + 7 * scale, ty + 1);
              c.closePath();
              c.fill();
              // 树干
              c.fillStyle = `rgba(85, 60, 30, 0.45)`;
              c.fillRect(tx - 1.5 * scale, ty + 1, 3 * scale, 4 * scale);
            });
            break;
          }
          case 'HILLS': {
            // 等高线弧形
            for (let i = 0; i < 3; i++) {
              const offsetY = -8 + i * 8;
              c.strokeStyle = `rgba(120, 100, 60, ${0.3 + rand() * 0.15})`;
              c.lineWidth = 1.5;
              c.beginPath();
              c.arc(cx + (i % 2 === 0 ? -3 : 3), cy + offsetY + 10, 17 - i * 3, Math.PI * 1.1, Math.PI * 1.9);
              c.stroke();
            }
            // 顶部山丘轮廓
            c.strokeStyle = 'rgba(140, 115, 70, 0.3)';
            c.lineWidth = 2;
            c.beginPath();
            c.arc(cx, cy + 8, 14, Math.PI * 1.15, Math.PI * 1.85);
            c.stroke();
            break;
          }
          case 'MOUNTAIN': {
            // 主峰
            c.fillStyle = 'rgba(100, 100, 115, 0.55)';
            c.beginPath();
            c.moveTo(cx, cy - 14);
            c.lineTo(cx - 13, cy + 8);
            c.lineTo(cx + 13, cy + 8);
            c.closePath();
            c.fill();
            // 雪顶
            c.fillStyle = 'rgba(225, 235, 245, 0.5)';
            c.beginPath();
            c.moveTo(cx, cy - 14);
            c.lineTo(cx - 5, cy - 5);
            c.lineTo(cx + 5, cy - 5);
            c.closePath();
            c.fill();
            // 副峰
            c.fillStyle = 'rgba(85, 85, 100, 0.4)';
            c.beginPath();
            c.moveTo(cx - 9, cy - 5);
            c.lineTo(cx - 18, cy + 8);
            c.lineTo(cx, cy + 8);
            c.closePath();
            c.fill();
            break;
          }
          case 'SWAMP': {
            // 水波纹
            c.strokeStyle = 'rgba(70, 145, 125, 0.3)';
            c.lineWidth = 1.2;
            for (let row = 0; row < 3; row++) {
              const baseY = cy - 6 + row * 8;
              c.beginPath();
              for (let px = -18; px <= 18; px += 2) {
                const py = baseY + Math.sin(px * 0.4 + row + v) * 2.5;
                if (px === -18) c.moveTo(cx + px, py);
                else c.lineTo(cx + px, py);
              }
              c.stroke();
            }
            // 芦苇
            const reeds = [-7 + rand() * 2, 3 + rand() * 2, 11 + rand() * 2];
            reeds.forEach(rx => {
              c.strokeStyle = 'rgba(65, 110, 85, 0.4)';
              c.lineWidth = 1.5;
              c.beginPath();
              c.moveTo(cx + rx, cy + 8);
              c.lineTo(cx + rx, cy - 3);
              c.stroke();
              // 芦苇头
              c.fillStyle = 'rgba(95, 75, 50, 0.4)';
              c.beginPath();
              c.ellipse(cx + rx, cy - 5, 1.5, 3.5, 0, 0, Math.PI * 2);
              c.fill();
            });
            break;
          }
          case 'SNOW': {
            // 雪花图案
            const snowflakes = [
              { sx: cx, sy: cy - 2, r: 8 },
              { sx: cx - 11 + rand() * 4, sy: cy + 7, r: 5 },
              { sx: cx + 10 + rand() * 3, sy: cy + 5, r: 6 },
            ];
            snowflakes.forEach(({ sx, sy, r }) => {
              c.strokeStyle = `rgba(160, 185, 220, ${0.3 + rand() * 0.15})`;
              c.lineWidth = 1;
              for (let a = 0; a < 3; a++) {
                const angle = (a * Math.PI) / 3;
                const dx = Math.cos(angle) * r;
                const dy = Math.sin(angle) * r;
                c.beginPath();
                c.moveTo(sx - dx, sy - dy);
                c.lineTo(sx + dx, sy + dy);
                c.stroke();
                // 分支
                const bx = Math.cos(angle) * r * 0.55;
                const by = Math.sin(angle) * r * 0.55;
                const branchAngle = angle + Math.PI / 4;
                const br = r * 0.35;
                c.beginPath();
                c.moveTo(sx + bx, sy + by);
                c.lineTo(sx + bx + Math.cos(branchAngle) * br, sy + by + Math.sin(branchAngle) * br);
                c.stroke();
              }
            });
            break;
          }
          case 'DESERT': {
            // 沙丘弧线
            c.strokeStyle = 'rgba(165, 125, 65, 0.3)';
            c.lineWidth = 1.5;
            for (let row = 0; row < 3; row++) {
              const baseY = cy - 8 + row * 9;
              c.beginPath();
              c.arc(cx + (row % 2 === 0 ? -5 : 5), baseY + 12, 20, Math.PI * 1.2, Math.PI * 1.8);
              c.stroke();
            }
            // 仙人掌
            c.strokeStyle = 'rgba(80, 135, 60, 0.4)';
            c.lineWidth = 2;
            c.lineCap = 'round';
            // 主干
            c.beginPath();
            c.moveTo(cx, cy + 6);
            c.lineTo(cx, cy - 6);
            c.stroke();
            // 左臂
            c.beginPath();
            c.moveTo(cx, cy);
            c.lineTo(cx - 4, cy - 1);
            c.stroke();
            c.beginPath();
            c.moveTo(cx - 4, cy - 1);
            c.lineTo(cx - 4, cy - 5);
            c.stroke();
            // 右臂
            c.beginPath();
            c.moveTo(cx, cy + 2);
            c.lineTo(cx + 4, cy + 1);
            c.stroke();
            c.beginPath();
            c.moveTo(cx + 4, cy + 1);
            c.lineTo(cx + 4, cy - 3);
            c.stroke();
            c.lineCap = 'butt';
            break;
          }
        }

        c.restore();
        textures.set(`${type}_${v}`, offCanvas);
      }
    });

    return textures;
  }, [combatSeed]);

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
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
        const moveTargetHex = !selectedAbility && pendingMoveHex ? pendingMoveHex : hoveredHex;
        const isHovered = moveTargetHex?.q === q && moveTargetHex?.r === r;
        const isMovePathTile = !selectedAbility && movePreviewPathSet.has(key);
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

          // 移动路径预览（经过格）
          if (isMovePathTile) {
            ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
            drawHex(x, topY, HEX_SIZE - HEX_GAP - 6);
            ctx.fill();
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
            ctx.lineWidth = 2;
            drawHex(x, topY, HEX_SIZE - HEX_GAP - 6);
            ctx.stroke();
          }

          // 地形纹理贴图（替代 emoji）
          const variantIdx = ((q % VARIANT_COUNT) + VARIANT_COUNT) % VARIANT_COUNT;
          const texture = terrainTextures.get(`${data.type}_${variantIdx}`);
          if (texture) {
            ctx.drawImage(texture, x - texture.width / 2, topY - texture.height / 2);
          }
          // MOUNTAIN 不可通行标记
          if (data.type === 'MOUNTAIN') {
            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            drawHex(x, topY, HEX_SIZE - HEX_GAP - 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(200,60,60,0.35)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 3]);
            const sz = (HEX_SIZE - HEX_GAP) * 0.35;
            ctx.beginPath();
            ctx.moveTo(x - sz, topY - sz);
            ctx.lineTo(x + sz, topY + sz);
            ctx.moveTo(x + sz, topY - sz);
            ctx.lineTo(x - sz, topY + sz);
            ctx.stroke();
            ctx.setLineDash([]);
          }

          // 技能范围高亮（简化，无shadowBlur）
          if (isPlayerTurn && activeUnit && isAttackLikeAbility(selectedAbility)) {
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
        if (u.isDead || u.hasEscaped) return;
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

      // 2.5 移动端：选中攻击技能时，在可攻击敌人头顶绘制命中率浮标
      if (isMobile && isPlayerTurn && activeUnit && isAttackLikeAbility(selectedAbility)) {
        state.units.forEach(enemy => {
          if (enemy.isDead || enemy.team !== 'ENEMY') return;
          const enemyKey = `${enemy.combatPos.q},${enemy.combatPos.r}`;
          if (!visibleSet.has(enemyKey)) return;

          const dist = getHexDistance(activeUnit.combatPos, enemy.combatPos);
          if (dist < selectedAbility.range[0] || dist > selectedAbility.range[1]) return;

          const attackerHeight = terrainData.get(`${activeUnit.combatPos.q},${activeUnit.combatPos.r}`)?.height || 0;
          const targetTerrain = terrainData.get(enemyKey);
          const targetHeight = targetTerrain?.height || 0;
          const heightOffset = targetHeight * HEIGHT_MULTIPLIER;
          const atkHeightDiff = attackerHeight - targetHeight;
          const polearmHitMod = getPolearmAdjacentHitPenalty(activeUnit, selectedAbility, dist);
          const breakdown = calculateHitChance(activeUnit, enemy, state, atkHeightDiff, selectedAbility, polearmHitMod, getTerrainCombatMods(activeUnit.combatPos, enemy.combatPos, terrainData));
          const hitChance = breakdown.final;

          const { x, y: baseY } = getPixelPos(enemy.combatPos.q, enemy.combatPos.r);
          const topY = baseY - heightOffset;

          const color = hitChance >= 70 ? '#4ade80' : hitChance >= 40 ? '#facc15' : '#ef4444';
          const text = `${hitChance}%`;
          ctx.font = 'bold 14px sans-serif';
          const textWidth = ctx.measureText(text).width;
          const pillW = textWidth + 12;
          const pillH = 20;
          const pillX = x - pillW / 2;
          const pillY = topY - HEX_SIZE * 0.8 - pillH / 2;

          // 圆角矩形背景
          const radius = 5;
          ctx.fillStyle = 'rgba(0,0,0,0.8)';
          ctx.beginPath();
          ctx.moveTo(pillX + radius, pillY);
          ctx.lineTo(pillX + pillW - radius, pillY);
          ctx.arcTo(pillX + pillW, pillY, pillX + pillW, pillY + radius, radius);
          ctx.lineTo(pillX + pillW, pillY + pillH - radius);
          ctx.arcTo(pillX + pillW, pillY + pillH, pillX + pillW - radius, pillY + pillH, radius);
          ctx.lineTo(pillX + radius, pillY + pillH);
          ctx.arcTo(pillX, pillY + pillH, pillX, pillY + pillH - radius, radius);
          ctx.lineTo(pillX, pillY + radius);
          ctx.arcTo(pillX, pillY, pillX + radius, pillY, radius);
          ctx.closePath();
          ctx.fill();

          // 颜色边框
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // 命中率文字
          ctx.fillStyle = color;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, x, pillY + pillH / 2);
        });
      }

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
  }, [terrainData, visibleSet, hoveredHex, pendingMoveHex, activeUnit, selectedAbility, zoom, hexPoints, isMobile, movePreviewPathSet, terrainTextures]);

  // DOM 图层同步 - 考虑地形高度 + 平滑移动动画 + 活动单位z-index
  const activeUnitId = state.turnOrder[state.currentUnitIndex];
  
  useEffect(() => {
    let anim: number;
    const LERP_SPEED = 0.12; // 移动插值速度 (0~1, 越大越快)
    const SNAP_THRESHOLD = 0.5; // 小于此距离直接snap到目标
    
    const sync = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const cx = rect.width / 2, cy = rect.height / 2;
      
      state.units.forEach(u => {
        const el = unitRefs.current.get(u.id);
        if (el) {
          const key = `${u.combatPos.q},${u.combatPos.r}`;
          const isVisible = visibleSet.has(key);
          if (u.isDead || u.hasEscaped || (!isVisible && u.team === 'ENEMY')) {
            el.style.display = 'none';
          } else {
            el.style.display = 'block';
            
            // 计算目标世界坐标
            const { x: targetX, y: targetY } = getPixelPos(u.combatPos.q, u.combatPos.r);
            const terrain = terrainData.get(key);
            const heightOffset = (terrain?.height || 0) * HEIGHT_MULTIPLIER;
            const targetWorldY = targetY - heightOffset;
            
            // 获取或初始化动画位置
            let animPos = animPosRef.current.get(u.id);
            if (!animPos) {
              animPos = { x: targetX, y: targetWorldY };
              animPosRef.current.set(u.id, animPos);
            }
            
            // 平滑插值到目标位置
            const dx = targetX - animPos.x;
            const dy = targetWorldY - animPos.y;
            if (Math.abs(dx) > SNAP_THRESHOLD || Math.abs(dy) > SNAP_THRESHOLD) {
              animPos.x += dx * LERP_SPEED;
              animPos.y += dy * LERP_SPEED;
            } else {
              animPos.x = targetX;
              animPos.y = targetWorldY;
            }
            
            // 转换为屏幕坐标：以卡片底边中心为锚点，缩放/详情切换时保持与格子稳定对齐
            const anchorX = cx + (animPos.x + cameraRef.current.x) * zoom;
            const anchorY = cy + (animPos.y + cameraRef.current.y) * zoom;
            el.style.left = `${anchorX}px`;
            el.style.top = `${anchorY}px`;
            el.style.transformOrigin = 'center bottom';
            el.style.transform = `translate(-50%, -100%) scale(${zoom})`;
            
            // z-index分层：活动单位最高，悬停目标次之，其余按屏幕Y排序（越下面越上层）
            const hovered = hoveredHexRef.current;
            const isHoveredUnit = hovered && u.combatPos.q === hovered.q && u.combatPos.r === hovered.r;
            el.style.zIndex = u.id === activeUnitId ? '50'
              : isHoveredUnit ? '45'
              : String(Math.max(1, Math.min(40, Math.floor(anchorY / 10) + 20)));
          }
        }
      });
      anim = requestAnimationFrame(sync);
    };
    anim = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(anim);
  }, [state.units, zoom, visibleSet, terrainData, activeUnitId, showUnitDetail, compactFontScale]);

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
   * 处理单位受伤后的士气检定（支持护甲系统）
   * @param targetId 目标单位ID
   * @param hpDamage HP伤害
   * @param attackerId 攻击者ID
   * @param damageResult 可选，完整的伤害计算结果（含护甲信息）
   */
  const processDamageWithMorale = useCallback((
    targetId: string,
    hpDamage: number,
    attackerId: string,
    damageResult?: DamageResult
  ) => {
    setState(prev => {
      const target = prev.units.find(u => u.id === targetId);
      const attacker = prev.units.find(u => u.id === attackerId);
      if (!target) return prev;
      
      // === 命不该绝 (nine_lives) ===
      let finalDamage = hpDamage;
      let nineLivesTriggered = false;
      const nlCheck = checkNineLives(target, hpDamage);
      if (nlCheck.triggered) {
        finalDamage = nlCheck.adjustedDamage;
        nineLivesTriggered = true;
      }
      
      const previousHp = target.hp;
      const newHp = Math.max(0, target.hp - finalDamage);
      const isDead = newHp <= 0;
      
      let updatedUnits = prev.units.map(u => {
        if (u.id === targetId) {
          const updated: any = { ...u, hp: newHp, isDead };
          
          // 命不该绝触发标记
          if (nineLivesTriggered) {
            updated.nineLivesUsed = true;
          }
          
          // 如果有护甲伤害结果，更新护甲耐久
          if (damageResult && damageResult.armorType) {
            if (damageResult.armorType === 'HELMET' && u.equipment.helmet) {
              updated.equipment = {
                ...u.equipment,
                helmet: {
                  ...u.equipment.helmet,
                  durability: damageResult.newArmorDurability
                }
              };
            } else if (damageResult.armorType === 'ARMOR' && u.equipment.armor) {
              updated.equipment = {
                ...u.equipment,
                armor: {
                  ...u.equipment.armor,
                  durability: damageResult.newArmorDurability
                }
              };
            }
          }
          
          return updated;
        }
        return u;
      });
      
      const newState = { ...prev, units: updatedUnits };
      const allResults: MoraleCheckResult[] = [];
      
      // 命不该绝日志
      if (nineLivesTriggered) {
        addToLog(`🐈 ${target.name} 命不该绝！致命伤害被化解，HP 保留 ${newHp}！`, 'skill');
      }
      
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
        
        // 3. 护甲被击穿时也触发士气检定（仿战场兄弟）
        if (damageResult?.armorDestroyed) {
          const armorBreakResult = handleHeavyDamage(
            updatedTarget,
            updatedTarget.hp + 1, // 模拟一次"重伤"以触发检定
            newState
          );
          if (armorBreakResult) {
            allResults.push(armorBreakResult);
          }
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

    const isOccupied = (pos: { q: number; r: number }) => state.units.some(u =>
      !u.isDead &&
      !u.hasEscaped &&
      u.id !== unit.id &&
      u.combatPos.q === pos.q &&
      u.combatPos.r === pos.r
    );

    const emptyInBoundsNeighbors = getHexNeighbors(unit.combatPos.q, unit.combatPos.r)
      .filter(isHexInBounds)
      .filter(pos => !isOccupied(pos));

    // 确定最终逃跑目标：优先 fleeTarget，不合法/被占用则选择最接近 fleeTarget 的可用邻格
    let finalTarget = fleeTarget;
    if (!isHexInBounds(finalTarget) || isOccupied(finalTarget)) {
      const fallback = emptyInBoundsNeighbors.sort(
        (a, b) => getHexDistance(a, fleeTarget) - getHexDistance(b, fleeTarget)
      )[0];
      if (!fallback) {
        // 已在边缘且无法移动时，视为成功逃离
        if (isEdgeHex(unit.combatPos)) {
          setState(prev => ({
            ...prev,
            units: prev.units.map(u =>
              u.id === unit.id
                ? { ...u, hasEscaped: true, currentAP: 0 }
                : u
            )
          }));
          addToLog(`${unit.name} 趁乱从战场边缘脱离！`, 'flee');
          showCenterBanner(`${unit.name} 成功逃离战场`, '#f87171', '💨');
          return;
        }
        addToLog(`${unit.name} 惊慌失措，被人群堵住去路！`, 'flee');
        return;
      }
      finalTarget = fallback;
    }

    const willEscapeOnMove = isEdgeHex(finalTarget);

    // 逃跑同样会触发离开控制区的截击
    const zocCheck = checkZoCOnMove(unit, unit.combatPos, finalTarget, state);
    if (zocCheck.inEnemyZoC && zocCheck.threateningEnemies.length > 0) {
      const { results, movementAllowed, totalDamage } = processZoCAttacks(unit, unit.combatPos, state);

      results.forEach((result, index) => {
        addToLog(getFreeAttackLogText(result), 'intercept');
        if (!result.hit) {
          setTimeout(() => {
            triggerDodgeEffect(unit.id, result.attacker.combatPos, unit.combatPos);
            setFloatingTexts(prev => [...prev, {
              id: Date.now() + index * 10,
              text: 'MISS',
              x: unit.combatPos.q,
              y: unit.combatPos.r,
              color: '#94a3b8',
              type: 'miss' as FloatingTextType,
              size: 'md' as const,
            }]);
            triggerAttackLine(result.attacker.combatPos.q, result.attacker.combatPos.r, unit.combatPos.q, unit.combatPos.r, '#475569');
            setTimeout(() => setFloatingTexts(prev => prev.slice(1)), 1200);
          }, index * 150);
        }
      });

      setState(prev => {
        let newUnits = prev.units.map(u => {
          const usedFreeAttack = results.find(r => r.attacker.id === u.id);
          if (usedFreeAttack) return { ...u, hasUsedFreeAttack: true };
          return u;
        });

        newUnits = newUnits.map(u => {
          if (u.id !== unit.id) return u;

          const newHp = Math.max(0, u.hp - totalDamage);
          const isDead = newHp <= 0;
          let updatedEquipment = { ...u.equipment };
          results.forEach(r => {
            if (r.hit && r.damageResult) {
              const dr = r.damageResult;
              if (dr.armorType === 'HELMET' && updatedEquipment.helmet) {
                updatedEquipment = {
                  ...updatedEquipment,
                  helmet: { ...updatedEquipment.helmet!, durability: Math.max(0, updatedEquipment.helmet!.durability - dr.armorDamageDealt) }
                };
              } else if (dr.armorType === 'ARMOR' && updatedEquipment.armor) {
                updatedEquipment = {
                  ...updatedEquipment,
                  armor: { ...updatedEquipment.armor!, durability: Math.max(0, updatedEquipment.armor!.durability - dr.armorDamageDealt) }
                };
              }
            }
          });

          return {
            ...u,
            hp: newHp,
            isDead,
            equipment: updatedEquipment,
            combatPos: movementAllowed && !isDead ? finalTarget : u.combatPos,
            currentAP: 0,
            hasEscaped: movementAllowed && !isDead && willEscapeOnMove ? true : u.hasEscaped
          };
        });

        return { ...prev, units: newUnits };
      });

      const wasKilled = results.some(r => r.targetKilled);
      if (wasKilled) {
        addToLog(`${unit.name} 在逃跑时被截击击杀！`, 'kill');
        triggerDeathEffect(unit.combatPos.q, unit.combatPos.r);
        showCenterBanner(`${unit.name} 在逃跑时被截击击杀！`, '#ef4444', '💀');
      } else if (movementAllowed && willEscapeOnMove) {
        addToLog(`${unit.name} 顶着截击冲到边缘，成功逃离战场！`, 'flee');
        showCenterBanner(`${unit.name} 成功逃离战场`, '#f87171', '💨');
      } else if (movementAllowed) {
        addToLog(`${unit.name} 惊慌逃窜，硬吃截击冲了出去！`, 'flee');
      } else {
        addToLog(`${unit.name} 逃跑时被截击阻止！`, 'intercept');
      }

      if (totalDamage > 0) {
        setTimeout(() => {
          results.forEach(result => {
            if (result.hit) {
              processDamageWithMorale(unit.id, result.hpDamage, result.attacker.id, result.damageResult);
            }
          });
        }, 100);
      }
      return;
    }

    setState(prev => ({
      ...prev,
      units: prev.units.map(u =>
        u.id === unit.id
          ? { ...u, combatPos: finalTarget, currentAP: 0, hasEscaped: willEscapeOnMove ? true : u.hasEscaped }
          : u
      )
    }));
    if (willEscapeOnMove) {
      addToLog(`${unit.name} 趁乱冲到边缘，成功逃离战场！`, 'flee');
      showCenterBanner(`${unit.name} 成功逃离战场`, '#f87171', '💨');
    } else {
      addToLog(`${unit.name} 惊慌逃窜！`, 'flee');
    }
  }, [state, processDamageWithMorale, isHexInBounds, isEdgeHex]);

  /**
   * 处理主动撤退单位的自动行动
   */
  const executeRetreatAction = useCallback(async (unit: CombatUnit) => {
    const retreatTarget = getRetreatTargetPosition(unit);

    const isOccupied = (pos: { q: number; r: number }) => state.units.some(u =>
      !u.isDead &&
      !u.hasEscaped &&
      u.id !== unit.id &&
      u.combatPos.q === pos.q &&
      u.combatPos.r === pos.r
    );

    const emptyInBoundsNeighbors = getHexNeighbors(unit.combatPos.q, unit.combatPos.r)
      .filter(isHexInBounds)
      .filter(pos => !isOccupied(pos));

    let finalTarget = retreatTarget;
    if (!isHexInBounds(finalTarget) || isOccupied(finalTarget)) {
      const fallback = emptyInBoundsNeighbors.sort(
        (a, b) => getHexDistance(a, retreatTarget) - getHexDistance(b, retreatTarget)
      )[0];
      if (!fallback) {
        if (isEdgeHex(unit.combatPos)) {
          setState(prev => ({
            ...prev,
            units: prev.units.map(u =>
              u.id === unit.id
                ? { ...u, hasEscaped: true, currentAP: 0 }
                : u
            )
          }));
          addToLog(`${unit.name} 已脱离战场！`, 'flee');
          showCenterBanner(`${unit.name} 成功撤离`, '#f87171', '🏳');
          return;
        }
        addToLog(`${unit.name} 撤退路线被阻挡！`, 'flee');
        return;
      }
      finalTarget = fallback;
    }

    const willEscapeOnMove = isEdgeHex(finalTarget);
    const zocCheck = checkZoCOnMove(unit, unit.combatPos, finalTarget, state);
    if (zocCheck.inEnemyZoC && zocCheck.threateningEnemies.length > 0) {
      const { results, movementAllowed, totalDamage } = processZoCAttacks(unit, unit.combatPos, state);

      results.forEach((result, index) => {
        addToLog(getFreeAttackLogText(result), 'intercept');
        if (!result.hit) {
          setTimeout(() => {
            triggerDodgeEffect(unit.id, result.attacker.combatPos, unit.combatPos);
            setFloatingTexts(prev => [...prev, {
              id: Date.now() + index * 10,
              text: 'MISS',
              x: unit.combatPos.q,
              y: unit.combatPos.r,
              color: '#94a3b8',
              type: 'miss' as FloatingTextType,
              size: 'md' as const,
            }]);
            triggerAttackLine(result.attacker.combatPos.q, result.attacker.combatPos.r, unit.combatPos.q, unit.combatPos.r, '#475569');
            setTimeout(() => setFloatingTexts(prev => prev.slice(1)), 1200);
          }, index * 150);
        }
      });

      setState(prev => {
        let newUnits = prev.units.map(u => {
          const usedFreeAttack = results.find(r => r.attacker.id === u.id);
          if (usedFreeAttack) return { ...u, hasUsedFreeAttack: true };
          return u;
        });

        newUnits = newUnits.map(u => {
          if (u.id !== unit.id) return u;

          const newHp = Math.max(0, u.hp - totalDamage);
          const isDead = newHp <= 0;
          let updatedEquipment = { ...u.equipment };
          results.forEach(r => {
            if (r.hit && r.damageResult) {
              const dr = r.damageResult;
              if (dr.armorType === 'HELMET' && updatedEquipment.helmet) {
                updatedEquipment = {
                  ...updatedEquipment,
                  helmet: { ...updatedEquipment.helmet!, durability: Math.max(0, updatedEquipment.helmet!.durability - dr.armorDamageDealt) }
                };
              } else if (dr.armorType === 'ARMOR' && updatedEquipment.armor) {
                updatedEquipment = {
                  ...updatedEquipment,
                  armor: { ...updatedEquipment.armor!, durability: Math.max(0, updatedEquipment.armor!.durability - dr.armorDamageDealt) }
                };
              }
            }
          });

          return {
            ...u,
            hp: newHp,
            isDead,
            equipment: updatedEquipment,
            combatPos: movementAllowed && !isDead ? finalTarget : u.combatPos,
            currentAP: 0,
            hasEscaped: movementAllowed && !isDead && willEscapeOnMove ? true : u.hasEscaped
          };
        });

        return { ...prev, units: newUnits };
      });

      const wasKilled = results.some(r => r.targetKilled);
      if (wasKilled) {
        addToLog(`${unit.name} 在撤退时被截击击杀！`, 'kill');
        triggerDeathEffect(unit.combatPos.q, unit.combatPos.r);
        showCenterBanner(`${unit.name} 在撤退时阵亡！`, '#ef4444', '💀');
      } else if (movementAllowed && willEscapeOnMove) {
        addToLog(`${unit.name} 顶着截击成功撤离战场！`, 'flee');
        showCenterBanner(`${unit.name} 成功撤离`, '#f87171', '🏳');
      } else if (movementAllowed) {
        addToLog(`${unit.name} 顶着截击继续撤退！`, 'flee');
      } else {
        addToLog(`${unit.name} 撤退时被截击阻止！`, 'intercept');
      }

      if (totalDamage > 0) {
        setTimeout(() => {
          results.forEach(result => {
            if (result.hit) {
              processDamageWithMorale(unit.id, result.hpDamage, result.attacker.id, result.damageResult);
            }
          });
        }, 100);
      }
      return;
    }

    setState(prev => ({
      ...prev,
      units: prev.units.map(u =>
        u.id === unit.id
          ? { ...u, combatPos: finalTarget, currentAP: 0, hasEscaped: willEscapeOnMove ? true : u.hasEscaped }
          : u
      )
    }));
    if (willEscapeOnMove) {
      addToLog(`${unit.name} 撤到边缘，成功脱离战场！`, 'flee');
      showCenterBanner(`${unit.name} 成功撤离`, '#f87171', '🏳');
    } else {
      addToLog(`${unit.name} 正在向边缘撤退。`, 'flee');
    }
  }, [state, processDamageWithMorale, isHexInBounds, isEdgeHex]);

  /**
   * 回合开始时的士气恢复检定
   */
  const processTurnStartMorale = useCallback((unit: CombatUnit): MoraleStatus => {
    if (unit.morale === MoraleStatus.CONFIDENT || unit.morale === MoraleStatus.STEADY) {
      return unit.morale;
    }
    
    const result = handleTurnStartRecovery(unit, state);
    if (result) {
      const { updatedUnits, chainResults } = applyMoraleResults(state, [result]);
      const selfAfterRecovery = updatedUnits.find(uu => uu.id === unit.id);
      
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
      return selfAfterRecovery?.morale ?? unit.morale;
    }
    return unit.morale;
  }, [state]);

  const nextTurn = useCallback(() => {
    setState(prev => {
      let nextIdx = (prev.currentUnitIndex + 1) % prev.turnOrder.length;
      
      // 跳过死亡/逃离单位
      let attempts = 0;
      while (attempts < prev.turnOrder.length) {
        const nextUnit = prev.units.find(u => u.id === prev.turnOrder[nextIdx]);
        if (nextUnit && !nextUnit.isDead && !nextUnit.hasEscaped) break;
        nextIdx = (nextIdx + 1) % prev.turnOrder.length;
        attempts++;
      }
      
      const isNewRound = nextIdx === 0;
      
      // === 血勇 (adrenaline): 新回合开始时调整回合顺序 ===
      let newTurnOrder = prev.turnOrder;
      if (isNewRound) {
        newTurnOrder = applyAdrenalineTurnOrder(prev.turnOrder, prev.units);
        // 重新查找 nextIdx（血勇可能改变了顺序）
        nextIdx = 0;
        let retries = 0;
        while (retries < newTurnOrder.length) {
          const u = prev.units.find(uu => uu.id === newTurnOrder[nextIdx]);
          if (u && !u.isDead && !u.hasEscaped) break;
          nextIdx = (nextIdx + 1) % newTurnOrder.length;
          retries++;
        }
      }
      
      return { 
        ...prev,
        turnOrder: newTurnOrder,
        currentUnitIndex: nextIdx,
        round: isNewRound ? prev.round + 1 : prev.round,
        units: prev.units.map(u => {
          // 新回合开始时重置所有单位的各种状态
          if (isNewRound) {
            let updated = { ...u, hasUsedFreeAttack: false, waitCount: 0 };
            // === 重置专精回合状态 ===
            updated = resetTurnStartStates(updated);
            // 重置血勇标记
            if (updated.adrenalineActive) updated.adrenalineActive = false;
            // 重置挑衅标记
            if (updated.taunting) updated.taunting = false;
            
            if (u.id === newTurnOrder[nextIdx]) {
              return {
                ...updated,
                currentAP: 9,
                fatigue: Math.max(0, updated.fatigue - TURN_START_FATIGUE_RECOVERY),
              };
            }
            return updated;
          }
          // 当前单位回合开始时恢复AP
          if (u.id === newTurnOrder[nextIdx]) {
            return {
              ...u,
              currentAP: 9,
              fatigue: Math.max(0, u.fatigue - TURN_START_FATIGUE_RECOVERY),
            };
          }
          return u;
        })
      };
    });
    setSelectedAbility(null);
  }, []);

  // ==================== 等待（推迟行动顺序，每回合最多1次）====================
  const waitTurn = useCallback(() => {
    if (!activeUnit || activeUnit.team !== 'PLAYER') return;
    
    // 检查等待次数：已等待1次则直接结束回合
    if (activeUnit.waitCount >= 1) {
      nextTurn();
      return;
    }
    
    if (activeUnit.isHalberdWall) {
      addToLog(`🚧 ${activeUnit.name} 通过等待取消了矛墙架势。`, 'info');
    }

    setState(prev => {
      const currentId = prev.turnOrder[prev.currentUnitIndex];
      // 将当前单位移到回合队列的末尾
      const newTurnOrder = [...prev.turnOrder];
      newTurnOrder.splice(prev.currentUnitIndex, 1);
      newTurnOrder.push(currentId);
      
      // 调整 currentUnitIndex: 移除后当前索引自动指向下一个，但不能越界
      let nextIdx = prev.currentUnitIndex;
      if (nextIdx >= newTurnOrder.length) nextIdx = 0;
      
      // 跳过死亡/逃离单位
      let attempts = 0;
      while (attempts < newTurnOrder.length) {
        const nextUnit = prev.units.find(u => u.id === newTurnOrder[nextIdx]);
        if (nextUnit && !nextUnit.isDead && !nextUnit.hasEscaped) break;
        nextIdx = (nextIdx + 1) % newTurnOrder.length;
        attempts++;
      }
      
      return {
        ...prev,
        turnOrder: newTurnOrder,
        currentUnitIndex: nextIdx,
        // 增加该单位的等待计数
        units: prev.units.map(u => 
          u.id === currentId ? { ...u, waitCount: u.waitCount + 1, isHalberdWall: false } : u
        ),
      };
    });
    setSelectedAbility(null);
  }, [activeUnit, nextTurn]);

  // ==================== 敌人 AI 行动逻辑 ====================
  const isProcessingAI = useRef(false);
  
  useEffect(() => {
    console.log('[AI Effect] activeUnit:', activeUnit?.name, 'team:', activeUnit?.team, 'isDead:', activeUnit?.isDead);

    // 弹出“追击/收兵”选择时暂停自动推进
    if (showChaseChoice) {
      isProcessingAI.current = false;
      return;
    }
    
    // 如果不是敌人回合，直接返回
    if (!activeUnit) {
      console.log('[AI] 没有活动单位');
      isProcessingAI.current = false;
      return;
    }
    
    if (activeUnit.hasEscaped) {
      isProcessingAI.current = false;
      nextTurn();
      return;
    }

    if ((activeUnit.stunnedTurns || 0) > 0) {
      addToLog(`😵 ${activeUnit.name} 被击晕，无法行动！`, 'skill');
      setFloatingTexts(prev => [...prev, {
        id: Date.now(),
        text: '😵 眩晕',
        x: activeUnit.combatPos.q,
        y: activeUnit.combatPos.r,
        color: '#a78bfa',
        type: 'morale' as FloatingTextType,
        size: 'md' as const,
      }]);
      setTimeout(() => setFloatingTexts(prev => prev.slice(1)), 1200);
      setState(prev => ({
        ...prev,
        units: prev.units.map(u =>
          u.id === activeUnit.id
            ? { ...u, stunnedTurns: Math.max(0, (u.stunnedTurns || 0) - 1) }
            : u
        ),
      }));
      isProcessingAI.current = false;
      setTimeout(nextTurn, 800);
      return;
    }

    if (activeUnit.team === 'PLAYER') {
      console.log('[AI] 玩家回合，跳过');
      isProcessingAI.current = false;

      if (isRetreating) {
        setTimeout(async () => {
          await executeRetreatAction(activeUnit);
          await new Promise(r => setTimeout(r, 500));
          nextTurn();
        }, 300);
        return;
      }
      
      // 玩家回合开始时，处理逃跑单位和士气恢复
      const moraleAfterRecovery = processTurnStartMorale(activeUnit);
      if (moraleAfterRecovery === MoraleStatus.FLEEING) {
        // 逃跑单位自动行动
        setTimeout(async () => {
          await executeFleeAction(activeUnit);
          await new Promise(r => setTimeout(r, 500));
          nextTurn();
        }, 300);
      } else {
        // 检查崩溃状态是否跳过行动
        const recoveredUnit = { ...activeUnit, morale: moraleAfterRecovery };
        if (moraleAfterRecovery === MoraleStatus.BREAKING && shouldSkipAction(recoveredUnit)) {
          addToLog(`${activeUnit.name} 惊慌失措，无法行动！`, 'morale');
          setTimeout(nextTurn, 800);
        }
      }
      return;
    }
    
    if (activeUnit.isDead || activeUnit.hasEscaped) {
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
      const moraleAfterRecovery = processTurnStartMorale(activeUnit);

      // 处理逃跑单位
      if (moraleAfterRecovery === MoraleStatus.FLEEING) {
        await executeFleeAction(activeUnit);
        await new Promise(r => setTimeout(r, 500));
        isProcessingAI.current = false;
        nextTurn();
        return;
      }

      // 检查崩溃状态是否跳过行动
      const recoveredUnit = { ...activeUnit, morale: moraleAfterRecovery };
      if (moraleAfterRecovery === MoraleStatus.BREAKING && shouldSkipAction(recoveredUnit)) {
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
      let currentFatigue = activeUnit.fatigue;
      let currentPos = { ...activeUnit.combatPos };
      let currentCrossbowLoaded = activeUnit.crossbowLoaded;
      
      while (actionsPerformed < maxActions && currentAP >= 2) {
        // 等待一下让玩家看清
        await new Promise(r => setTimeout(r, 500));
        
        // 构造用于 AI 决策的单位状态
        const unitForAI = {
          ...activeUnit,
          morale: moraleAfterRecovery,
          currentAP,
          fatigue: currentFatigue,
          combatPos: currentPos,
          crossbowLoaded: currentCrossbowLoaded
        };
        
        console.log(`[AI决策前] 单位: ${unitForAI.name}, AP: ${unitForAI.currentAP}, 位置: (${unitForAI.combatPos.q}, ${unitForAI.combatPos.r})`);
        console.log(`[AI决策前] 装备武器: ${unitForAI.equipment?.mainHand?.name || '无'}`);
        console.log(`[AI决策前] state.units 数量: ${state.units.length}, 玩家单位: ${state.units.filter(u => u.team === 'PLAYER' && !u.isDead && !u.hasEscaped).length}`);
        
        // 获取 AI 决策（传入地形数据）
        const stateWithTerrain = { ...state, terrainGrid: terrainData };
        const action = executeAITurn(unitForAI, stateWithTerrain);
        console.log(`[AI决策] ${activeUnit.name}: ${action.type}`, JSON.stringify(action));
        
        if (action.type === 'WAIT') {
          addToLog(`${activeUnit.name} 观望形势。`, 'info');
          break;
        }
        
        if (action.type === 'MOVE' && action.targetPos) {
          const aiUnit = state.units.find(u => u.id === activeUnit.id);
          if (!aiUnit) break;

          const blockedHexes = buildBlockedHexSet(state.units, aiUnit.id, aiUnit.team, terrainData);
          // 构建友方单位占位集合（可以途经但不能作为停留终点）
          const allyOccupied = new Set<string>();
          state.units.forEach(u => {
            if (u.isDead || u.hasEscaped || u.id === aiUnit.id) return;
            if (u.team === aiUnit.team) {
              allyOccupied.add(`${u.combatPos.q},${u.combatPos.r}`);
            }
          });
          const maxMoveSteps = getMaxMoveSteps(aiUnit, currentAP, currentFatigue);
          const movePath = findPathWithinSteps(currentPos, action.targetPos, blockedHexes, maxMoveSteps, terrainData, hasPerk(aiUnit, 'pathfinder'), true, allyOccupied);
          if (!movePath || movePath.length === 0) break;

          const aiMoveUnit = {
            ...aiUnit,
            combatPos: currentPos,
            currentAP,
            fatigue: currentFatigue
          };
          const moveOutcome = evaluateMovePathOutcome(aiMoveUnit, movePath);
          if (moveOutcome.stepsMoved <= 0) break;

          const actualPath = movePath.slice(0, moveOutcome.stepsMoved);
          const tileCosts = getPathTerrainCosts(actualPath, terrainData);
          const moveCost = getPathMoveCost(tileCosts, hasPerk(aiUnit, 'pathfinder'));
          if (currentAP < moveCost.apCost) break;
          if (getRemainingFatigue({ ...activeUnit, fatigue: currentFatigue }) < moveCost.fatigueCost) break;
          currentAP -= moveCost.apCost;
          currentFatigue = Math.min(activeUnit.maxFatigue, currentFatigue + moveCost.fatigueCost);

          const movementTargetPos = moveOutcome.finalPos;
          const leaveZoCCheck = checkZoCOnMove(aiMoveUnit, currentPos, movementTargetPos, state);
          const shouldStopOnZoCEntry = moveOutcome.enteredEnemyZoC;
          const shouldTriggerLeaveZoCIntercept = !shouldStopOnZoCEntry && leaveZoCCheck.inEnemyZoC && leaveZoCCheck.threateningEnemies.length > 0;
          const interceptFromPos = currentPos;

          if (shouldTriggerLeaveZoCIntercept) {
            const { results, movementAllowed, totalDamage } = processZoCAttacks(
              aiMoveUnit,
              interceptFromPos,
              state
            );
            
            // 显示截击结果（含护甲伤害信息）
            for (const result of results) {
              addToLog(getFreeAttackLogText(result), 'intercept');
              
              if (result.hit && result.hpDamage > 0) {
                const floatTexts: { id: number; text: string; x: number; y: number; color: string; type: FloatingTextType; size: 'sm' | 'md' | 'lg' }[] = [];
                if (result.damageResult && result.damageResult.armorDamageDealt > 0) {
                  floatTexts.push({
                    id: Date.now() + Math.random(),
                    text: result.damageResult.armorDestroyed ? `⚡🛡💥-${result.damageResult.armorDamageDealt}` : `⚡🛡-${result.damageResult.armorDamageDealt}`,
                    x: interceptFromPos.q,
                    y: interceptFromPos.r,
                    color: result.damageResult.armorDestroyed ? '#f59e0b' : '#38bdf8',
                    type: 'intercept' as FloatingTextType,
                    size: 'sm' as const,
                  });
                }
                floatTexts.push({
                  id: Date.now() + Math.random() + 0.1,
                  text: `⚡-${result.hpDamage}`,
                  x: interceptFromPos.q,
                  y: interceptFromPos.r,
                  color: '#3b82f6',
                  type: 'intercept' as FloatingTextType,
                  size: 'md' as const,
                });
                setFloatingTexts(prev => [...prev, ...floatTexts]);
                triggerHitEffect(activeUnit.id);
                triggerAttackLine(result.attacker.combatPos.q, result.attacker.combatPos.r, interceptFromPos.q, interceptFromPos.r, '#3b82f6');
                triggerScreenShake('light');
                if (result.damageResult?.armorDestroyed) {
                  const armorName = result.damageResult.armorType === 'HELMET' ? '头盔' : '护甲';
                  addToLog(`🛡 ${activeUnit.name} 的${armorName}破碎了！`, 'intercept');
                }
              } else if (!result.hit) {
                triggerDodgeEffect(activeUnit.id, result.attacker.combatPos, interceptFromPos);
                setFloatingTexts(prev => [...prev, {
                  id: Date.now() + Math.random(),
                  text: 'MISS',
                  x: interceptFromPos.q,
                  y: interceptFromPos.r,
                  color: '#94a3b8',
                  type: 'miss' as FloatingTextType,
                  size: 'md' as const,
                }]);
                triggerAttackLine(result.attacker.combatPos.q, result.attacker.combatPos.r, interceptFromPos.q, interceptFromPos.r, '#475569');
                setTimeout(() => setFloatingTexts(prev => prev.slice(1)), 1200);
              }
            }
            
            setState(prev => {
              const postInterceptPos = movementAllowed ? movementTargetPos : currentPos;

              let newUnits = prev.units.map(u => {
                const usedFreeAttack = results.find(r => r.attacker.id === u.id);
                if (usedFreeAttack) {
                  return { ...u, hasUsedFreeAttack: true };
                }
                if (u.id === activeUnit.id) {
                  const newHp = Math.max(0, u.hp - totalDamage);
                  const isDead = newHp <= 0;
                  let updatedEquipment = { ...u.equipment };
                  results.forEach(r => {
                    if (r.hit && r.damageResult) {
                      const dr = r.damageResult;
                      if (dr.armorType === 'HELMET' && updatedEquipment.helmet) {
                        updatedEquipment = {
                          ...updatedEquipment,
                          helmet: { ...updatedEquipment.helmet!, durability: Math.max(0, updatedEquipment.helmet!.durability - dr.armorDamageDealt) }
                        };
                      } else if (dr.armorType === 'ARMOR' && updatedEquipment.armor) {
                        updatedEquipment = {
                          ...updatedEquipment,
                          armor: { ...updatedEquipment.armor!, durability: Math.max(0, updatedEquipment.armor!.durability - dr.armorDamageDealt) }
                        };
                      }
                    }
                  });
                  return {
                    ...u,
                    hp: newHp,
                    isDead,
                    equipment: updatedEquipment,
                    combatPos: postInterceptPos,
                    currentAP,
                    fatigue: currentFatigue,
                  };
                }
                return u;
              });
              return { ...prev, units: newUnits };
            });
            
            currentPos = movementAllowed ? movementTargetPos : currentPos;
            if (movementAllowed) {
              addToLog(`${activeUnit.name} 受到截击后继续移动。`, 'move');
            } else {
              addToLog(`${activeUnit.name} 的移动被截击阻止！`, 'intercept');
            }
            
            actionsPerformed++;
            
            if (aiUnit.hp - totalDamage <= 0) {
              break;
            }
            
            continue; // 已处理，继续下一个行动
          }

          if (shouldStopOnZoCEntry) {
            const spearwallOutcome = processSpearwallEntryAttacks(aiMoveUnit, moveOutcome.threateningEnemies, state);
            if (spearwallOutcome.triggered) {
              for (const result of spearwallOutcome.results) {
                addToLog(`🚧 ${getFreeAttackLogText(result)}`, 'intercept');
                if (!result.hit) {
                  addToLog(`💨 ${activeUnit.name} 躲开矛墙突刺，尝试突破防线！`, 'intercept');
                }
              }

              const finalPos = spearwallOutcome.movementAllowed ? movementTargetPos : currentPos;
              const attemptedSpearwallIds = new Set(spearwallOutcome.results.map(r => r.attacker.id));

              setState(prev => {
                const newUnits = prev.units.map(u => {
                  if (attemptedSpearwallIds.has(u.id)) {
                    return { ...u, hasUsedFreeAttack: true, isHalberdWall: false };
                  }
                  if (u.id === activeUnit.id) {
                    const newHp = Math.max(0, u.hp - spearwallOutcome.totalDamage);
                    let updatedEquipment = { ...u.equipment };
                    spearwallOutcome.results.forEach(r => {
                      if (r.hit && r.damageResult) {
                        const dr = r.damageResult;
                        if (dr.armorType === 'HELMET' && updatedEquipment.helmet) {
                          updatedEquipment = {
                            ...updatedEquipment,
                            helmet: { ...updatedEquipment.helmet!, durability: Math.max(0, updatedEquipment.helmet!.durability - dr.armorDamageDealt) }
                          };
                        } else if (dr.armorType === 'ARMOR' && updatedEquipment.armor) {
                          updatedEquipment = {
                            ...updatedEquipment,
                            armor: { ...updatedEquipment.armor!, durability: Math.max(0, updatedEquipment.armor!.durability - dr.armorDamageDealt) }
                          };
                        }
                      }
                    });
                    return {
                      ...u,
                      hp: newHp,
                      isDead: newHp <= 0,
                      equipment: updatedEquipment,
                      combatPos: finalPos,
                      currentAP,
                      fatigue: currentFatigue,
                    };
                  }
                  return u;
                });
                return { ...prev, units: newUnits };
              });

              currentPos = { ...finalPos };
              if (spearwallOutcome.movementAllowed) {
                addToLog(`${activeUnit.name} 破解矛墙并继续前进。`, 'move');
              } else {
                addToLog(`${activeUnit.name} 被矛墙命中，冲锋被打断！`, 'intercept');
              }

              if (spearwallOutcome.totalDamage > 0) {
                setTimeout(() => {
                  spearwallOutcome.results.forEach(result => {
                    if (result.hit) {
                      processDamageWithMorale(activeUnit.id, result.hpDamage, result.attacker.id, result.damageResult);
                    }
                  });
                }, 100);
              }
            } else {
              currentPos = { ...movementTargetPos };
              setState(prev => ({
                ...prev,
                units: prev.units.map(u =>
                  u.id === activeUnit.id
                    ? { ...u, combatPos: movementTargetPos, currentAP, fatigue: currentFatigue }
                    : u
                )
              }));
              addToLog(`${activeUnit.name} 进入敌方控制区后停下。`, 'move');
            }
            actionsPerformed++;
            continue;
          }
          
          // 没有截击，正常移动到可到达目标（可能短于AI原目标）
          currentPos = { ...movementTargetPos };
          
          // 更新状态
          setState(prev => ({
            ...prev,
            units: prev.units.map(u => 
              u.id === activeUnit.id 
                ? { ...u, combatPos: movementTargetPos, currentAP, fatigue: currentFatigue }
                : u
            )
          }));
          addToLog(`${activeUnit.name} 移动。`, 'move');
          actionsPerformed++;
          
        } else if (action.type === 'ATTACK' && action.targetUnitId && action.ability) {
          const target = state.units.find(u => u.id === action.targetUnitId && !u.isDead && !u.hasEscaped);
          if (target) {
            // ==================== AI攻击：命中判定（含合围加成） ====================
            const aiAttackerTerrain = terrainData.get(`${currentPos.q},${currentPos.r}`);
            const aiTargetTerrain = terrainData.get(`${target.combatPos.q},${target.combatPos.r}`);
            const aiHeightDiff = (aiAttackerTerrain?.height || 0) - (aiTargetTerrain?.height || 0);
            const aiDist = getHexDistance(currentPos, target.combatPos);
            const aiPolearmHitMod = getPolearmAdjacentHitPenalty(activeUnit, action.ability, aiDist);
            const aiHitInfo = calculateHitChance(activeUnit, target, state, aiHeightDiff, action.ability, aiPolearmHitMod, getTerrainCombatMods(currentPos, target.combatPos, terrainData));
            const aiIsHit = rollHitCheck(aiHitInfo.final);
            const aiFatigueCost = getEffectiveFatigueCost(activeUnit, action.ability);
            if (currentAP < action.ability.apCost) break;
            if (getRemainingFatigue({ ...activeUnit, fatigue: currentFatigue }) < aiFatigueCost) break;
            currentAP -= action.ability.apCost;
            currentFatigue = Math.min(activeUnit.maxFatigue, currentFatigue + aiFatigueCost);
            if (action.ability.id === 'SHOOT' && isCrossbowUnit(activeUnit)) {
              currentCrossbowLoaded = false;
            }
            
            const weaponName = activeUnit.equipment.mainHand?.name || '徒手';
            
            // 先更新攻击者AP
            setState(prev => ({
              ...prev,
              units: prev.units.map(u => {
                if (u.id === activeUnit.id) {
                  return {
                    ...u,
                    currentAP,
                    fatigue: currentFatigue,
                    crossbowLoaded: action.ability?.id === 'SHOOT' && isCrossbowUnit(u) ? false : u.crossbowLoaded,
                  };
                }
                return u;
              })
            }));
            
            if (!aiIsHit) {
              // ==================== AI未命中 ====================
              triggerDodgeEffect(target.id, currentPos, target.combatPos);
              setFloatingTexts(prev => [...prev, {
                id: Date.now(),
                text: 'MISS',
                x: target.combatPos.q,
                y: target.combatPos.r,
                color: '#94a3b8',
                type: 'miss' as FloatingTextType,
                size: 'md' as const,
              }]);
              triggerAttackLine(currentPos.q, currentPos.r, target.combatPos.q, target.combatPos.r, '#475569');
              addToLog(`${activeUnit.name}「${weaponName}」${action.ability.name} → ${target.name}，未命中！(${aiHitInfo.final}%)`, 'info');
              setTimeout(() => setFloatingTexts(prev => prev.slice(1)), 1200);
              tryTriggerRiposte(target.id, activeUnit.id);
              actionsPerformed++;
            } else {
              // ==================== AI命中：使用护甲伤害系统 ====================
              const dmgResult = calculateDamage(activeUnit, target, action.ability.id === 'AIMED_SHOT' ? { damageMult: AIMED_SHOT_DAMAGE_MULT } : undefined);
              const shouldTryStun = isHammerBashStunAttack(action.ability, activeUnit) && !dmgResult.willKill;
              const stunChance = shouldTryStun ? getHammerBashStunChance(activeUnit, target, dmgResult.hitLocation) : 0;
              const didStun = shouldTryStun && Math.random() * 100 < stunChance;
              if (didStun) {
                setState(prev => ({
                  ...prev,
                  units: prev.units.map(u =>
                    u.id === target.id
                      ? { ...u, stunnedTurns: Math.max(u.stunnedTurns || 0, 1) }
                      : u
                  ),
                }));
              }
              
              // 显示护甲伤害浮动文字
              const floatTexts: { id: number; text: string; x: number; y: number; color: string; type: FloatingTextType; size: 'sm' | 'md' | 'lg' }[] = [];
              if (dmgResult.armorDamageDealt > 0) {
                floatTexts.push({
                  id: Date.now(),
                  text: dmgResult.armorDestroyed ? `🛡💥-${dmgResult.armorDamageDealt}` : `🛡-${dmgResult.armorDamageDealt}`,
                  x: target.combatPos.q,
                  y: target.combatPos.r,
                  color: dmgResult.armorDestroyed ? '#f59e0b' : '#38bdf8',
                  type: 'damage' as FloatingTextType,
                  size: 'sm' as const,
                });
              }
              floatTexts.push({
                id: Date.now() + 1,
                text: dmgResult.isCritical ? `💥-${dmgResult.hpDamageDealt}` : `-${dmgResult.hpDamageDealt}`,
                x: target.combatPos.q,
                y: target.combatPos.r,
                color: dmgResult.isCritical ? '#ff6b35' : '#ef4444',
                type: (dmgResult.isCritical ? 'critical' : 'damage') as FloatingTextType,
                size: dmgResult.isCritical ? 'lg' as const : 'md' as const,
              });
              if (didStun) {
                floatTexts.push({
                  id: Date.now() + 2,
                  text: '😵 击晕',
                  x: target.combatPos.q,
                  y: target.combatPos.r,
                  color: '#a78bfa',
                  type: 'morale' as FloatingTextType,
                  size: 'md' as const,
                });
              }
              setFloatingTexts(prev => [...prev, ...floatTexts]);
              
              // 触发受击特效
              triggerHitEffect(target.id);
              triggerAttackLine(currentPos.q, currentPos.r, target.combatPos.q, target.combatPos.r, '#ef4444');
              triggerScreenShake(dmgResult.isCritical || dmgResult.willKill ? 'heavy' : 'light');
              
              // 详细播报（含护甲信息）
              const logMsg = getDamageLogText(activeUnit.name, target.name, weaponName, action.ability.name, dmgResult);
              addToLog(logMsg, 'attack');
              if (didStun) {
                addToLog(`😵 ${target.name} 被${weaponName}击晕！（${Math.round(stunChance)}%）`, 'skill');
              }
              
              // 暴击横幅
              if (dmgResult.isCritical) {
                showCenterBanner(`${activeUnit.name} 暴击！-${dmgResult.hpDamageDealt}`, '#ff6b35', '💥');
              }
              if (dmgResult.armorDestroyed) {
                const armorName = dmgResult.armorType === 'HELMET' ? '头盔' : '护甲';
                addToLog(`🛡 ${target.name} 的${armorName}破碎了！`, 'attack');
              }
              
              setTimeout(() => setFloatingTexts(prev => prev.slice(1)), 1200);
              
              // 处理伤害和士气检定（传入完整伤害结果）
              processDamageWithMorale(target.id, dmgResult.hpDamageDealt, activeUnit.id, dmgResult);
              
              // 击杀特效
              if (dmgResult.willKill) {
                triggerDeathEffect(target.combatPos.q, target.combatPos.r);
                showCenterBanner(`${target.name} 被 ${activeUnit.name} 击杀！`, '#f59e0b', '💀');
                addToLog(`💀 ${target.name} 阵亡！`, 'kill');
              }
              tryTriggerRiposte(target.id, activeUnit.id);
              
              actionsPerformed++;
            }
          } else {
            break; // 目标无效，结束行动
          }
        } else if (action.type === 'SKILL' && action.ability) {
          if (action.ability.id === 'RELOAD') {
            if (!isCrossbowUnit(activeUnit)) break;
            if (currentCrossbowLoaded !== false) {
              actionsPerformed++;
              continue;
            }
            if (currentAP < action.ability.apCost) break;
            const skillFatigueCost = getEffectiveFatigueCost(activeUnit, action.ability);
            if (getRemainingFatigue({ ...activeUnit, fatigue: currentFatigue }) < skillFatigueCost) break;
            currentAP -= action.ability.apCost;
            currentFatigue = Math.min(activeUnit.maxFatigue, currentFatigue + skillFatigueCost);
            currentCrossbowLoaded = true;
            setState(prev => ({
              ...prev,
              units: prev.units.map(u => {
                if (u.id === activeUnit.id) {
                  return {
                    ...u,
                    currentAP,
                    fatigue: currentFatigue,
                    crossbowLoaded: true,
                  };
                }
                return u;
              })
            }));
            addToLog(`🔄 ${activeUnit.name} 装填弩矢。`, 'skill');
            actionsPerformed++;
            continue;
          }
          break;
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
  }, [activeUnit?.id, isRetreating, showChaseChoice]); // 回合切换或进入撤退模式时重新评估

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
    if (hoveredHex?.q !== q || hoveredHex?.r !== r) {
      hoveredHexRef.current = { q, r };
      setHoveredHex({ q, r });
    }
    setMousePos({ x: e.clientX, y: e.clientY });
  };
  const handleMouseLeave = () => {
    hoveredHexRef.current = null;
    setHoveredHex(null);
  };
  const handleMouseUp = () => isDraggingRef.current = false;
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    // 在模拟器/触控板场景下，阻止浏览器将滚轮手势解释为页面滚动。
    e.preventDefault();
    e.stopPropagation();

    const rect = e.currentTarget.getBoundingClientRect();
    const pointerX = e.clientX - rect.left - rect.width / 2;
    const pointerY = e.clientY - rect.top - rect.height / 2;

    // 以指针位置为锚点缩放，避免看起来像“镜头被推着走”。
    const worldBeforeX = pointerX / zoom - cameraRef.current.x;
    const worldBeforeY = pointerY / zoom - cameraRef.current.y;
    const wheelScale = Math.max(-0.25, Math.min(0.25, -e.deltaY * 0.0015));
    const nextZoom = Math.max(0.4, Math.min(2, zoom + wheelScale));

    if (nextZoom === zoom) return;

    setZoom(nextZoom);
    cameraRef.current.x = pointerX / nextZoom - worldBeforeX;
    cameraRef.current.y = pointerY / nextZoom - worldBeforeY;
  };

  // ==================== 触控手势处理 ====================
  // 注意：不使用 useCallback，避免捕获到 performAttack/performMove 的过期闭包
  const handleTouchTapRef = useRef<(clientX: number, clientY: number) => void>(() => {});
  handleTouchTapRef.current = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const worldX = (clientX - rect.left - rect.width / 2) / zoom - cameraRef.current.x;
    const worldY = (clientY - rect.top - rect.height / 2) / zoom - cameraRef.current.y;
    const r = Math.round(worldY / (HEX_SIZE * 1.5));
    const q = Math.round((worldX - HEX_SIZE * (Math.sqrt(3) / 2) * r) / (HEX_SIZE * Math.sqrt(3)));

    // 更新 hoveredHex（高亮显示+后续逻辑用）
    hoveredHexRef.current = { q, r };
    setHoveredHex({ q, r });
    setMousePos({ x: clientX, y: clientY });

    if (!activeUnit || !isPlayerTurn) return;
    if (!visibleSet.has(`${q},${r}`)) return;

    // 判断目标格内容
    const isOccupied = state.units.some(
      u => !u.isDead && !u.hasEscaped && u.combatPos.q === q && u.combatPos.r === r
    );

    // 如果已显示命中信息tooltip，检查是否点击同一个敌人（二次点击 = 攻击）
    if (mobileAttackTarget) {
      const isSameTarget = mobileAttackTarget.unit.combatPos.q === q && mobileAttackTarget.unit.combatPos.r === r;
      if (isSameTarget) {
        // 第二次点击同一个敌人 → 执行攻击
        setMobileAttackTarget(null);
        performAttack();
        return;
      }
      // 点击其他位置 → 关闭 tooltip（后续逻辑继续处理）
      setMobileAttackTarget(null);
    }

    // A) 已选技能 → 攻击逻辑处理（含自身技能、敌人攻击等）
    if (selectedAbility) {
      // 自身技能（盾墙/矛墙等）直接执行
      if (selectedAbility.targetType === 'SELF' && selectedAbility.range[0] === 0 && selectedAbility.range[1] === 0) {
        performAttack();
        return;
      }
      // 攻击技能：第一次点击敌人 → 显示命中信息tooltip
      if (isAttackLikeAbility(selectedAbility)) {
        const targetUnit = state.units.find(
          u => !u.isDead && !u.hasEscaped && u.team === 'ENEMY' && u.combatPos.q === q && u.combatPos.r === r
        );
        const dist = getHexDistance(activeUnit.combatPos, { q, r });
        const inRange = dist >= selectedAbility.range[0] && dist <= selectedAbility.range[1];
        if (targetUnit && inRange) {
          const attackerHeight = terrainData.get(`${activeUnit.combatPos.q},${activeUnit.combatPos.r}`)?.height || 0;
          const targetHeight = terrainData.get(`${q},${r}`)?.height || 0;
          const atkHeightDiff = attackerHeight - targetHeight;
          const polearmHitMod = getPolearmAdjacentHitPenalty(activeUnit, selectedAbility, dist);
          const hitBreakdown = calculateHitChance(activeUnit, targetUnit, state, atkHeightDiff, selectedAbility, polearmHitMod, getTerrainCombatMods(activeUnit.combatPos, targetUnit.combatPos, terrainData));
          setMobileAttackTarget({ unit: targetUnit, hitBreakdown, ability: selectedAbility });
          return;
        }
      }
      // 其他技能类型（治疗等）直接执行
      performAttack();
      return;
    }
    // B) 无技能选中 + 空格子 → 移动
    if (!isOccupied) {
      setMobileAttackTarget(null);
      performMove();
      return;
    }
    // C) 点击地图上的单位不再触发居中；仅保留顶部行动顺序条的聚焦入口
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // 双指：进入 pinch 模式
      isPinchingRef.current = true;
      isTouchDraggingRef.current = false;
      const [t0, t1] = [e.touches[0], e.touches[1]];
      const dx = t1.clientX - t0.clientX;
      const dy = t1.clientY - t0.clientY;
      pinchStartDistRef.current = Math.sqrt(dx * dx + dy * dy);
      pinchStartZoomRef.current = zoom;
      pinchMidpointRef.current = {
        x: (t0.clientX + t1.clientX) / 2,
        y: (t0.clientY + t1.clientY) / 2,
      };
    } else if (e.touches.length === 1) {
      // 单指：记录起始位置
      const t = e.touches[0];
      touchStartRef.current = { x: t.clientX, y: t.clientY, time: performance.now() };
      touchStartCameraRef.current = { x: cameraRef.current.x, y: cameraRef.current.y };
      isTouchDraggingRef.current = false;
      touchMovedDistRef.current = 0;
      isPinchingRef.current = false;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && isPinchingRef.current) {
      // 双指缩放
      const [t0, t1] = [e.touches[0], e.touches[1]];
      const dx = t1.clientX - t0.clientX;
      const dy = t1.clientY - t0.clientY;
      const currentDist = Math.sqrt(dx * dx + dy * dy);
      const scaleFactor = currentDist / pinchStartDistRef.current;
      const newZoom = Math.max(0.4, Math.min(2.0, pinchStartZoomRef.current * scaleFactor));
      setZoom(newZoom);
      // 同时跟踪中点位移进行平移
      const newMid = {
        x: (t0.clientX + t1.clientX) / 2,
        y: (t0.clientY + t1.clientY) / 2,
      };
      cameraRef.current.x += (newMid.x - pinchMidpointRef.current.x) / newZoom;
      cameraRef.current.y += (newMid.y - pinchMidpointRef.current.y) / newZoom;
      pinchMidpointRef.current = newMid;
      return;
    }
    if (e.touches.length === 1 && !isPinchingRef.current) {
      // 单指平移
      const t = e.touches[0];
      const dx = t.clientX - touchStartRef.current.x;
      const dy = t.clientY - touchStartRef.current.y;
      const movedDist = Math.sqrt(dx * dx + dy * dy);
      touchMovedDistRef.current = Math.max(touchMovedDistRef.current, movedDist);
      const DRAG_THRESHOLD = 10;
      if (touchMovedDistRef.current > DRAG_THRESHOLD) {
        isTouchDraggingRef.current = true;
        cameraRef.current.x = touchStartCameraRef.current.x + dx / zoom;
        cameraRef.current.y = touchStartCameraRef.current.y + dy / zoom;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      // 还有手指剩余（双指→单指过渡）
      isPinchingRef.current = false;
      if (e.touches.length === 1) {
        const t = e.touches[0];
        touchStartRef.current = { x: t.clientX, y: t.clientY, time: performance.now() };
        touchStartCameraRef.current = { x: cameraRef.current.x, y: cameraRef.current.y };
        touchMovedDistRef.current = 0;
        isTouchDraggingRef.current = false;
      }
      return;
    }
    // 所有手指松开
    const wasPinching = isPinchingRef.current;
    isPinchingRef.current = false;
    // Tap 检测：移动距离 < 10px 且时长 < 300ms
    const elapsed = performance.now() - touchStartRef.current.time;
    if (!wasPinching && touchMovedDistRef.current < 10 && elapsed < 300) {
      handleTouchTapRef.current(touchStartRef.current.x, touchStartRef.current.y);
    }
    isTouchDraggingRef.current = false;
    touchMovedDistRef.current = 0;
  };

  const tryTriggerRiposte = (defenderId: string, attackerId: string) => {
    const defender = state.units.find(u => u.id === defenderId && !u.isDead && !u.hasEscaped);
    const attacker = state.units.find(u => u.id === attackerId && !u.isDead && !u.hasEscaped);
    if (!defender || !attacker || !defender.isRiposte) return;
    if (getHexDistance(defender.combatPos, attacker.combatPos) !== 1) return;

    const defenderTerrain = terrainData.get(`${defender.combatPos.q},${defender.combatPos.r}`);
    const attackerTerrain = terrainData.get(`${attacker.combatPos.q},${attacker.combatPos.r}`);
    const heightDiff = (defenderTerrain?.height || 0) - (attackerTerrain?.height || 0);
    const baseHitInfo = calculateHitChance(defender, attacker, state, heightDiff, undefined, 0, getTerrainCombatMods(defender.combatPos, attacker.combatPos, terrainData));
    const ripostePenalty = hasPerk(defender, 'sword_mastery') ? 0 : 20;
    const finalHitChance = Math.max(5, Math.min(95, baseHitInfo.final - ripostePenalty));
    const isHit = rollHitCheck(finalHitChance);
    const weaponName = defender.equipment.mainHand?.name || '徒手';

    if (!isHit) {
      triggerDodgeEffect(attacker.id, defender.combatPos, attacker.combatPos);
      setFloatingTexts(prev => [...prev, {
        id: Date.now(),
        text: 'MISS',
        x: attacker.combatPos.q,
        y: attacker.combatPos.r,
        color: '#94a3b8',
        type: 'miss' as FloatingTextType,
        size: 'md' as const,
      }]);
      triggerAttackLine(defender.combatPos.q, defender.combatPos.r, attacker.combatPos.q, attacker.combatPos.r, '#7c3aed');
      addToLog(`🔄 ${defender.name} 进行反击，但未命中 ${attacker.name}！(${finalHitChance}%)`, 'skill');
      setTimeout(() => setFloatingTexts(prev => prev.slice(1)), 1200);
      return;
    }

    const dmgResult = calculateDamage(defender, attacker, { damageMult: 0.8, isRiposte: true });
    const floatTexts: { id: number; text: string; x: number; y: number; color: string; type: FloatingTextType; size: 'sm' | 'md' | 'lg' }[] = [];
    if (dmgResult.armorDamageDealt > 0) {
      floatTexts.push({
        id: Date.now(),
        text: dmgResult.armorDestroyed ? `🔄🛡💥-${dmgResult.armorDamageDealt}` : `🔄🛡-${dmgResult.armorDamageDealt}`,
        x: attacker.combatPos.q,
        y: attacker.combatPos.r,
        color: dmgResult.armorDestroyed ? '#f59e0b' : '#38bdf8',
        type: 'intercept' as FloatingTextType,
        size: 'sm' as const,
      });
    }
    floatTexts.push({
      id: Date.now() + 1,
      text: dmgResult.isCritical ? `🔄💥-${dmgResult.hpDamageDealt}` : `🔄-${dmgResult.hpDamageDealt}`,
      x: attacker.combatPos.q,
      y: attacker.combatPos.r,
      color: dmgResult.isCritical ? '#ff6b35' : '#a78bfa',
      type: (dmgResult.isCritical ? 'critical' : 'intercept') as FloatingTextType,
      size: dmgResult.isCritical ? 'lg' as const : 'md' as const,
    });
    setFloatingTexts(prev => [...prev, ...floatTexts]);
    triggerHitEffect(attacker.id);
    triggerAttackLine(defender.combatPos.q, defender.combatPos.r, attacker.combatPos.q, attacker.combatPos.r, '#7c3aed');
    triggerScreenShake(dmgResult.isCritical || dmgResult.willKill ? 'heavy' : 'light');
    addToLog(getDamageLogText(defender.name, attacker.name, weaponName, '反击', dmgResult), 'skill');
    if (ripostePenalty > 0) {
      addToLog('剑术未精通：反击命中率 -20%', 'info');
    }
    if (dmgResult.armorDestroyed) {
      const armorName = dmgResult.armorType === 'HELMET' ? '头盔' : '护甲';
      addToLog(`🛡 ${attacker.name} 的${armorName}被反击打碎！`, 'skill');
    }

    setState(prev => ({
      ...prev,
      units: prev.units.map(u => {
        if (u.id !== attacker.id) return u;
        const newHp = Math.max(0, u.hp - dmgResult.hpDamageDealt);
        const isDead = newHp <= 0;
        let updatedEquipment = { ...u.equipment };
        if (dmgResult.armorType === 'HELMET' && updatedEquipment.helmet) {
          updatedEquipment = {
            ...updatedEquipment,
            helmet: { ...updatedEquipment.helmet, durability: Math.max(0, updatedEquipment.helmet.durability - dmgResult.armorDamageDealt) }
          };
        } else if (dmgResult.armorType === 'ARMOR' && updatedEquipment.armor) {
          updatedEquipment = {
            ...updatedEquipment,
            armor: { ...updatedEquipment.armor, durability: Math.max(0, updatedEquipment.armor.durability - dmgResult.armorDamageDealt) }
          };
        }
        return { ...u, hp: newHp, isDead, equipment: updatedEquipment };
      })
    }));

    processDamageWithMorale(attacker.id, dmgResult.hpDamageDealt, defender.id, dmgResult);
    if (dmgResult.willKill) {
      triggerDeathEffect(attacker.combatPos.q, attacker.combatPos.r);
      showCenterBanner(`${attacker.name} 被 ${defender.name} 反击击杀！`, '#f59e0b', '💀');
      addToLog(`💀 ${attacker.name} 被反击击杀！`, 'kill');
    }
    setTimeout(() => setFloatingTexts(prev => prev.slice(1)), 1200);
  };

  const performAttack = (overrideAbility?: Ability) => {
    const ability = overrideAbility ?? selectedAbility;
    if (!activeUnit || !isPlayerTurn || !ability) return;
    const abilityFatCost = getEffectiveFatigueCost(activeUnit, ability);
    const isAttackAction = isAttackLikeAbility(ability);

    // 检查玩家单位是否在逃跑状态
    if (activeUnit.morale === MoraleStatus.FLEEING) {
      addToLog(`${activeUnit.name} 正在逃跑，无法行动！`, 'flee');
      return;
    }

    if (abilityFatCost > getRemainingFatigue(activeUnit)) {
      showInsufficientFatigue(ability.name, abilityFatCost);
      return;
    }

    // 矛墙规则：
    // 1) 架势期间不能主动攻击
    // 2) 执行其他操作会解除矛墙
    if (activeUnit.isHalberdWall) {
      if (isAttackAction) {
        addToLog(`🚧 ${activeUnit.name} 处于矛墙架势，无法主动攻击！`, 'info');
        return;
      }
      if (ability.id !== 'SPEARWALL') {
        setState(prev => ({
          ...prev,
          units: prev.units.map(u =>
            u.id === activeUnit.id ? { ...u, isHalberdWall: false } : u
          )
        }));
        addToLog(`🚧 ${activeUnit.name} 取消矛墙，改为执行「${ability.name}」。`, 'skill');
      }
    }

    // ==================== 无需选择目标的自身技能（盾墙、矛墙等）：点击即用 ====================
    if (ability.targetType === 'SELF' && ability.range[0] === 0 && ability.range[1] === 0) {
      const hoveredHex = hoveredHexRef.current;
      if (hoveredHex || overrideAbility) {
        if (ability.id === 'RELOAD') {
          if (activeUnit.currentAP < ability.apCost) { showInsufficientActionPoints(ability); return; }
          if (!isCrossbowUnit(activeUnit)) { addToLog('需要装备弩才能装填。', 'info'); return; }
          if (isCrossbowLoaded(activeUnit)) { addToLog(`${activeUnit.name} 的弩已装填。`, 'info'); return; }
          setState(prev => ({
            ...prev,
            units: prev.units.map(u =>
              u.id === activeUnit.id
                ? {
                    ...u,
                    currentAP: u.currentAP - ability.apCost,
                    fatigue: Math.min(u.maxFatigue, u.fatigue + abilityFatCost),
                    crossbowLoaded: true,
                  }
                : u
            )
          }));
          addToLog(`🔄 ${activeUnit.name} 完成装填。`, 'skill');
          if (!overrideAbility) setSelectedAbility(null);
          return;
        }
        if (ability.id === 'SHIELDWALL') {
          if (activeUnit.currentAP < ability.apCost) { showInsufficientActionPoints(ability); return; }
          if (activeUnit.equipment.offHand?.type !== 'SHIELD') { addToLog('需要装备盾牌！'); return; }
          if (activeUnit.isShieldWall) { addToLog(`${activeUnit.name} 已处于盾墙状态。`, 'info'); return; }
          setState(prev => ({
            ...prev,
            units: prev.units.map(u =>
              u.id === activeUnit.id
                ? { ...u, currentAP: u.currentAP - ability.apCost, fatigue: Math.min(u.maxFatigue, u.fatigue + abilityFatCost), isShieldWall: true }
                : u
            )
          }));
          addToLog(`🛡️ ${activeUnit.name} 架起盾墙！`, 'skill');
          if (!overrideAbility) setSelectedAbility(null);
          return;
        }
        if (ability.id === 'SPEARWALL') {
          if (activeUnit.isHalberdWall) {
            setState(prev => ({
              ...prev,
              units: prev.units.map(u =>
                u.id === activeUnit.id ? { ...u, isHalberdWall: false } : u
              )
            }));
            addToLog(`🚧 ${activeUnit.name} 取消了矛墙架势。`, 'skill');
            if (!overrideAbility) setSelectedAbility(null);
            return;
          }
          if (activeUnit.currentAP < ability.apCost) { showInsufficientActionPoints(ability); return; }
          const enemyAdjacent = state.units.some(u =>
            !u.isDead && !u.hasEscaped && u.team === 'ENEMY' && getHexDistance(activeUnit.combatPos, u.combatPos) === 1
          );
          if (enemyAdjacent) {
            addToLog('附近有敌人，无法架起矛墙！', 'info');
            return;
          }
          setState(prev => ({
            ...prev,
            units: prev.units.map(u =>
              u.id === activeUnit.id
                ? { ...u, currentAP: u.currentAP - ability.apCost, fatigue: Math.min(u.maxFatigue, u.fatigue + abilityFatCost), isHalberdWall: true }
                : u
            )
          }));
          addToLog(`🚧 ${activeUnit.name} 架起矛墙！`, 'skill');
          if (!overrideAbility) setSelectedAbility(null);
          return;
        }
        if (ability.id === 'RIPOSTE') {
          if (activeUnit.currentAP < ability.apCost) { showInsufficientActionPoints(ability); return; }
          if (activeUnit.isRiposte) { addToLog(`${activeUnit.name} 已处于反击姿态。`, 'info'); return; }
          setState(prev => ({
            ...prev,
            units: prev.units.map(u =>
              u.id === activeUnit.id
                ? {
                    ...u,
                    currentAP: u.currentAP - ability.apCost,
                    fatigue: Math.min(u.maxFatigue, u.fatigue + abilityFatCost),
                    isRiposte: true,
                  }
                : u
            )
          }));
          addToLog(`🔄 ${activeUnit.name} 进入反击姿态：受到近战攻击时将自动反击！`, 'skill');
          if (!overrideAbility) setSelectedAbility(null);
          return;
        }
        // === 太阿「天子之威」：周围4格所有敌人进行士气检定 ===
        if (ability.id === 'TAIE_MAJESTY') {
          if (activeUnit.currentAP < ability.apCost) { showInsufficientActionPoints(ability); return; }
          setState(prev => ({
            ...prev,
            units: prev.units.map(u =>
              u.id === activeUnit.id
                ? {
                    ...u,
                    currentAP: u.currentAP - ability.apCost,
                    fatigue: Math.min(u.maxFatigue, u.fatigue + abilityFatCost),
                  }
                : u
            )
          }));
          // 找周围4格内所有敌人
          const nearbyEnemies = state.units.filter(u =>
            !u.isDead && !u.hasEscaped &&
            u.team !== activeUnit.team &&
            getHexDistance(activeUnit.combatPos, u.combatPos) <= 4
          );
          if (nearbyEnemies.length > 0) {
            nearbyEnemies.forEach(enemy => {
              processDamageWithMorale(enemy.id, 0, activeUnit.id);
            });
            addToLog(`👑 天子之威！${activeUnit.name}释放天子剑意，周围敌军士气动摇！`, 'morale');
            showCenterBanner('天子之威！敌军胆寒！', '#fbbf24', '👑');
            triggerScreenShake('heavy');
          } else {
            addToLog(`👑 ${activeUnit.name} 释放天子之威，但附近没有敌人。`, 'info');
          }
          if (!overrideAbility) setSelectedAbility(null);
          return;
        }
      }
    }

    const hoveredHex = hoveredHexRef.current;
    if (!hoveredHex) return;

    const isVisible = visibleSet.has(`${hoveredHex.q},${hoveredHex.r}`);
    if (!isVisible) return;

    // ==================== 自身目标技能处理 ====================
    // 调息 (recover): 清除50%疲劳
    if (ability.id === 'RECOVER_SKILL') {
      if (activeUnit.currentAP < ability.apCost) { showInsufficientActionPoints(ability); return; }
      setState(prev => ({
        ...prev,
        units: prev.units.map(u => {
          if (u.id === activeUnit.id) {
            const fatigueReduction = Math.floor(u.fatigue * 0.5);
            return { ...u, currentAP: u.currentAP - ability.apCost, fatigue: u.fatigue - fatigueReduction };
          }
          return u;
        })
      }));
      addToLog(`😤 ${activeUnit.name} 使用调息，恢复了疲劳！`, 'skill');
      setSelectedAbility(null);
      return;
    }
    
    // 血勇 (adrenaline): 下回合行动顺序提前至最先
    if (ability.id === 'ADRENALINE_SKILL') {
      if (activeUnit.currentAP < ability.apCost) { showInsufficientActionPoints(ability); return; }
      setState(prev => ({
        ...prev,
        units: prev.units.map(u => {
          if (u.id === activeUnit.id) {
            return {
              ...u,
              currentAP: u.currentAP - ability.apCost,
              fatigue: Math.min(u.maxFatigue, u.fatigue + abilityFatCost),
              adrenalineActive: true,
            };
          }
          return u;
        })
      }));
      addToLog(`💉 ${activeUnit.name} 使用血勇，下回合将最先行动！`, 'skill');
      setSelectedAbility(null);
      return;
    }
    
    // 振军 (rally): 提高范围内盟友士气
    if (ability.id === 'RALLY_SKILL') {
      if (activeUnit.currentAP < ability.apCost) { showInsufficientActionPoints(ability); return; }
      const isBannermanRally = !!activeUnit.isBannerman;
      const rallyRange = isBannermanRally ? 6 : 4;
      setState(prev => {
        // 旗手强化振军：范围更大，低士气单位恢复更强
        const affectedAllies = prev.units.filter(u =>
          !u.isDead && !u.hasEscaped && u.team === activeUnit.team &&
          getHexDistance(u.combatPos, activeUnit.combatPos) <= rallyRange
        );
        const rallyNames: string[] = [];
        const moraleOrder: MoraleStatus[] = [
          MoraleStatus.FLEEING,
          MoraleStatus.BREAKING,
          MoraleStatus.WAVERING,
          MoraleStatus.STEADY,
          MoraleStatus.CONFIDENT,
        ];
        const improveMorale = (morale: MoraleStatus, steps: number): MoraleStatus => {
          const idx = moraleOrder.indexOf(morale);
          if (idx < 0) return morale;
          return moraleOrder[Math.min(moraleOrder.length - 1, idx + steps)];
        };
        const updatedUnits = prev.units.map(u => {
          if (u.id === activeUnit.id) {
            return {
              ...u,
              currentAP: u.currentAP - ability.apCost,
              fatigue: Math.min(u.maxFatigue, u.fatigue + abilityFatCost),
            };
          }
          // 提升盟友士气
          if (affectedAllies.some(a => a.id === u.id) && u.morale !== MoraleStatus.CONFIDENT) {
            const boostSteps = isBannermanRally && (u.morale === MoraleStatus.FLEEING || u.morale === MoraleStatus.BREAKING) ? 2 : 1;
            const newMorale = improveMorale(u.morale, boostSteps);
            if (newMorale !== u.morale) {
              rallyNames.push(u.name);
              return { ...u, morale: newMorale };
            }
          }
          return u;
        });
        return { ...prev, units: updatedUnits };
      });
      addToLog(isBannermanRally
        ? `🚩 ${activeUnit.name} 挥旗振军！大范围盟友士气提升！`
        : `📢 ${activeUnit.name} 振军鼓舞！周围盟友士气提升！`, 'skill');
      setSelectedAbility(null);
      return;
    }
    
    // 挑衅 (taunt): 迫使周围敌人攻击自己
    if (ability.id === 'TAUNT_SKILL') {
      if (activeUnit.currentAP < ability.apCost) { showInsufficientActionPoints(ability); return; }
      setState(prev => ({
        ...prev,
        units: prev.units.map(u => {
          if (u.id === activeUnit.id) {
            return {
              ...u,
              currentAP: u.currentAP - ability.apCost,
              fatigue: Math.min(u.maxFatigue, u.fatigue + abilityFatCost),
              taunting: true,
            };
          }
          return u;
        })
      }));
      addToLog(`🤬 ${activeUnit.name} 使用挑衅！周围敌人将优先攻击自己！`, 'skill');
      setSelectedAbility(null);
      return;
    }
    
    // 不屈 (indomitable): 受到伤害减半1回合
    if (ability.id === 'INDOMITABLE_SKILL') {
      if (activeUnit.currentAP < ability.apCost) { showInsufficientActionPoints(ability); return; }
      setState(prev => ({
        ...prev,
        units: prev.units.map(u => {
          if (u.id === activeUnit.id) {
            return {
              ...u,
              currentAP: u.currentAP - ability.apCost,
              fatigue: Math.min(u.maxFatigue, u.fatigue + abilityFatCost),
              isIndomitable: true,
            };
          }
          return u;
        })
      }));
      addToLog(`🗿 ${activeUnit.name} 使用不屈！受到的伤害将减半！`, 'skill');
      setSelectedAbility(null);
      return;
    }

    // ==================== 脱身技能处理 ====================
    if (ability.id === 'FOOTWORK_SKILL') {
      const dist = getHexDistance(activeUnit.combatPos, hoveredHex);
      
      // 脱身只能移动1格
      if (dist !== 1) {
        addToLog('脱身技能只能移动一格！');
        return;
      }
      
      // 检查AP和疲劳是否足够
      if (activeUnit.currentAP < ability.apCost) {
        showInsufficientActionPoints(ability);
        return;
      }
      
      // 检查目标位置是否被占用
      if (state.units.some(u => !u.isDead && !u.hasEscaped && u.combatPos.q === hoveredHex.q && u.combatPos.r === hoveredHex.r)) {
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
              currentAP: u.currentAP - ability.apCost,
              fatigue: Math.min(u.maxFatigue, u.fatigue + abilityFatCost)
            };
          }
          return u;
        })
      }));
      
      addToLog(`${activeUnit.name} 使用脱身，灵巧地避开了敌人！`, 'skill');
      setSelectedAbility(null);
      return;
    }
    
    // ==================== 换位技能处理 ====================
    if (ability.id === 'ROTATION_SKILL') {
      const allyTarget = state.units.find(u =>
        !u.isDead && !u.hasEscaped && u.team === 'PLAYER' && u.id !== activeUnit.id &&
        u.combatPos.q === hoveredHex.q && u.combatPos.r === hoveredHex.r
      );
      if (!allyTarget) {
        addToLog('需要选择一个相邻的盟友！');
        return;
      }
      const dist = getHexDistance(activeUnit.combatPos, hoveredHex);
      if (dist !== 1) {
        addToLog('换位只能选择相邻的盟友！');
        return;
      }
      if (activeUnit.currentAP < ability.apCost) {
        showInsufficientActionPoints(ability);
        return;
      }
      
      const myPos = { ...activeUnit.combatPos };
      const allyPos = { ...allyTarget.combatPos };
      setState(prev => ({
        ...prev,
        units: prev.units.map(u => {
          if (u.id === activeUnit.id) {
            return {
              ...u,
              combatPos: allyPos,
              currentAP: u.currentAP - ability.apCost,
              fatigue: Math.min(u.maxFatigue, u.fatigue + abilityFatCost)
            };
          }
          if (u.id === allyTarget.id) {
            return { ...u, combatPos: myPos };
          }
          return u;
        })
      }));
      
      addToLog(`🔄 ${activeUnit.name} 与 ${allyTarget.name} 交换了位置！`, 'skill');
      setSelectedAbility(null);
      return;
    }

    // ==================== 攻击处理 ====================
    const target = state.units.find(u => !u.isDead && !u.hasEscaped && u.combatPos.q === hoveredHex.q && u.combatPos.r === hoveredHex.r);
    if (target && target.team === 'ENEMY') {
        const dist = getHexDistance(activeUnit.combatPos, hoveredHex);
        
        // === 武器精通：射程修正 ===
        const masteryEffects = getWeaponMasteryEffects(activeUnit);
        let effectiveMaxRange = ability.range[1];
        if (masteryEffects.bowRangeBonus) {
          effectiveMaxRange += masteryEffects.bowRangeBonus;
        }
        
        if (dist >= ability.range[0] && dist <= effectiveMaxRange) {
            if (ability.id === 'SHOOT' && isCrossbowUnit(activeUnit) && !isCrossbowLoaded(activeUnit)) {
              addToLog(`${activeUnit.name} 的弩尚未装填，无法射击。`, 'info');
              return;
            }
            // === 武器精通：AP消耗修正 ===
            let apCost = ability.apCost || 4;
            if (masteryEffects.reducedApCost) {
              apCost = Math.min(apCost, masteryEffects.reducedApCost);
            }
            if (masteryEffects.daggerReducedAp && ability.type === 'ATTACK') {
              apCost = Math.min(apCost, masteryEffects.daggerReducedAp);
            }
            
            if (activeUnit.currentAP < apCost) {
              showInsufficientActionPoints({ ...ability, apCost });
              return;
            }
            
            // ==================== 命中判定（含合围加成） ====================
            const attackerTerrain = terrainData.get(`${activeUnit.combatPos.q},${activeUnit.combatPos.r}`);
            const targetTerrain = terrainData.get(`${target.combatPos.q},${target.combatPos.r}`);
            const heightDiff = (attackerTerrain?.height || 0) - (targetTerrain?.height || 0);
            const polearmHitMod = getPolearmAdjacentHitPenalty(activeUnit, ability, dist);
            const hitInfo = calculateHitChance(activeUnit, target, state, heightDiff, ability, polearmHitMod, getTerrainCombatMods(activeUnit.combatPos, target.combatPos, terrainData));
            const isHit = rollHitCheck(hitInfo.final);
            
            // 先扣除 AP 和疲劳（无论命中与否）
            setState(prev => ({
                ...prev,
                units: prev.units.map(u => {
                    if (u.id === activeUnit.id) return {
                      ...u,
                      currentAP: u.currentAP - apCost,
                      fatigue: Math.min(u.maxFatigue, u.fatigue + abilityFatCost),
                      // 连弩「机关连发」：射击后自动装填
                      crossbowLoaded: ability.id === 'SHOOT' && isCrossbowUnit(u) && u.equipment.mainHand?.id !== 'w_unique_liannu' ? false : u.crossbowLoaded,
                    };
                    return u;
                })
            }));
            
            if (!isHit) {
              // ==================== 未命中 ====================
              const weaponName = activeUnit.equipment.mainHand?.name || '徒手';
              triggerDodgeEffect(target.id, activeUnit.combatPos, target.combatPos);
              // 临机应变(fast_adaptation)：未命中叠层 +1
              if (hasPerk(activeUnit, 'fast_adaptation')) {
                setState(prev => ({
                  ...prev,
                  units: prev.units.map(u => u.id === activeUnit.id
                    ? { ...u, fastAdaptationStacks: (u.fastAdaptationStacks || 0) + 1 }
                    : u)
                }));
              }
              setFloatingTexts(prev => [...prev, {
                id: Date.now(),
                text: 'MISS',
                x: hoveredHex.q,
                y: hoveredHex.r,
                color: '#94a3b8',
                type: 'miss' as FloatingTextType,
                size: 'md' as const,
              }]);
              triggerAttackLine(activeUnit.combatPos.q, activeUnit.combatPos.r, hoveredHex.q, hoveredHex.r, '#475569');
              addToLog(`${activeUnit.name}「${weaponName}」${ability.name} → ${target.name}，未命中！(${hitInfo.final}%)${hasPerk(activeUnit, 'fast_adaptation') ? ` 🎯临机+${(activeUnit.fastAdaptationStacks || 0) + 1}0%` : ''}`, 'info');
              setTimeout(() => setFloatingTexts(prev => prev.slice(1)), 1200);
              tryTriggerRiposte(target.id, activeUnit.id);
              return;
            }
            
            // ==================== 命中：使用护甲伤害系统 ====================
            // 临机应变(fast_adaptation)：命中时重置叠层
            if (hasPerk(activeUnit, 'fast_adaptation') && (activeUnit.fastAdaptationStacks || 0) > 0) {
              setState(prev => ({
                ...prev,
                units: prev.units.map(u => u.id === activeUnit.id
                  ? { ...u, fastAdaptationStacks: 0 }
                  : u)
              }));
            }
            // 推撞：仅做位移控制，不造成伤害
            if (ability.id === 'KNOCK_BACK') {
              const dq = target.combatPos.q - activeUnit.combatPos.q;
              const dr = target.combatPos.r - activeUnit.combatPos.r;
              const pushPos = { q: target.combatPos.q + dq, r: target.combatPos.r + dr };
              const pushKey = `${pushPos.q},${pushPos.r}`;
              const hasTerrain = terrainData.has(pushKey);
              const blockedByUnit = state.units.some(u =>
                !u.isDead &&
                !u.hasEscaped &&
                u.id !== target.id &&
                u.combatPos.q === pushPos.q &&
                u.combatPos.r === pushPos.r
              );
              const pushed = hasTerrain && !blockedByUnit;

              if (pushed) {
                setState(prev => ({
                  ...prev,
                  units: prev.units.map(u =>
                    u.id === target.id ? { ...u, combatPos: pushPos, hasUsedFreeAttack: true } : u
                  )
                }));
                setFloatingTexts(prev => [...prev, {
                  id: Date.now(),
                  text: 'PUSH',
                  x: hoveredHex.q,
                  y: hoveredHex.r,
                  color: '#f59e0b',
                  type: 'block' as FloatingTextType,
                  size: 'md' as const,
                }]);
                addToLog(`👊 ${activeUnit.name} 推撞命中 ${target.name}，将其击退一格！(${hitInfo.final}%)`, 'skill');
              } else {
                setFloatingTexts(prev => [...prev, {
                  id: Date.now(),
                  text: 'BLOCKED',
                  x: hoveredHex.q,
                  y: hoveredHex.r,
                  color: '#94a3b8',
                  type: 'block' as FloatingTextType,
                  size: 'sm' as const,
                }]);
                addToLog(`👊 ${activeUnit.name} 推撞命中 ${target.name}，但后方受阻未能击退。(${hitInfo.final}%)`, 'info');
              }

              triggerHitEffect(target.id);
              triggerAttackLine(activeUnit.combatPos.q, activeUnit.combatPos.r, hoveredHex.q, hoveredHex.r, '#f59e0b');
              setTimeout(() => setFloatingTexts(prev => prev.slice(1)), 1200);
              tryTriggerRiposte(target.id, activeUnit.id);
              return;
            }
            const dmgOptions: Parameters<typeof calculateDamage>[2] = { abilityId: ability.id };
            if (ability.id === 'AIMED_SHOT') dmgOptions!.damageMult = AIMED_SHOT_DAMAGE_MULT;
            // 荆轲匕「见血封喉」：强制命中头部
            if (ability.id === 'JINGKE_EXECUTE') dmgOptions!.forceHitLocation = 'HEAD';
            const dmgResult = calculateDamage(activeUnit, target, dmgOptions);
            const weaponName = activeUnit.equipment.mainHand?.name || '徒手';
            const shouldTryStun = isHammerBashStunAttack(ability, activeUnit) && !dmgResult.willKill;
            const stunChance = shouldTryStun ? getHammerBashStunChance(activeUnit, target, dmgResult.hitLocation) : 0;
            let didStun = shouldTryStun && Math.random() * 100 < stunChance;
            // 雷公鞭「雷霆万钧」：必定击晕1回合（无视胆识）
            if (ability.id === 'LEIGONG_THUNDER' && !dmgResult.willKill) didStun = true;
            // 金刚锤「金刚碎」：额外击晕概率+25%
            if (ability.id === 'JINGANG_SHATTER' && !dmgResult.willKill && !didStun) {
              didStun = Math.random() * 100 < 25;
            }
            
            // === 命中后的专精效果 ===
            setState(prev => ({
              ...prev,
              units: prev.units.map(u => {
                // 攻击者效果
                if (u.id === activeUnit.id) {
                  const updates: any = {};
                  // 索首 (head_hunter): 命中身体后下次打头，命中头部后重置
                  if (hasHeadHunter(u)) {
                    updates.headHunterActive = dmgResult.hitLocation === 'BODY';
                  }
                  // 兵势 (reach_advantage): 双手武器命中+5近战防御
                  const reachBonus = getReachAdvantageBonus(u);
                  if (reachBonus > 0) {
                    updates.reachAdvantageBonus = (u.reachAdvantageBonus || 0) + reachBonus;
                  }
                  return Object.keys(updates).length > 0 ? { ...u, ...updates } : u;
                }
                // 目标效果
                if (u.id === target.id) {
                  const updates: any = {};
                  // 压制 (overwhelm): 被命中后累加压制层
                  const overwhelmAdd = getOverwhelmStacks(activeUnit);
                  if (overwhelmAdd > 0) {
                    updates.overwhelmStacks = (u.overwhelmStacks || 0) + overwhelmAdd;
                  }
                  if (didStun) {
                    updates.stunnedTurns = Math.max(u.stunnedTurns || 0, 1);
                  }
                  return Object.keys(updates).length > 0 ? { ...u, ...updates } : u;
                }
                return u;
              })
            }));
            
            // 推撞：命中后尝试将目标沿攻击方向击退1格（若后方被占用或越界则失败）
            if (ability.id === 'KNOCK_BACK' && !dmgResult.willKill) {
              const dq = target.combatPos.q - activeUnit.combatPos.q;
              const dr = target.combatPos.r - activeUnit.combatPos.r;
              const pushPos = { q: target.combatPos.q + dq, r: target.combatPos.r + dr };
              const pushKey = `${pushPos.q},${pushPos.r}`;
              const hasTerrain = terrainData.has(pushKey);
              const blockedByUnit = state.units.some(u =>
                !u.isDead &&
                !u.hasEscaped &&
                u.id !== target.id &&
                u.combatPos.q === pushPos.q &&
                u.combatPos.r === pushPos.r
              );

              if (hasTerrain && !blockedByUnit) {
                setState(prev => ({
                  ...prev,
                  units: prev.units.map(u =>
                    u.id === target.id ? { ...u, combatPos: pushPos, hasUsedFreeAttack: true } : u
                  )
                }));
                addToLog(`👊 ${activeUnit.name} 推撞 ${target.name}，将其击退一格！`, 'skill');
              } else {
                addToLog(`👊 ${activeUnit.name} 推撞 ${target.name}，但后方受阻未能击退。`, 'info');
              }
            }

            // === 红武主动技能命中后效果 ===
            // 金刚锤「金刚碎」：破坏被击中部位护甲最大耐久25%
            if (ability.id === 'JINGANG_SHATTER' && !dmgResult.willKill) {
              setState(prev => ({
                ...prev,
                units: prev.units.map(u => {
                  if (u.id !== target.id) return u;
                  const equipment = { ...u.equipment };
                  if (dmgResult.hitLocation === 'HEAD' && equipment.helmet && equipment.helmet.maxDurability > 0) {
                    const loss = Math.max(1, Math.floor(equipment.helmet.maxDurability * 0.25));
                    equipment.helmet = { ...equipment.helmet, maxDurability: equipment.helmet.maxDurability - loss, durability: Math.min(equipment.helmet.durability, equipment.helmet.maxDurability - loss) };
                  } else if (dmgResult.hitLocation === 'BODY' && equipment.armor && equipment.armor.maxDurability > 0) {
                    const loss = Math.max(1, Math.floor(equipment.armor.maxDurability * 0.25));
                    equipment.armor = { ...equipment.armor, maxDurability: equipment.armor.maxDurability - loss, durability: Math.min(equipment.armor.durability, equipment.armor.maxDurability - loss) };
                  }
                  return { ...u, equipment };
                })
              }));
              const shatterArmorName = dmgResult.hitLocation === 'HEAD' ? '头盔' : '护甲';
              addToLog(`🔨 金刚碎！${target.name} 的${shatterArmorName}最大耐久被永久破坏25%！`, 'skill');
            }

            // 构建浮动伤害文字（护甲伤害+HP伤害）
            const floatTexts: { id: number; text: string; x: number; y: number; color: string; type: FloatingTextType; size: 'sm' | 'md' | 'lg' }[] = [];
            
            // 护甲伤害（蓝色）
            if (dmgResult.armorDamageDealt > 0) {
              floatTexts.push({
                id: Date.now(),
                text: dmgResult.armorDestroyed ? `🛡💥-${dmgResult.armorDamageDealt}` : `🛡-${dmgResult.armorDamageDealt}`,
                x: hoveredHex.q,
                y: hoveredHex.r,
                color: dmgResult.armorDestroyed ? '#f59e0b' : '#38bdf8',
                type: 'damage' as FloatingTextType,
                size: 'sm' as const,
              });
            }
            // HP伤害（红色）
            floatTexts.push({
              id: Date.now() + 1,
              text: dmgResult.isCritical ? `💥-${dmgResult.hpDamageDealt}` : `-${dmgResult.hpDamageDealt}`,
              x: hoveredHex.q,
              y: hoveredHex.r,
              color: dmgResult.isCritical ? '#ff6b35' : '#ef4444',
              type: (dmgResult.isCritical ? 'critical' : 'damage') as FloatingTextType,
              size: dmgResult.isCritical ? 'lg' as const : 'md' as const,
            });
            if (didStun) {
              floatTexts.push({
                id: Date.now() + 2,
                text: '😵 击晕',
                x: hoveredHex.q,
                y: hoveredHex.r,
                color: '#a78bfa',
                type: 'morale' as FloatingTextType,
                size: 'md' as const,
              });
            }
            
            setFloatingTexts(prev => [...prev, ...floatTexts]);
            
            // 触发受击特效
            triggerHitEffect(target.id);
            triggerAttackLine(activeUnit.combatPos.q, activeUnit.combatPos.r, hoveredHex.q, hoveredHex.r, '#3b82f6');
            triggerScreenShake(dmgResult.isCritical || dmgResult.willKill ? 'heavy' : 'light');
            
            // 详细播报（含护甲信息）
            const logMsg = getDamageLogText(activeUnit.name, target.name, weaponName, ability.name, dmgResult);
            addToLog(logMsg, 'attack');
            // === 红武主动技能命中日志 ===
            if (ability.id === 'JINGKE_EXECUTE' && target.hp < target.maxHp * 0.3) {
              addToLog(`☠️ 见血封喉！荆轲匕的致命一击！`, 'skill');
            }
            if (didStun) {
              addToLog(`😵 ${target.name} 被${weaponName}击晕！（${Math.round(stunChance)}%）`, 'skill');
            }
            
            if (dmgResult.isCritical) {
              showCenterBanner(`${activeUnit.name} 暴击！-${dmgResult.hpDamageDealt}`, '#ff6b35', '💥');
            }
            if (dmgResult.armorDestroyed) {
              const armorName = dmgResult.armorType === 'HELMET' ? '头盔' : '护甲';
              addToLog(`🛡 ${target.name} 的${armorName}破碎了！`, 'attack');
            }
            
            setTimeout(() => setFloatingTexts(prev => prev.slice(1)), 1200);
            
            // 处理伤害和士气检定（传入完整伤害结果）
            processDamageWithMorale(target.id, dmgResult.hpDamageDealt, activeUnit.id, dmgResult);
            
            // 击杀特效和击杀奖励
            if (dmgResult.willKill) {
              triggerDeathEffect(target.combatPos.q, target.combatPos.r);
              showCenterBanner(`${target.name} 被 ${activeUnit.name} 击杀！`, '#f59e0b', '💀');
              addToLog(`💀 ${target.name} 阵亡！`, 'kill');
              
              // === 狂战 (berserk): 击杀回复行动点 ===
              const berserkAP = getBerserkAPRecovery(activeUnit);
              if (berserkAP > 0) {
                setState(prev => ({
                  ...prev,
                  units: prev.units.map(u => u.id === activeUnit.id
                    ? { ...u, currentAP: Math.min(9, u.currentAP + berserkAP) }
                    : u)
                }));
                addToLog(`😡 ${activeUnit.name} 狂战发动！回复 ${berserkAP} 点行动点！`, 'skill');
              }
              
              // === 杀意 (killing_frenzy): 击杀后伤害加成 ===
              if (hasPerk(activeUnit, 'killing_frenzy')) {
                const duration = 2;
                setState(prev => ({
                  ...prev,
                  units: prev.units.map(u => u.id === activeUnit.id
                    ? { ...u, killingFrenzyTurns: duration }
                    : u)
                }));
                addToLog(`🩸 ${activeUnit.name} 杀意激发！伤害提升25%，持续${duration}回合！`, 'skill');
              }

              // === 红武主动技能击杀效果 ===
              // 霸王枪「横扫千军」（主动技能）：击杀回4AP
              if (ability.id === 'BAWANG_SWEEP') {
                setState(prev => ({
                  ...prev,
                  units: prev.units.map(u => u.id === activeUnit.id
                    ? { ...u, currentAP: Math.min(9, u.currentAP + 4) }
                    : u)
                }));
                addToLog(`⚡ 所向披靡！${activeUnit.name} 击杀后回复4点行动点！`, 'skill');
              }
            }

            // === 红武主动技能：溅射效果 ===
            // 盘古斧「开天辟地」：对目标相邻1名敌人造成50%溅射伤害
            if (ability.id === 'PANGU_CLEAVE') {
              const targetNeighbors = getHexNeighbors(hoveredHex.q, hoveredHex.r);
              const splashTarget = state.units.find(u =>
                !u.isDead && !u.hasEscaped && u.team !== activeUnit.team && u.id !== target.id &&
                targetNeighbors.some((n: { q: number; r: number }) => n.q === u.combatPos.q && n.r === u.combatPos.r)
              );
              if (splashTarget) {
                const splashDmg = calculateDamage(activeUnit, splashTarget, { damageMult: 0.5 });
                setFloatingTexts(prev => [...prev, {
                  id: Date.now() + 20,
                  text: `-${splashDmg.hpDamageDealt}`,
                  x: splashTarget.combatPos.q,
                  y: splashTarget.combatPos.r,
                  color: '#f97316',
                  type: 'damage' as FloatingTextType,
                  size: 'sm' as const,
                }]);
                triggerHitEffect(splashTarget.id);
                addToLog(`💥 开天辟地！溅射波及 ${splashTarget.name}，造成 ${splashDmg.hpDamageDealt} 点伤害！`, 'skill');
                processDamageWithMorale(splashTarget.id, splashDmg.hpDamageDealt, activeUnit.id, splashDmg);
                if (splashDmg.willKill) {
                  triggerDeathEffect(splashTarget.combatPos.q, splashTarget.combatPos.r);
                  addToLog(`💀 ${splashTarget.name} 被溅射击杀！`, 'kill');
                }
              }
            }
            // 霸王枪「横扫千军」：对目标相邻1名敌人造成60%溅射伤害
            if (ability.id === 'BAWANG_SWEEP') {
              const targetNeighbors = getHexNeighbors(hoveredHex.q, hoveredHex.r);
              const splashTarget = state.units.find(u =>
                !u.isDead && !u.hasEscaped && u.team !== activeUnit.team && u.id !== target.id &&
                targetNeighbors.some((n: { q: number; r: number }) => n.q === u.combatPos.q && n.r === u.combatPos.r)
              );
              if (splashTarget) {
                const splashDmg = calculateDamage(activeUnit, splashTarget, { damageMult: 0.6 });
                setFloatingTexts(prev => [...prev, {
                  id: Date.now() + 21,
                  text: `-${splashDmg.hpDamageDealt}`,
                  x: splashTarget.combatPos.q,
                  y: splashTarget.combatPos.r,
                  color: '#f97316',
                  type: 'damage' as FloatingTextType,
                  size: 'sm' as const,
                }]);
                triggerHitEffect(splashTarget.id);
                addToLog(`💥 横扫千军！波及 ${splashTarget.name}，造成 ${splashDmg.hpDamageDealt} 点伤害！`, 'skill');
                processDamageWithMorale(splashTarget.id, splashDmg.hpDamageDealt, activeUnit.id, splashDmg);
                if (splashDmg.willKill) {
                  triggerDeathEffect(splashTarget.combatPos.q, splashTarget.combatPos.r);
                  addToLog(`💀 ${splashTarget.name} 被横扫击杀！`, 'kill');
                  // 横扫千军溅射击杀也回4AP
                  setState(prev => ({
                    ...prev,
                    units: prev.units.map(u => u.id === activeUnit.id
                      ? { ...u, currentAP: Math.min(9, u.currentAP + 4) }
                      : u)
                  }));
                  addToLog(`⚡ 所向披靡！${activeUnit.name} 击杀后回复4点行动点！`, 'skill');
                }
              }
            }

            // === 威压 (fearsome): 任何造成伤害的攻击触发士气检定 ===
            if (hasFearsome(activeUnit) && dmgResult.hpDamageDealt >= 1 && !dmgResult.willKill) {
              // 士气检定已在 processDamageWithMorale 中处理（handleHeavyDamage）
              // 威压的特殊效果是：即使伤害不够"重伤"标准也会触发检定
              // 额外触发一次轻微士气检定
              addToLog(`👻 ${activeUnit.name} 的威压令 ${target.name} 心生畏惧！`, 'morale');
            }
            tryTriggerRiposte(target.id, activeUnit.id);
        }
    }
  };

  const performMove = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    const hoveredHex = hoveredHexRef.current;
    if (!hoveredHex || !activeUnit || !isPlayerTurn) return;
    
    // 检查玩家单位是否在逃跑状态
    if (activeUnit.morale === MoraleStatus.FLEEING) {
      addToLog(`${activeUnit.name} 正在逃跑，无法控制！`, 'flee');
      return;
    }

    if (activeUnit.isHalberdWall) {
      addToLog(`🚧 ${activeUnit.name} 处于矛墙架势，不能移动。可先使用其他技能解除。`, 'info');
      return;
    }
    
    if (!visibleSet.has(`${hoveredHex.q},${hoveredHex.r}`)) return;

    const blockedHexes = buildBlockedHexSet(state.units, activeUnit.id, activeUnit.team, terrainData);
    const isDestinationOccupied = state.units.some(
      u => !u.isDead && !u.hasEscaped && u.id !== activeUnit.id &&
        u.combatPos.q === hoveredHex.q && u.combatPos.r === hoveredHex.r
    );
    if (isDestinationOccupied) return;
    const maxMoveSteps = getMaxMoveSteps(activeUnit, activeUnit.currentAP, activeUnit.fatigue);
    const movePath = findPathWithinSteps(activeUnit.combatPos, hoveredHex, blockedHexes, maxMoveSteps, terrainData, hasPerk(activeUnit, 'pathfinder'));
    if (!movePath || movePath.length === 0) return;

    const moveOutcome = evaluateMovePathOutcome(activeUnit, movePath);
    if (moveOutcome.stepsMoved <= 0) return;

    const actualPath = movePath.slice(0, moveOutcome.stepsMoved);
    const tileCosts = getPathTerrainCosts(actualPath, terrainData);
    const moveCost = getPathMoveCost(tileCosts, hasPerk(activeUnit, 'pathfinder'));
    const apCost = moveCost.apCost;
    const fatigueCost = moveCost.fatigueCost;
    
    // 双保险：二次确认前再次校验资源
    if (activeUnit.currentAP < apCost) {
      showInsufficientActionPoints({ ...ABILITIES.MOVE, apCost });
      return;
    }
    if (getRemainingFatigue(activeUnit) < fatigueCost) {
      showInsufficientFatigue('移动', fatigueCost);
      return;
    }

    const isSamePendingTarget =
      pendingMoveHex?.q === hoveredHex.q &&
      pendingMoveHex?.r === hoveredHex.r;
    if (!isSamePendingTarget) {
      // 第一次点击仅标记目标并刷新预览；第二次点击同格才真正移动。
      setPendingMoveHex(hoveredHex);
      return;
    }
    setPendingMoveHex(null);

    const movementTargetPos = moveOutcome.finalPos;
    const leaveZoCCheck = checkZoCOnMove(activeUnit, activeUnit.combatPos, movementTargetPos, state);
    const shouldStopOnZoCEntry = moveOutcome.enteredEnemyZoC;
    const shouldTriggerLeaveZoCIntercept = !shouldStopOnZoCEntry && leaveZoCCheck.inEnemyZoC && leaveZoCCheck.threateningEnemies.length > 0;
    const interceptFromPos = activeUnit.combatPos;
    
    if (shouldTriggerLeaveZoCIntercept) {
      // 处理截击攻击
      const { results, movementAllowed, totalDamage } = processZoCAttacks(
        activeUnit,
        interceptFromPos,
        state
      );
      
      // 显示截击结果（含护甲伤害信息）
      results.forEach((result, index) => {
        setTimeout(() => {
          // 添加日志
          addToLog(getFreeAttackLogText(result), 'intercept');
          
          // 显示伤害浮动文字
          if (result.hit && result.hpDamage > 0) {
            const floatTexts: { id: number; text: string; x: number; y: number; color: string; type: FloatingTextType; size: 'sm' | 'md' | 'lg' }[] = [];
            // 护甲伤害
            if (result.damageResult && result.damageResult.armorDamageDealt > 0) {
              floatTexts.push({
                id: Date.now() + index * 10,
                text: result.damageResult.armorDestroyed ? `⚡🛡💥-${result.damageResult.armorDamageDealt}` : `⚡🛡-${result.damageResult.armorDamageDealt}`,
                x: interceptFromPos.q,
                y: interceptFromPos.r,
                color: result.damageResult.armorDestroyed ? '#f59e0b' : '#38bdf8',
                type: 'intercept' as FloatingTextType,
                size: 'sm' as const,
              });
            }
            // HP伤害
            floatTexts.push({
              id: Date.now() + index * 10 + 1,
              text: `⚡-${result.hpDamage}`,
              x: interceptFromPos.q,
              y: interceptFromPos.r,
              color: '#f97316',
              type: 'intercept' as FloatingTextType,
              size: 'md' as const,
            });
            setFloatingTexts(prev => [...prev, ...floatTexts]);
            triggerHitEffect(activeUnit.id);
            triggerAttackLine(result.attacker.combatPos.q, result.attacker.combatPos.r, interceptFromPos.q, interceptFromPos.r, '#f97316');
            triggerScreenShake('light');
            // 护甲破碎提示
            if (result.damageResult?.armorDestroyed) {
              const armorName = result.damageResult.armorType === 'HELMET' ? '头盔' : '护甲';
              addToLog(`🛡 ${activeUnit.name} 的${armorName}破碎了！`, 'intercept');
            }
            setTimeout(() => setFloatingTexts(prev => prev.slice(1)), 1200);
          } else if (!result.hit) {
            triggerDodgeEffect(activeUnit.id, result.attacker.combatPos, activeUnit.combatPos);
            setFloatingTexts(prev => [...prev, {
              id: Date.now() + index * 10 + 2,
              text: 'MISS',
              x: interceptFromPos.q,
              y: interceptFromPos.r,
              color: '#94a3b8',
              type: 'miss' as FloatingTextType,
              size: 'md' as const,
            }]);
            triggerAttackLine(result.attacker.combatPos.q, result.attacker.combatPos.r, interceptFromPos.q, interceptFromPos.r, '#475569');
            setTimeout(() => setFloatingTexts(prev => prev.slice(1)), 1200);
          }
        }, index * 300);
      });
      
      // 更新状态：标记截击者已使用截击，处理伤害
      setState(prev => {
        const postInterceptPos = movementAllowed ? movementTargetPos : activeUnit.combatPos;

        let newUnits = prev.units.map(u => {
          // 标记已使用截击的敌人
          const usedFreeAttack = results.find(r => r.attacker.id === u.id);
          if (usedFreeAttack) {
            return { ...u, hasUsedFreeAttack: true };
          }
          return u;
        });
        
        // 处理移动单位的HP伤害和护甲耐久
        if (totalDamage > 0) {
          newUnits = newUnits.map(u => {
            if (u.id === activeUnit.id) {
              const newHp = Math.max(0, u.hp - totalDamage);
              // 累计所有截击的护甲损伤
              let updatedEquipment = { ...u.equipment };
              results.forEach(r => {
                if (r.hit && r.damageResult) {
                  const dr = r.damageResult;
                  if (dr.armorType === 'HELMET' && updatedEquipment.helmet) {
                    updatedEquipment = {
                      ...updatedEquipment,
                      helmet: { ...updatedEquipment.helmet!, durability: Math.max(0, updatedEquipment.helmet!.durability - dr.armorDamageDealt) }
                    };
                  } else if (dr.armorType === 'ARMOR' && updatedEquipment.armor) {
                    updatedEquipment = {
                      ...updatedEquipment,
                      armor: { ...updatedEquipment.armor!, durability: Math.max(0, updatedEquipment.armor!.durability - dr.armorDamageDealt) }
                    };
                  }
                }
              });
              return { 
                ...u, 
                hp: newHp,
                isDead: newHp <= 0,
                equipment: updatedEquipment,
                combatPos: postInterceptPos,
                currentAP: u.currentAP - apCost,
                fatigue: Math.min(u.maxFatigue, u.fatigue + fatigueCost),
              };
            }
            return u;
          });
        } else {
          // 无伤害，按截击结论落点（进入ZoC时固定停在进入格）
          newUnits = newUnits.map(u => {
            if (u.id === activeUnit.id) {
              return { 
                ...u, 
                combatPos: postInterceptPos,
                currentAP: u.currentAP - apCost,
                fatigue: Math.min(u.maxFatigue, u.fatigue + fatigueCost),
              };
            }
            return u;
          });
        }
        
        return { ...prev, units: newUnits };
      });
      
      // 离开ZoC被阻止时提示
      if (!movementAllowed && shouldTriggerLeaveZoCIntercept) {
        addToLog(`${activeUnit.name} 的移动被截击阻止！`, 'intercept');
        const lastResult = results[results.length - 1];
        if (lastResult?.targetKilled) {
          addToLog(`${activeUnit.name} 被截击击杀！`, 'kill');
          triggerDeathEffect(interceptFromPos.q, interceptFromPos.r);
          showCenterBanner(`${activeUnit.name} 被截击击杀！`, '#ef4444', '💀');
        }
      }
      
      // 处理截击造成的士气影响（传入护甲伤害结果）
      if (totalDamage > 0) {
        setTimeout(() => {
          results.forEach(result => {
            if (result.hit) {
              processDamageWithMorale(activeUnit.id, result.hpDamage, result.attacker.id, result.damageResult);
            }
          });
        }, results.length * 300 + 100);
      }
    } else if (shouldStopOnZoCEntry) {
      // 进入敌方控制区时，若对方存在矛墙则先结算“矛墙截击”
      const spearwallOutcome = processSpearwallEntryAttacks(activeUnit, moveOutcome.threateningEnemies, state);
      if (spearwallOutcome.triggered) {
        spearwallOutcome.results.forEach((result, index) => {
          setTimeout(() => {
            addToLog(`🚧 ${getFreeAttackLogText(result)}`, 'intercept');

            if (result.hit && result.hpDamage > 0) {
              const floatTexts: { id: number; text: string; x: number; y: number; color: string; type: FloatingTextType; size: 'sm' | 'md' | 'lg' }[] = [];
              if (result.damageResult && result.damageResult.armorDamageDealt > 0) {
                floatTexts.push({
                  id: Date.now() + index * 10,
                  text: result.damageResult.armorDestroyed ? `🚧🛡💥-${result.damageResult.armorDamageDealt}` : `🚧🛡-${result.damageResult.armorDamageDealt}`,
                  x: movementTargetPos.q,
                  y: movementTargetPos.r,
                  color: result.damageResult.armorDestroyed ? '#f59e0b' : '#38bdf8',
                  type: 'intercept' as FloatingTextType,
                  size: 'sm' as const,
                });
              }
              floatTexts.push({
                id: Date.now() + index * 10 + 1,
                text: `🚧-${result.hpDamage}`,
                x: movementTargetPos.q,
                y: movementTargetPos.r,
                color: '#f97316',
                type: 'intercept' as FloatingTextType,
                size: 'md' as const,
              });
              setFloatingTexts(prev => [...prev, ...floatTexts]);
              triggerHitEffect(activeUnit.id);
              triggerAttackLine(result.attacker.combatPos.q, result.attacker.combatPos.r, movementTargetPos.q, movementTargetPos.r, '#f97316');
              triggerScreenShake('light');
              setTimeout(() => setFloatingTexts(prev => prev.slice(1)), 1200);
            } else if (!result.hit) {
              triggerDodgeEffect(activeUnit.id, result.attacker.combatPos, movementTargetPos);
              setFloatingTexts(prev => [...prev, {
                id: Date.now() + index * 10 + 2,
                text: 'MISS',
                x: movementTargetPos.q,
                y: movementTargetPos.r,
                color: '#94a3b8',
                type: 'miss' as FloatingTextType,
                size: 'md' as const,
              }]);
              triggerAttackLine(result.attacker.combatPos.q, result.attacker.combatPos.r, movementTargetPos.q, movementTargetPos.r, '#475569');
              addToLog(`💨 ${activeUnit.name} 躲开了矛墙突刺，强行逼近！`, 'intercept');
              setTimeout(() => setFloatingTexts(prev => prev.slice(1)), 1200);
            }
          }, index * 280);
        });

        setState(prev => {
          const finalPos = spearwallOutcome.movementAllowed ? movementTargetPos : activeUnit.combatPos;
          const attemptedSpearwallIds = new Set(spearwallOutcome.results.map(r => r.attacker.id));

          let newUnits = prev.units.map(u => {
            if (attemptedSpearwallIds.has(u.id)) {
              return { ...u, hasUsedFreeAttack: true, isHalberdWall: false };
            }
            return u;
          });

          if (spearwallOutcome.totalDamage > 0) {
            newUnits = newUnits.map(u => {
              if (u.id !== activeUnit.id) return u;
              const newHp = Math.max(0, u.hp - spearwallOutcome.totalDamage);
              let updatedEquipment = { ...u.equipment };
              spearwallOutcome.results.forEach(r => {
                if (r.hit && r.damageResult) {
                  const dr = r.damageResult;
                  if (dr.armorType === 'HELMET' && updatedEquipment.helmet) {
                    updatedEquipment = {
                      ...updatedEquipment,
                      helmet: { ...updatedEquipment.helmet!, durability: Math.max(0, updatedEquipment.helmet!.durability - dr.armorDamageDealt) }
                    };
                  } else if (dr.armorType === 'ARMOR' && updatedEquipment.armor) {
                    updatedEquipment = {
                      ...updatedEquipment,
                      armor: { ...updatedEquipment.armor!, durability: Math.max(0, updatedEquipment.armor!.durability - dr.armorDamageDealt) }
                    };
                  }
                }
              });
              return {
                ...u,
                hp: newHp,
                isDead: newHp <= 0,
                equipment: updatedEquipment,
                combatPos: finalPos,
                currentAP: u.currentAP - apCost,
                fatigue: Math.min(u.maxFatigue, u.fatigue + fatigueCost),
              };
            });
          } else {
            newUnits = newUnits.map(u => u.id === activeUnit.id
              ? { ...u, combatPos: finalPos, currentAP: u.currentAP - apCost, fatigue: Math.min(u.maxFatigue, u.fatigue + fatigueCost) }
              : u
            );
          }

          return { ...prev, units: newUnits };
        });

        if (spearwallOutcome.movementAllowed) {
          addToLog(`⚠️ ${activeUnit.name} 破解矛墙，仍然进入了近身范围！`, 'intercept');
        } else {
          addToLog(`🚧 ${activeUnit.name} 被矛墙命中，无法上前！`, 'intercept');
          const lastResult = spearwallOutcome.results[spearwallOutcome.results.length - 1];
          if (lastResult?.targetKilled) {
            addToLog(`${activeUnit.name} 被矛墙截击击杀！`, 'kill');
            triggerDeathEffect(activeUnit.combatPos.q, activeUnit.combatPos.r);
            showCenterBanner(`${activeUnit.name} 被矛墙击杀！`, '#ef4444', '💀');
          }
        }

        if (spearwallOutcome.totalDamage > 0) {
          setTimeout(() => {
            spearwallOutcome.results.forEach(result => {
              if (result.hit) {
                processDamageWithMorale(activeUnit.id, result.hpDamage, result.attacker.id, result.damageResult);
              }
            });
          }, spearwallOutcome.results.length * 280 + 100);
        }
      } else {
        // 无矛墙时，进入控制区后停在进入格
        setState(prev => ({
          ...prev,
          units: prev.units.map(u => u.id === activeUnit.id
            ? { ...u, combatPos: movementTargetPos, currentAP: u.currentAP - apCost, fatigue: Math.min(u.maxFatigue, u.fatigue + fatigueCost) }
            : u)
        }));
        addToLog(`${activeUnit.name} 进入敌方控制区后停下。`, 'move');
      }
    } else {
      // 没有截击，正常移动
      setState(prev => ({
        ...prev,
        units: prev.units.map(u => u.id === activeUnit.id
          ? { ...u, combatPos: movementTargetPos, currentAP: u.currentAP - apCost, fatigue: Math.min(u.maxFatigue, u.fatigue + fatigueCost) }
          : u)
      }));
    }
  };

  const combatEndedRef = useRef(false);
  const endCombatAfterEnemyRout = useCallback(() => {
    if (combatEndedRef.current) return;
    combatEndedRef.current = true;
    setShowChaseChoice(false);
    const survivors = state.units.filter(u => u.team === 'PLAYER' && (!u.isDead || u.hasEscaped));
    const enemyUnits = state.units.filter(u => u.team === 'ENEMY');
    onCombatEnd(true, survivors, enemyUnits, state.round);
  }, [onCombatEnd, state.round, state.units]);
  
  // 阻止浏览器默认触控行为（弹性滚动、页面缩放等）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const preventDefault = (e: TouchEvent) => {
      if (e.touches.length >= 1) e.preventDefault();
    };
    container.addEventListener('touchmove', preventDefault, { passive: false });
    return () => container.removeEventListener('touchmove', preventDefault);
  }, []);

  useEffect(() => {
    // 防止重复触发
    if (combatEndedRef.current) return;
    
    // 至少经过1回合才判定胜负（防止初始化时误触发）
    if (state.round < 1) return;
    
    // 检查是否有一方全部死亡或逃跑
    const enemyRouted = checkTeamRouted('ENEMY', state);
    const playerRouted = checkTeamRouted('PLAYER', state);
    
    // 传统胜负判定
    const noEnemiesAlive = !state.units.some(u => u.team === 'ENEMY' && !u.isDead && !u.hasEscaped);
    const noPlayersAlive = !state.units.some(u => u.team === 'PLAYER' && !u.isDead && !u.hasEscaped);
    
    // 统计信息（用于日志观察）
    const totalEnemies = state.units.filter(u => u.team === 'ENEMY').length;
    const deadEnemies = state.units.filter(u => u.team === 'ENEMY' && u.isDead).length;
    const escapedEnemies = state.units.filter(u => u.team === 'ENEMY' && u.hasEscaped).length;
    const aliveEnemies = totalEnemies - deadEnemies - escapedEnemies;
    
    const totalPlayers = state.units.filter(u => u.team === 'PLAYER').length;
    const deadPlayers = state.units.filter(u => u.team === 'PLAYER' && u.isDead).length;
    const escapedPlayers = state.units.filter(u => u.team === 'PLAYER' && u.hasEscaped).length;
    const alivePlayers = totalPlayers - deadPlayers - escapedPlayers;
    
    console.log(`[胜负判定] 敌: ${totalEnemies}总/${deadEnemies}亡/${escapedEnemies}逃/${aliveEnemies}存 溃逃:${enemyRouted} 全灭:${noEnemiesAlive} | 己: ${totalPlayers}总/${deadPlayers}亡/${escapedPlayers}逃/${alivePlayers}存 溃逃:${playerRouted}`);
    
    // 敌军全员溃逃但尚未逃离时，允许玩家决定是否继续追击
    if (enemyRouted && !noEnemiesAlive && !noPlayersAlive && !showChaseChoice && !chaseChoiceHandledRef.current) {
      chaseChoiceHandledRef.current = true;
      setShowChaseChoice(true);
      addToLog('敌军全体溃逃！你可以选择继续追击，或就地收兵。', 'info');
      showCenterBanner('敌军溃逃！是否追击？', '#fbbf24', '⚑');
      return;
    }

    // 若敌军恢复士气，则允许未来再次触发该选择
    if (!enemyRouted) {
      chaseChoiceHandledRef.current = false;
    }

    if (noEnemiesAlive) {
      // 敌方已无可战单位（全部死亡/逃离）才结算胜利；全员溃逃时允许继续追击
      combatEndedRef.current = true;
      const survivors = state.units.filter(u => u.team === 'PLAYER' && (!u.isDead || u.hasEscaped));
      const enemyUnits = state.units.filter(u => u.team === 'ENEMY');
      onCombatEnd(true, survivors, enemyUnits, state.round);
    } else if (noPlayersAlive) {
      // 玩家场上已无可行动单位（可能为全灭，也可能为全员撤离）
      combatEndedRef.current = true;
      const survivors = state.units.filter(u => u.team === 'PLAYER' && u.hasEscaped);
      const enemyUnits = state.units.filter(u => u.team === 'ENEMY');
      onCombatEnd(false, survivors, enemyUnits, state.round, isRetreating);
    }
  }, [state.units, isRetreating, showChaseChoice, onCombatEnd, state.round]);

  // ==================== 键盘快捷键 ====================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showChaseChoice) return;
      // 只在玩家回合响应
      if (!isPlayerTurn || !activeUnit) return;

      const abilities = getUnitAbilities(activeUnit).filter(a => a.id !== 'MOVE' && !isWaitAbility(a));
      
      // 数字键 1-9 选择技能
      if (e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key) - 1;
        if (index < abilities.length) {
          setSelectedAbility(abilities[index]);
          e.preventDefault();
        }
      }

      // Space 等待（推迟行动顺序）
      if (e.key === ' ') {
        waitTurn();
        e.preventDefault();
      }

      // F 结束回合
      if (e.key === 'f' || e.key === 'F') {
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

      // Shift 移动镜头到当前选中的人物
      if (e.key === 'Shift') {
        const { x, y } = getPixelPos(activeUnit.combatPos.q, activeUnit.combatPos.r);
        cameraRef.current.x = -x;
        cameraRef.current.y = -y;
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlayerTurn, activeUnit, nextTurn, waitTurn, showChaseChoice]);

  const compactTextStyle = isCompactLandscape
    ? { fontSize: `clamp(0.62rem, ${1.28 * compactFontScale}vw, 0.8rem)` }
    : undefined;
  const compactBadgeTextStyle = isCompactLandscape
    ? { fontSize: `clamp(0.58rem, ${1.06 * compactFontScale}vw, 0.72rem)` }
    : undefined;
  const compactPanelStyle = isCompactLandscape
    ? {
        padding: `${Math.max(5, Math.round(8 * compactFontScale))}px ${Math.max(6, Math.round(10 * compactFontScale))}px`,
      }
    : undefined;
  const aliveUnits = useMemo(
    () => state.units.filter(u => !u.isDead && !u.hasEscaped),
    [state.units]
  );
  const nameDupCount = useMemo(() => {
    const map = new Map<string, number>();
    aliveUnits.forEach(u => {
      const key = `${u.team}:${u.name}`;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [aliveUnits]);
  const nameSeenIndex = useMemo(() => {
    const map = new Map<string, number>();
    aliveUnits.forEach(u => {
      const key = `${u.team}:${u.name}`;
      map.set(u.id, (map.get(key) || 0) + 1);
      map.set(key, map.get(u.id)!);
    });
    return map;
  }, [aliveUnits]);

  return (
    <div className="flex flex-col h-full w-full bg-[#050505] font-serif select-none overflow-hidden relative">
      <div className={`${isCompactLandscape ? 'h-10 px-2 gap-1 overflow-x-auto overflow-y-hidden' : 'h-12 px-6 gap-2'} bg-black border-b border-amber-900/40 flex items-center z-50 shrink-0`}>
        {state.turnOrder.map((uid, i) => {
          const u = state.units.find(u => u.id === uid);
          if (!u || u.isDead || u.hasEscaped) return null;
          const isCurrent = i === state.currentUnitIndex;
          const orderNum = i >= state.currentUnitIndex 
            ? i - state.currentUnitIndex 
            : state.turnOrder.length - state.currentUnitIndex + i;
          const hpPercent = (u.hp / u.maxHp) * 100;
          const hpColor = hpPercent > 50 ? '#4ade80' : hpPercent > 25 ? '#facc15' : '#ef4444';
          const nameKey = `${u.team}:${u.name}`;
          const dupCount = nameDupCount.get(nameKey) || 0;
          const seenIdx = nameSeenIndex.get(u.id) || 1;
          const displayName = dupCount > 1 ? `${u.name.slice(0, 2)}${seenIdx}` : u.name.slice(0, 3);
          return (
            <div 
              key={uid} 
              onClick={() => {
                const pos = getPixelPos(u.combatPos.q, u.combatPos.r);
                cameraRef.current.x = -pos.x;
                cameraRef.current.y = -pos.y;
              }}
              title={`点击聚焦到 ${u.name}`}
              className={`relative flex-shrink-0 transition-all duration-300 flex items-center gap-1.5 px-2 py-1 rounded-sm border cursor-pointer ${
                isCurrent 
                  ? 'scale-105 border-amber-500/80 bg-amber-900/30' 
                  : 'opacity-60 border-transparent hover:opacity-90'
              }`}
            >
              {/* 顺序标记 */}
              <div className={`${isCompactLandscape ? 'w-3.5 h-3.5 text-[7px]' : 'w-4 h-4 text-[8px]'} rounded-full flex items-center justify-center font-bold flex-shrink-0 ${
                isCurrent ? 'bg-amber-500 text-black' : 'bg-slate-700 text-slate-300'
              }`} style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
                {isCurrent ? '▶' : orderNum}
              </div>
              {/* 名字 + 血条 */}
              <div className={`${isCompactLandscape ? 'min-w-[34px]' : 'min-w-[40px]'} flex flex-col`}>
                <span className={`${isCompactLandscape ? 'text-[8px]' : 'text-[9px]'} font-bold truncate leading-none ${u.team === 'ENEMY' ? 'text-red-400' : 'text-blue-300'}`}>
                  {displayName}
                </span>
                <div className={`${isCompactLandscape ? 'h-[2px]' : 'h-[3px]'} w-full bg-black/60 rounded-full mt-0.5 overflow-hidden`}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${hpPercent}%`, backgroundColor: hpColor }} />
                </div>
              </div>
              {isCurrent && <div className="absolute -bottom-0.5 left-1 right-1 h-[2px] bg-amber-500 rounded-full" />}
            </div>
          );
        })}
      </div>

      <div ref={containerRef} className={`flex-1 relative bg-[#0a0a0a] ${screenShake === 'heavy' ? 'anim-screen-shake-heavy' : screenShake === 'light' ? 'anim-screen-shake-light' : ''}`} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} onMouseUp={handleMouseUp} onWheel={handleWheel} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} onTouchCancel={handleTouchEnd} style={{ touchAction: 'none' }}>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" onClick={isMobile ? undefined : performAttack} onContextMenu={isMobile ? undefined : performMove} />
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setShowUnitDetail(v => !v);
          }}
          className={`${isCompactLandscape ? 'top-1 right-1 px-2 py-1 text-[10px]' : 'top-2 right-2 px-2.5 py-1.5 text-[11px]'} absolute z-[72] rounded border border-amber-700/50 bg-black/70 text-amber-400 hover:bg-amber-950/40 transition-colors`}
          title={showUnitDetail ? '隐藏单位详情' : '显示单位详情'}
          aria-label={showUnitDetail ? '隐藏单位详情' : '显示单位详情'}
        >
          {showUnitDetail ? '隐藏详情' : '显示详情'}
        </button>
        {isPlayerTurn && activeUnit && (
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              requireDoubleClickForTurnAction('retreat', () => {
              if (isRetreating) return;
              setIsRetreating(true);
              addToLog('全军开始撤退，单位将自动向边缘移动。', 'flee');
              showCenterBanner('全军撤退！', '#f87171', '🏳');
              });
            }}
            disabled={isRetreating}
            title={isRetreating ? '撤退进行中' : '全军撤退'}
            className={`${isCompactLandscape ? 'top-1 right-20 px-2 py-0.5 text-[9px]' : isMobile ? 'top-2 right-28 px-2.5 py-1 text-[10px]' : 'top-2 right-32 px-3 py-1 text-[11px]'} absolute z-[70] rounded border transition-colors
              ${isRetreating
                ? 'border-red-900/40 bg-black/70 text-red-500 cursor-not-allowed'
                : 'border-red-700/60 bg-black/75 text-red-300 hover:bg-red-950/40'
              }`}
          >
            🏳 {isRetreating ? '撤退中' : '撤退'}
          </button>
        )}

        {/* 移动端操作提示 */}
        {isMobile && isPlayerTurn && activeUnit && (
          <div
            className={`${isCompactLandscape ? 'top-1.5 px-3 py-1' : 'top-3 px-4 py-1.5'} absolute left-1/2 -translate-x-1/2 z-50 bg-black/80 border border-amber-900/40 rounded-full text-amber-400 flex items-center gap-2 pointer-events-auto whitespace-nowrap`}
            style={compactTextStyle}
          >
            {selectedAbility
              ? mobileAttackTarget
                ? <>
                    <span className="text-base">⚔</span>
                    <span>再次点击 {mobileAttackTarget.unit.name} 攻击</span>
                    <button onClick={() => { setMobileAttackTarget(null); setSelectedAbility(null); }} className="ml-2 bg-red-900/60 text-red-300 px-2 py-0.5 rounded text-[10px]">取消</button>
                  </>
                : <>
                    <span className="text-base">{getAbilityIcon(selectedAbility)}</span>
                    <span>{selectedAbility.name} - 点击目标</span>
                    <button onClick={() => { setSelectedAbility(null); setMobileAttackTarget(null); }} className="ml-2 bg-red-900/60 text-red-300 px-2 py-0.5 rounded text-[10px]">取消</button>
                  </>
              : <span>双击地面移动 | 选择技能后点击敌人攻击</span>
            }
          </div>
        )}

        {/* 技能说明 tooltip：仅当没有悬停格子时显示，与命中率/地形 tooltip 互斥 */}
        {selectedAbility && isPlayerTurn && activeUnit && !hoveredHex && (
          <div
            className={`absolute ${isCompactLandscape ? 'right-1 top-1 w-56 max-w-[calc(100%-8px)]' : isMobile ? 'right-2 top-2 w-64 max-w-[calc(100%-12px)]' : 'right-3 top-3 w-72 max-w-[calc(100%-16px)]'} bg-[#0f0f0f] border border-amber-900/50 z-[100] rounded shadow-xl pointer-events-none`}
            style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.5)', ...compactPanelStyle }}
          >
            <div className="flex items-center justify-between mb-2 gap-2">
              <div className="text-amber-400 font-bold text-sm truncate">{selectedAbility.name}</div>
              <div className="flex gap-1.5 text-[9px] shrink-0">
                <span className="bg-red-900/60 text-red-300 px-1.5 py-0.5 rounded">行动点 {selectedAbility.apCost}</span>
                <span className="bg-blue-900/60 text-blue-300 px-1.5 py-0.5 rounded">疲劳 {selectedAbility.fatCost}</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed break-words">"{selectedAbility.description}"</p>
            {selectedAbility.range[1] > 0 && (
              <div className="text-[9px] text-slate-500 mt-2 pt-2 border-t border-white/10">
                射程: {selectedAbility.range[0]}-{selectedAbility.range[1]} 格
              </div>
            )}
          </div>
        )}

        {/* 移动端信息面板 - 攻击确认 / 地块+单位信息（互斥） */}
        {isMobile && (mobileAttackTarget || hoveredHex) && (() => {
          // 攻击确认模式
          if (mobileAttackTarget && isPlayerTurn && activeUnit) {
            const bd = mobileAttackTarget.hitBreakdown;
            const mobileAbilityFatCost = getEffectiveFatigueCost(activeUnit, mobileAttackTarget.ability);
            const hitColor = bd.final >= 70 ? '#4ade80' : bd.final >= 40 ? '#facc15' : '#ef4444';
            return (
              <div
                className={`${isCompactLandscape ? 'right-1 top-8' : 'right-2 top-10'} absolute pointer-events-none bg-[#0f0f0f]/95 border border-amber-900/50 text-[10px] text-amber-500 z-50 rounded shadow-xl max-w-[180px]`}
                style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.6)', ...compactPanelStyle }}
              >
                <div className="mb-2 pb-2 border-b border-red-500/30">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-red-300 font-bold">⚔ {mobileAttackTarget.ability.name} → {mobileAttackTarget.unit.name}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-slate-400 text-[9px]">命中率:</span>
                    <span className="text-lg font-bold" style={{ color: hitColor }}>{bd.final}%</span>
                  </div>
                  <div className="text-[8px] text-slate-500 mt-0.5">
                    技能 {bd.baseSkill} - 防御 {bd.targetDefense}
                    {bd.weaponMod ? ` + 武器 ${bd.weaponMod > 0 ? '+' : ''}${bd.weaponMod}` : ''}
                    {bd.moraleMod ? ` + 士气 ${bd.moraleMod > 0 ? '+' : ''}${bd.moraleMod}` : ''}
                    {bd.shieldDef ? ` - 盾牌 ${bd.shieldDef}` : ''}
                    {bd.shieldWallDef ? ` - 盾墙 ${bd.shieldWallDef}` : ''}
                    {bd.heightMod ? ` + 高地 ${bd.heightMod > 0 ? '+' : ''}${bd.heightMod}` : ''}
                  </div>
                  <div className="text-[8px] text-slate-400 mt-0.5">
                    敌方武器: {mobileAttackTarget.unit.equipment.mainHand?.name || '徒手'}
                  </div>
                  {bd.surroundBonus > 0 && (
                    <div className="text-[8px] text-amber-400 mt-0.5 font-bold">
                      + 合围 +{bd.surroundBonus}%
                    </div>
                  )}
                  {activeUnit.currentAP < mobileAttackTarget.ability.apCost && (
                    <div className="text-red-500 text-[9px] mt-1 font-bold">行动点不足!</div>
                  )}
                  {getRemainingFatigue(activeUnit) < mobileAbilityFatCost && (
                    <div className="text-blue-400 text-[9px] mt-1 font-bold">疲劳不足!</div>
                  )}
                </div>
                <div className="text-slate-400 text-[9px]">
                  再次点击该目标执行攻击
                </div>
              </div>
            );
          }

          // 地块信息模式
          if (hoveredHex && !mobileAttackTarget && visibleSet.has(`${hoveredHex.q},${hoveredHex.r}`)) {
            const hexKey = `${hoveredHex.q},${hoveredHex.r}`;
            const terrainAtHex = terrainData.get(hexKey);
            const terrainInfo = terrainAtHex ? TERRAIN_TYPES[terrainAtHex.type as keyof typeof TERRAIN_TYPES] : null;
            if (!terrainInfo) return null;

            const unitOnHex = state.units.find(
              u => !u.isDead && !u.hasEscaped && u.combatPos.q === hoveredHex.q && u.combatPos.r === hoveredHex.r
            );

            return (
              <div
                className={`${isCompactLandscape ? 'right-1 top-8' : 'right-2 top-10'} absolute pointer-events-none bg-[#0f0f0f]/95 border border-amber-900/50 text-[10px] text-amber-400 z-50 rounded shadow-xl max-w-[180px]`}
                style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.6)', ...compactPanelStyle }}
              >
                {/* 地形信息 */}
                <div className={unitOnHex ? 'pb-1.5 mb-1.5 border-b border-white/10' : ''}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-200 font-bold">{terrainInfo.name}</span>
                    <span className="text-[8px] text-slate-500">高度 {terrainAtHex!.height}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[9px]">
                    {terrainInfo.passable ? (
                      <span className="text-slate-400">移动消耗 {terrainInfo.moveCost} AP</span>
                    ) : (
                      <span className="text-red-400 font-bold">不可通行</span>
                    )}
                  </div>
                  {(terrainInfo.meleeAtkMod !== 0 || terrainInfo.meleeDefMod !== 0 || terrainInfo.rangedDefMod !== 0) && (
                    <div className="text-[8px] text-amber-300/80 mt-0.5">
                      {terrainInfo.meleeAtkMod !== 0 && <span>近攻{terrainInfo.meleeAtkMod > 0 ? '+' : ''}{terrainInfo.meleeAtkMod} </span>}
                      {terrainInfo.meleeDefMod !== 0 && <span>近防{terrainInfo.meleeDefMod > 0 ? '+' : ''}{terrainInfo.meleeDefMod} </span>}
                      {terrainInfo.rangedDefMod !== 0 && <span>远防{terrainInfo.rangedDefMod > 0 ? '+' : ''}{terrainInfo.rangedDefMod}</span>}
                    </div>
                  )}
                  {terrainInfo.description && terrainInfo.passable && (
                    <div className="text-[8px] text-slate-500 mt-0.5">{terrainInfo.description}</div>
                  )}
                </div>

                {/* 单位信息 */}
                {unitOnHex && (() => {
                  const u = unitOnHex;
                  const isEnemy = u.team === 'ENEMY';
                  const hpPct = (u.hp / u.maxHp) * 100;
                  const hpColor = hpPct > 50 ? '#22c55e' : hpPct > 25 ? '#eab308' : '#dc2626';
                  const helmet = u.equipment.helmet;
                  const helmetPct = helmet ? (helmet.durability / helmet.maxDurability) * 100 : 0;
                  const armor = u.equipment.armor;
                  const armorPct = armor ? (armor.durability / armor.maxDurability) * 100 : 0;
                  const weapon = u.equipment.mainHand;
                  const shield = u.equipment.offHand;
                  const hasShield = shield?.type === 'SHIELD';
                  const unitTypeName = isEnemy
                    ? (u.aiType === 'BEAST' ? '野兽' : u.aiType === 'ARMY' ? '军士' : u.aiType === 'ARCHER' ? '弓手' : '贼寇')
                    : (BACKGROUNDS[u.background]?.name || u.background);
                  const statuses = getUnitDisplayStatuses(u);
                  const moraleIcon = MORALE_ICONS[u.morale];
                  const moraleColor = MORALE_COLORS[u.morale];

                  return (
                    <div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`font-bold ${isEnemy ? 'text-red-300' : 'text-blue-300'}`}>
                          {u.name}
                        </span>
                        <span className="text-[8px] text-slate-500">{unitTypeName}</span>
                        <span className="text-[9px]" style={{ color: moraleColor }}>{moraleIcon}</span>
                      </div>

                      <div className="flex items-center gap-1 mb-0.5">
                        <span className="text-[8px] w-2 flex-shrink-0" style={{ color: hpColor }}>♥</span>
                        <div className="flex-1 h-[6px] rounded-sm overflow-hidden" style={{ backgroundColor: 'rgba(0,0,0,0.7)', border: '1px solid rgba(0,0,0,0.5)' }}>
                          <div className="h-full" style={{ width: `${hpPct}%`, backgroundColor: hpColor }} />
                        </div>
                        <span className="text-[7px] font-bold w-10 text-right" style={{ color: hpColor }}>{u.hp}/{u.maxHp}</span>
                      </div>

                      {helmet && (
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className="text-[8px] w-2 flex-shrink-0 text-cyan-400">⛑</span>
                          <div className="flex-1 h-[5px] rounded-sm overflow-hidden" style={{ backgroundColor: 'rgba(0,0,0,0.7)', border: '1px solid rgba(0,0,0,0.5)' }}>
                            <div className="h-full" style={{ width: `${helmetPct}%`, background: 'linear-gradient(to right, #0e7490, #06b6d4)' }} />
                          </div>
                          <span className="text-[7px] text-cyan-300 font-bold w-10 text-right">{helmet.durability}/{helmet.maxDurability}</span>
                        </div>
                      )}

                      {armor && (
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className="text-[8px] w-2 flex-shrink-0 text-slate-400">🛡</span>
                          <div className="flex-1 h-[5px] rounded-sm overflow-hidden" style={{ backgroundColor: 'rgba(0,0,0,0.7)', border: '1px solid rgba(0,0,0,0.5)' }}>
                            <div className="h-full" style={{ width: `${armorPct}%`, background: 'linear-gradient(to right, #64748b, #cbd5e1)' }} />
                          </div>
                          <span className="text-[7px] text-slate-300 font-bold w-10 text-right">{armor.durability}/{armor.maxDurability}</span>
                        </div>
                      )}

                      <div className="text-[8px] text-amber-300/80 mt-0.5">
                        ⚔ {weapon?.name || '徒手'}{weapon?.damage ? ` ${weapon.damage[0]}-${weapon.damage[1]}` : ''}
                      </div>

                      {hasShield && shield && (
                        <div className="text-[8px] text-sky-300/80 mt-0.5">
                          🛡 格挡 {shield.defenseBonus || 0} 耐久 {shield.durability}/{shield.maxDurability}
                        </div>
                      )}

                      {statuses.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 mt-1">
                          {statuses.map(s => (
                            <span
                              key={s.id}
                              className={`px-0.5 rounded border text-[8px] flex items-center gap-0.5 ${
                                s.tone === 'debuff' ? 'border-rose-600/60 bg-rose-950/50' : 'border-emerald-600/60 bg-emerald-950/50'
                              }`}
                              title={s.label}
                            >
                              <RenderIcon icon={s.icon} style={{ width: '10px', height: '10px' }} />
                              {s.badge && <span>{s.badge}</span>}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          }

          return null;
        })()}

        <div className="absolute inset-0 pointer-events-none">
          {state.units.map(u => {
            if (u.hasEscaped) return null;
            // 计算行动顺序：从当前活动单位开始往后数
            const orderIdx = state.turnOrder.indexOf(u.id);
            const turnIndex = orderIdx >= state.currentUnitIndex
              ? orderIdx - state.currentUnitIndex
              : state.turnOrder.length - state.currentUnitIndex + orderIdx;
            return (
              <div 
                key={u.id} 
                ref={el => { if(el) unitRefs.current.set(u.id, el); else unitRefs.current.delete(u.id); }} 
                // 单位详情卡仅作展示，避免拦截画布点击（否则会影响点击单位居中/移动/攻击）
                className="absolute pointer-events-none"
                style={{ width: `${Math.max(104, Math.round((showUnitDetail ? 152 : 112) * compactFontScale))}px`, height: 'auto' }}
              >
                <UnitCard
                  unit={u}
                  isActive={activeUnit?.id === u.id}
                  isHit={hitUnits.has(u.id)}
                  turnIndex={turnIndex}
                  compactFontScale={compactFontScale}
                  isCompactLandscape={isCompactLandscape}
                  showDetail={showUnitDetail}
                  dodgeDirection={dodgingUnits.get(u.id) || null}
                />
              </div>
            );
          })}
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

        {!isMobile && (selectedAbility ? hoveredHex : movePreviewHex) && isPlayerTurn && activeUnit && (() => {
          const infoHex = selectedAbility ? hoveredHex! : movePreviewHex!;
          if (!visibleSet.has(`${infoHex.q},${infoHex.r}`)) return null;
          const terrainAtHover = terrainData.get(`${infoHex.q},${infoHex.r}`);
          const terrainInfo = terrainAtHover ? TERRAIN_TYPES[terrainAtHover.type] : null;
          const heightDiff = terrainAtHover ? terrainAtHover.height - (terrainData.get(`${activeUnit.combatPos.q},${activeUnit.combatPos.r}`)?.height || 0) : 0;
          
          // 路径预览：中途首次进入控制区将停步
          const willTriggerZoC = !selectedAbility && !!movePreviewOutcome?.enteredEnemyZoC;
          
          // 攻击命中率计算（使用统一函数，含合围加成）
          const targetUnit = state.units.find(u => !u.isDead && !u.hasEscaped && u.team === 'ENEMY' && u.combatPos.q === infoHex.q && u.combatPos.r === infoHex.r);
          const dist = getHexDistance(activeUnit.combatPos, infoHex);
          const canAttack = isAttackLikeAbility(selectedAbility) && targetUnit && 
            dist >= selectedAbility.range[0] && dist <= selectedAbility.range[1] &&
            activeUnit.currentAP >= selectedAbility.apCost &&
            getRemainingFatigue(activeUnit) >= getEffectiveFatigueCost(activeUnit, selectedAbility);
          
          let hitChance = 0;
          let hitBreakdown: ReturnType<typeof calculateHitChance> | null = null;
          if (canAttack && targetUnit) {
            // 高度差：攻击者高度 - 目标高度（正值=攻击者在高处）
            const attackerHeight = terrainData.get(`${activeUnit.combatPos.q},${activeUnit.combatPos.r}`)?.height || 0;
            const targetHeight = terrainAtHover?.height || 0;
            const atkHeightDiff = attackerHeight - targetHeight;
            const polearmHitMod = getPolearmAdjacentHitPenalty(activeUnit, selectedAbility, dist);
            hitBreakdown = calculateHitChance(activeUnit, targetUnit, state, atkHeightDiff, selectedAbility, polearmHitMod, getTerrainCombatMods(activeUnit.combatPos, targetUnit.combatPos, terrainData));
            hitChance = hitBreakdown.final;
          }

          const hitColor = hitChance >= 70 ? '#4ade80' : hitChance >= 40 ? '#facc15' : '#ef4444';
          
          return (
            <div 
              className={`${isCompactLandscape ? 'right-2 top-2' : 'right-4 top-4'} absolute pointer-events-none bg-[#0f0f0f] border border-amber-900/50 text-[10px] text-amber-500 z-50 rounded shadow-xl`}
              style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.5)', ...compactPanelStyle }}
            >
              {/* 攻击命中率 - 选中攻击技能且悬停敌人时显示 */}
              {canAttack && targetUnit && hitBreakdown && (
                <div className="mb-2 pb-2 border-b border-red-500/30">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-1">
                      <span className="text-red-300 font-bold">{getAbilityIcon(selectedAbility!)} {selectedAbility!.name} → {targetUnit.name}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-slate-400 text-[9px]">命中率:</span>
                    <span className="text-lg font-bold" style={{ color: hitColor }}>{hitChance}%</span>
                  </div>
                  <div className="text-[8px] text-slate-500 mt-0.5">
                    技能 {hitBreakdown.baseSkill} - 防御 {hitBreakdown.targetDefense}
                    {hitBreakdown.weaponMod ? ` + 武器 ${hitBreakdown.weaponMod > 0 ? '+' : ''}${hitBreakdown.weaponMod}` : ''}
                    {hitBreakdown.moraleMod ? ` + 士气 ${hitBreakdown.moraleMod > 0 ? '+' : ''}${hitBreakdown.moraleMod}` : ''}
                    {hitBreakdown.shieldDef ? ` - 盾牌 ${hitBreakdown.shieldDef}` : ''}
                    {hitBreakdown.shieldWallDef ? ` - 盾墙 ${hitBreakdown.shieldWallDef}` : ''}
                    {hitBreakdown.heightMod ? ` + 高地 ${hitBreakdown.heightMod > 0 ? '+' : ''}${hitBreakdown.heightMod}` : ''}
                    {hitBreakdown.terrainMod ? ` + 地形 ${hitBreakdown.terrainMod > 0 ? '+' : ''}${hitBreakdown.terrainMod}` : ''}
                  </div>
                  <div className="text-[8px] text-slate-400 mt-0.5">
                    敌方武器: {targetUnit.equipment.mainHand?.name || '徒手'}
                  </div>
                  {hitBreakdown.surroundBonus > 0 && (
                    <div className="text-[8px] text-amber-400 mt-0.5 font-bold">
                      + 合围 +{hitBreakdown.surroundBonus}%
                    </div>
                  )}
                  {activeUnit.currentAP < (selectedAbility!.apCost || 4) && (
                    <div className="text-red-500 text-[9px] mt-1 font-bold">行动点不足!</div>
                  )}
                  {getRemainingFatigue(activeUnit) < getEffectiveFatigueCost(activeUnit, selectedAbility!) && (
                    <div className="text-blue-400 text-[9px] mt-1 font-bold">疲劳不足!</div>
                  )}
                </div>
              )}

              {/* 地形信息 */}
              {terrainInfo && (
                <div className="mb-1.5 pb-1.5 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-300 font-bold">{terrainInfo.name}</span>
                    {heightDiff > 0 && <span className="text-green-400 text-[9px]">↑高地+{heightDiff}</span>}
                    {heightDiff < 0 && <span className="text-red-400 text-[9px]">↓低地{heightDiff}</span>}
                    {!terrainInfo.passable && <span className="text-red-500 text-[9px] font-bold">🚫不可通行</span>}
                  </div>
                  {terrainInfo.description && terrainInfo.passable && (
                    <div className="text-amber-400 text-[8px] mt-0.5">{terrainInfo.description}</div>
                  )}
                </div>
              )}
              <div className="font-bold">
                {(() => {
                  const moveSteps = movePreviewOutcome?.stepsMoved ?? 0;
                  if (moveSteps <= 0 || !effectiveMovePreviewPath) return '移动消耗: -';
                  const tileCosts = getPathTerrainCosts(effectiveMovePreviewPath, terrainData);
                  const moveCost = getPathMoveCost(tileCosts, hasPerk(activeUnit, 'pathfinder'));
                  return `移动消耗: ${moveCost.apCost} 行动点 / ${moveCost.fatigueCost} 疲劳${hasPerk(activeUnit, 'pathfinder') ? ' 🧭' : ''}`;
                })()}
              </div>
              
              {/* 控制区警告 */}
              {willTriggerZoC && (
                <div className="mt-1.5 pt-1.5 border-t border-orange-500/30">
                  <div className="flex items-center gap-1 text-orange-400 font-bold">
                    <span>⚠️</span>
                    <span>路径将进入敌方控制区！</span>
                  </div>
                  <div className="text-orange-300 text-[9px] mt-0.5">
                    将在进入控制区第一格停步（不触发截击）
                  </div>
                  <div className="text-orange-200/70 text-[8px] mt-0.5">
                    单位会停在进入控制区的第一格
                  </div>
                  {checkZoCOnMove(activeUnit, activeUnit.combatPos, infoHex, state).canUseFootwork && (
                    <div className="text-green-400 text-[8px] mt-1">
                      💨 可使用"脱身"技能安全撤离
                    </div>
                  )}
                </div>
              )}
              
              <div className="text-slate-400 mt-1.5 text-[9px] border-t border-white/10 pt-1.5">
                <span className="bg-slate-700 px-1 rounded mr-1">右键×2</span> 移动
                <span className="mx-2">|</span>
                <span className="bg-slate-700 px-1 rounded mr-1">左键</span> 攻击
              </div>
            </div>
          );
        })()}
      </div>

      <div
        className={`absolute ${isCompactLandscape ? 'bottom-1 left-1 w-52' : isMobile ? 'bottom-2 left-2 w-64 max-w-[calc(100%-16px)]' : 'bottom-4 left-4 w-80'} z-[60] pointer-events-none`}
      >
        <div className="bg-black border border-amber-900/30 rounded-sm overflow-hidden pointer-events-auto">
          <div className={`px-3 py-1.5 flex items-center gap-2 ${isStatsPanelCollapsed ? '' : 'border-b border-amber-900/30'}`}>
            <span className="text-amber-600 text-[10px] font-bold tracking-widest flex-1 truncate">
              {activeUnit ? activeUnit.name : '当前单位'}
            </span>
            <span className="text-slate-600 text-[9px]">属性</span>
            <button
              type="button"
              onClick={() => setIsStatsPanelCollapsed(prev => !prev)}
              className="ml-1 text-[10px] text-slate-400 hover:text-amber-400 transition-colors leading-none"
              aria-label={isStatsPanelCollapsed ? '展开属性面板' : '收起属性面板'}
              title={isStatsPanelCollapsed ? '展开属性面板' : '收起属性面板'}
            >
              {isStatsPanelCollapsed ? '▶' : '▼'}
            </button>
          </div>
          {!isStatsPanelCollapsed && (
            <div className={`${isCompactLandscape ? 'px-2 py-1.5' : 'px-3 py-2'}`} style={compactPanelStyle}>
              {activeUnit ? (() => {
                const helmet = activeUnit.equipment.helmet;
                const helmetDur = helmet?.durability ?? 0;
                const helmetMax = helmet?.maxDurability ?? 0;
                const helmetPct = helmetMax > 0 ? (helmetDur / helmetMax) * 100 : 0;

                const armor = activeUnit.equipment.armor;
                const armorDur = armor?.durability ?? 0;
                const armorMax = armor?.maxDurability ?? 0;
                const armorPct = armorMax > 0 ? (armorDur / armorMax) * 100 : 0;

                const hpPct = (activeUnit.hp / activeUnit.maxHp) * 100;
                const hpColor = hpPct > 50 ? '#22c55e' : hpPct > 25 ? '#eab308' : '#dc2626';

                const maxFat = activeUnit.maxFatigue;
                const remaining = maxFat - activeUnit.fatigue;
                const staminaPct = maxFat > 0 ? (remaining / maxFat) * 100 : 0;
                const previewFatAfter = previewCosts
                  ? Math.min(maxFat, activeUnit.fatigue + previewCosts.fatigueCost)
                  : activeUnit.fatigue;
                const previewRemaining = maxFat - previewFatAfter;
                const previewStaminaPct = maxFat > 0 ? (previewRemaining / maxFat) * 100 : 0;
                const ghostWidth = staminaPct - previewStaminaPct;
                const totalAP = 9;
                const currentAP = activeUnit.currentAP;
                const previewAPAfter = previewCosts
                  ? Math.max(0, currentAP - previewCosts.apCost)
                  : currentAP;
                const barH = isCompactLandscape ? '6px' : isMobile ? '7px' : '8px';

                return (
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`${isCompactLandscape ? 'text-xs tracking-wide' : isMobile ? 'text-sm' : 'text-base'} font-bold text-amber-500 truncate`} style={isCompactLandscape ? compactTextStyle : undefined}>
                        {activeUnit.name}
                      </span>
                      <span
                        className={`${isCompactLandscape ? 'text-[9px] px-1 py-0' : 'text-[10px] px-1.5 py-0.5'} font-bold rounded flex-shrink-0`}
                        style={{
                          fontSize: isCompactLandscape ? compactBadgeTextStyle?.fontSize : undefined,
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
                      <span
                        className={`${isCompactLandscape ? 'text-[9px] px-1.5 py-0.5' : 'text-[11px] px-2 py-0.5'} font-extrabold rounded border ml-auto shadow-sm`}
                        style={{
                          color: currentAP > 0 ? '#facc15' : '#ef4444',
                          backgroundColor: currentAP > 0 ? 'rgba(120, 53, 15, 0.45)' : 'rgba(127, 29, 29, 0.45)',
                          borderColor: currentAP > 0 ? 'rgba(251, 191, 36, 0.55)' : 'rgba(248, 113, 113, 0.55)',
                          textShadow: '0 0 6px rgba(0,0,0,0.65)'
                        }}
                      >
                        ⚡ 行动点 {previewCosts ? `${currentAP}→${previewAPAfter}` : `${currentAP}`}/{totalAP}
                      </span>
                    </div>
                    <div className="flex gap-3">
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        <span className="text-[9px] text-cyan-400 w-3 flex-shrink-0 text-center" style={{ display: 'inline-block' }}>⛑</span>
                        <div className="flex-1 overflow-hidden rounded-sm border border-black/50" style={{ height: barH, boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)', backgroundColor: 'rgba(0,0,0,0.7)' }}>
                          <div className="h-full transition-all relative" style={{ width: `${helmetPct}%`, background: 'linear-gradient(to right, #0e7490, #06b6d4)' }}>
                            <div className="absolute inset-0 h-1/2" style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.25), transparent)' }} />
                          </div>
                        </div>
                        <span className={`${isCompactLandscape ? 'text-[7px]' : 'text-[8px]'} font-bold text-cyan-400 flex-shrink-0`} style={{ minWidth: isCompactLandscape ? '24px' : '30px', textAlign: 'right' }}>{helmetDur}/{helmetMax}</span>
                      </div>
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        <span className="text-[9px] text-slate-400 w-3 flex-shrink-0 text-center" style={{ display: 'inline-block' }}>🛡</span>
                        <div className="flex-1 overflow-hidden rounded-sm border border-black/50" style={{ height: barH, boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)', backgroundColor: 'rgba(0,0,0,0.7)' }}>
                          <div className="h-full transition-all relative" style={{ width: `${armorPct}%`, background: 'linear-gradient(to right, #64748b, #cbd5e1)' }}>
                            <div className="absolute inset-0 h-1/2" style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.3), transparent)' }} />
                          </div>
                        </div>
                        <span className={`${isCompactLandscape ? 'text-[7px]' : 'text-[8px]'} font-bold text-slate-300 flex-shrink-0`} style={{ minWidth: isCompactLandscape ? '24px' : '30px', textAlign: 'right' }}>{armorDur}/{armorMax}</span>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        <span className="text-[9px] w-3 flex-shrink-0 text-center" style={{ color: hpColor, display: 'inline-block' }}>♥</span>
                        <div className="flex-1 overflow-hidden rounded-sm border border-black/50" style={{ height: barH, boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)', backgroundColor: 'rgba(0,0,0,0.7)' }}>
                          <div className="h-full transition-all relative" style={{ width: `${hpPct}%`, backgroundColor: hpColor }}>
                            <div className="absolute inset-0 h-1/2" style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.2), transparent)' }} />
                          </div>
                        </div>
                        <span className={`${isCompactLandscape ? 'text-[7px]' : 'text-[8px]'} font-bold flex-shrink-0`} style={{ color: hpColor, minWidth: isCompactLandscape ? '24px' : '30px', textAlign: 'right' }}>{activeUnit.hp}/{activeUnit.maxHp}</span>
                      </div>
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        <span className="text-[9px] text-teal-400 w-3 flex-shrink-0 text-center" style={{ display: 'inline-block' }}>💪</span>
                        <div className="flex-1 overflow-hidden rounded-sm border border-black/50 relative" style={{ height: barH, boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)', backgroundColor: 'rgba(0,0,0,0.7)' }}>
                          <div className="h-full absolute left-0 top-0 transition-all" style={{ width: `${staminaPct}%` }}>
                            {ghostWidth > 0 && (
                              <div className="absolute right-0 top-0 h-full" style={{
                                width: `${staminaPct > 0 ? (ghostWidth / staminaPct) * 100 : 0}%`,
                                backgroundColor: 'rgba(245, 158, 11, 0.5)',
                                borderLeft: '1px solid rgba(245, 158, 11, 0.8)'
                              }} />
                            )}
                            <div className="h-full relative" style={{
                              width: ghostWidth > 0 && staminaPct > 0 ? `${(previewStaminaPct / staminaPct) * 100}%` : '100%',
                              background: 'linear-gradient(to right, #0d9488, #2dd4bf)'
                            }}>
                              <div className="absolute inset-0 h-1/2" style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.2), transparent)' }} />
                            </div>
                          </div>
                        </div>
                        <span className={`${isCompactLandscape ? 'text-[7px]' : 'text-[8px]'} font-bold text-teal-400 flex-shrink-0`} style={{ minWidth: isCompactLandscape ? '24px' : '30px', textAlign: 'right' }}>
                          {previewCosts ? `${remaining}→${previewRemaining}` : `${remaining}`}/{maxFat}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })() : (
                <div className="text-slate-500 text-[10px] text-center py-2">暂无可操作单位</div>
              )}
            </div>
          )}
        </div>
      </div>

      <div
        className={`absolute ${isCompactLandscape ? 'bottom-1 right-1 w-52' : isMobile ? 'bottom-2 right-2 w-72 max-w-[calc(100%-16px)]' : 'bottom-4 right-4 w-[26rem]'} z-[60] pointer-events-none`}
      >
        <div className="bg-black border border-amber-900/30 rounded-sm overflow-hidden pointer-events-auto">
          <div className={`px-3 py-1.5 flex items-center gap-2 ${isSkillsPanelCollapsed ? '' : 'border-b border-amber-900/30'}`}>
            <span className="text-amber-600 text-[10px] font-bold tracking-widest flex-1">技能</span>
            <span className="text-slate-600 text-[9px]">战斗操作</span>
            <button
              type="button"
              onClick={() => setIsSkillsPanelCollapsed(prev => !prev)}
              className="ml-1 text-[10px] text-slate-400 hover:text-amber-400 transition-colors leading-none"
              aria-label={isSkillsPanelCollapsed ? '展开技能面板' : '收起技能面板'}
              title={isSkillsPanelCollapsed ? '展开技能面板' : '收起技能面板'}
            >
              {isSkillsPanelCollapsed ? '▶' : '▼'}
            </button>
          </div>
          {!isSkillsPanelCollapsed && (
            <>
              {isPlayerTurn && activeUnit ? (
                <div className={`${isCompactLandscape ? 'p-1.5 gap-1.5 grid-cols-3' : isMobile ? 'p-2 gap-2 grid-cols-4' : 'p-3 gap-2 grid-cols-6'} grid`}>
                  {getUnitAbilities(activeUnit).filter(a => a.id !== 'MOVE' && !isWaitAbility(a)).map((skill, index) => {
                    const isSpearwallActive = skill.id === 'SPEARWALL' && !!activeUnit.isHalberdWall;
                    const isSpearwallDisabled = skill.id === 'SPEARWALL' && !isSpearwallActive && state.units.some(u =>
                      !u.isDead && !u.hasEscaped && u.team === 'ENEMY' && getHexDistance(activeUnit.combatPos, u.combatPos) === 1
                    );
                    const isReloadSkillDisabled = skill.id === 'RELOAD' && (!isCrossbowUnit(activeUnit) || isCrossbowLoaded(activeUnit));
                    const isCrossbowShootDisabled = skill.id === 'SHOOT' && isCrossbowUnit(activeUnit) && !isCrossbowLoaded(activeUnit);
                    const isAlreadyActiveBuff =
                      (skill.id === 'SHIELDWALL' && !!activeUnit.isShieldWall) ||
                      (skill.id === 'RIPOSTE' && !!activeUnit.isRiposte);
                    const skillFatigueCost = getEffectiveFatigueCost(activeUnit, skill);
                    const isAPDisabled = !isSpearwallActive && activeUnit.currentAP < skill.apCost;
                    const isFatigueDisabled = !isSpearwallActive && getRemainingFatigue(activeUnit) < skillFatigueCost;
                    const isSkillDisabled = isSpearwallDisabled || isAlreadyActiveBuff || isReloadSkillDisabled || isCrossbowShootDisabled || isAPDisabled || isFatigueDisabled;
                    return (
                      <button
                        key={skill.id}
                        onClick={() => {
                          if (isSkillDisabled) return;
                          // 矛墙已激活时，单击直接取消
                          if (skill.id === 'SPEARWALL' && activeUnit.isHalberdWall) {
                            performAttack(skill);
                            return;
                          }
                          if (skill.targetType === 'SELF' && skill.range[0] === 0 && skill.range[1] === 0) {
                            const now = Date.now();
                            const last = lastSelfSkillClickRef.current;
                            const isDoubleClick = !!last && last.skillId === skill.id && now - last.time <= 420;
                            lastSelfSkillClickRef.current = { skillId: skill.id, time: now };
                            if (!isDoubleClick) {
                              setSelectedAbility(skill);
                              addToLog(`再次点击 ${skill.name} 释放技能`, 'info');
                              return;
                            }
                            performAttack(skill);
                          } else {
                            setSelectedAbility(skill);
                          }
                        }}
                        disabled={isSkillDisabled}
                        title={
                          isSpearwallDisabled
                            ? '附近有敌人时无法架起矛墙'
                            : isAlreadyActiveBuff
                              ? '该姿态已生效，无法重复释放'
                              : isReloadSkillDisabled
                                ? '当前无需装填'
                                : isCrossbowShootDisabled
                                  ? '弩未装填，先使用装填'
                              : isAPDisabled
                                  ? `行动点不足（需要 ${skill.apCost}）`
                              : isFatigueDisabled
                                  ? `疲劳不足（需要 ${skillFatigueCost}）`
                              : skill.name
                        }
                        className={`${isCompactLandscape ? 'w-12 h-14' : isMobile ? 'w-14 h-[4.5rem]' : 'w-16 h-[4.75rem]'} border-2 transition-all flex flex-col items-center justify-center relative
                          ${isSkillDisabled ? 'opacity-50 cursor-not-allowed border-slate-700' : ''}
                          ${selectedAbility?.id === skill.id && !isSkillDisabled
                            ? 'border-amber-400 bg-gradient-to-b from-amber-900/60 to-amber-950/80 -translate-y-1 shadow-lg shadow-amber-500/30'
                            : !isSkillDisabled ? 'border-amber-900/30 bg-gradient-to-b from-black/40 to-black/60 hover:border-amber-600 hover:from-amber-900/20' : ''
                          }
                        `}
                        style={{ boxShadow: selectedAbility?.id === skill.id ? 'inset 0 1px 0 rgba(255,255,255,0.1)' : 'inset 0 -2px 4px rgba(0,0,0,0.3)' }}
                      >
                        {!isMobile && (
                          <span className="absolute -top-2 -left-1 w-4 h-4 bg-amber-700 text-[9px] font-bold text-white rounded flex items-center justify-center shadow">
                            {index + 1}
                          </span>
                        )}
                        <span className={`${isCompactLandscape ? 'text-base' : 'text-xl'} drop-shadow-md leading-none`}>{getAbilityIcon(skill)}</span>
                        <span className={`${isCompactLandscape ? 'text-[7px]' : 'text-[8px]'} absolute top-1 right-1 font-mono text-amber-500`}>{skill.apCost}</span>
                        <span className={`${isCompactLandscape ? 'text-[7px]' : 'text-[9px]'} mt-1 max-w-full px-1 text-slate-200 truncate leading-none`}>
                          {skill.name}
                        </span>
                      </button>
                    );
                  })}
                  <button
                    onClick={() => requireDoubleClickForTurnAction('wait', waitTurn)}
                    disabled={activeUnit.waitCount >= 1}
                    title={activeUnit.waitCount >= 1 ? '等待已使用' : '等待'}
                    className={`${isCompactLandscape ? 'w-12 h-14' : isMobile ? 'w-14 h-[4.5rem]' : 'w-16 h-[4.75rem]'} border-2 transition-all flex flex-col items-center justify-center relative
                      ${activeUnit.waitCount >= 1
                        ? 'bg-gradient-to-b from-slate-900/40 to-slate-950/60 border-slate-700/30 text-slate-600 cursor-not-allowed'
                        : 'border-slate-600/50 bg-gradient-to-b from-slate-800/40 to-slate-900/60 text-slate-300 hover:from-slate-600 hover:to-slate-700 hover:text-white'
                      }
                    `}
                    style={{ boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.3)' }}
                  >
                    {!isMobile && (
                      <span className="absolute -top-2 -left-1 px-1.5 h-4 bg-slate-700 text-[8px] font-bold text-white rounded flex items-center justify-center shadow">
                        Space
                      </span>
                    )}
                    <span className={`${isCompactLandscape ? 'text-base' : 'text-xl'} leading-none`}>⏳</span>
                    <span className={`${isCompactLandscape ? 'text-[7px]' : 'text-[9px]'} mt-1 max-w-full px-1 text-slate-200 truncate leading-none`}>
                      {activeUnit.waitCount >= 1 ? '等待(已用)' : '等待'}
                    </span>
                  </button>
                  <button
                    onClick={() => requireDoubleClickForTurnAction('end', nextTurn)}
                    title="结束回合"
                    className={`${isCompactLandscape ? 'w-12 h-14' : isMobile ? 'w-14 h-[4.5rem]' : 'w-16 h-[4.75rem]'} border-2 transition-all flex flex-col items-center justify-center relative border-amber-700/50 bg-gradient-to-b from-amber-900/20 to-amber-950/40 text-amber-400 hover:from-amber-600 hover:to-amber-700 hover:text-white`}
                    style={{ boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.3)' }}
                  >
                    {!isMobile && (
                      <span className="absolute -top-2 -left-1 px-1.5 h-4 bg-amber-700 text-[8px] font-bold text-white rounded flex items-center justify-center shadow">
                        F
                      </span>
                    )}
                    <span className={`${isCompactLandscape ? 'text-base' : 'text-xl'} leading-none`}>⏭</span>
                    <span className={`${isCompactLandscape ? 'text-[7px]' : 'text-[9px]'} mt-1 max-w-full px-1 text-amber-200 truncate leading-none`}>
                      结束回合
                    </span>
                  </button>
                </div>
              ) : (
                <div className={`${isCompactLandscape ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'} text-amber-900 animate-pulse font-bold tracking-widest uppercase`}>
                  敌军行动...
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ==================== 战斗日志面板（左侧悬浮） ==================== */}
      <div
        className={`absolute ${isCompactLandscape ? 'top-11 left-1 w-44 max-h-[22vh]' : isMobile ? 'top-14 left-1 w-48 max-h-[25vh]' : 'top-20 left-3 w-72 max-h-[45vh]'} z-[60] pointer-events-none`}
      >
        <div className="bg-black border border-amber-900/30 rounded-sm overflow-hidden pointer-events-auto">
          {/* 日志标题 */}
          <div className={`px-3 py-1.5 flex items-center gap-2 ${isCombatLogCollapsed ? '' : 'border-b border-amber-900/30'}`}>
            <span className="text-amber-600 text-[10px] font-bold tracking-widest flex-1">战斗日志</span>
            <span className="text-slate-600 text-[9px]">第{state.round}回合</span>
            <button
              type="button"
              onClick={() => setIsCombatLogCollapsed(prev => !prev)}
              className="ml-1 text-[10px] text-slate-400 hover:text-amber-400 transition-colors leading-none"
              aria-label={isCombatLogCollapsed ? '展开战斗日志' : '收起战斗日志'}
              title={isCombatLogCollapsed ? '展开战斗日志' : '收起战斗日志'}
            >
              {isCombatLogCollapsed ? '▶' : '▼'}
            </button>
          </div>
          {/* 日志条目 */}
          {!isCombatLogCollapsed && (
            <div className={`${isCompactLandscape ? 'px-1.5 py-1 max-h-[18vh]' : 'px-2 py-1 max-h-[38vh]'} space-y-0.5 overflow-y-auto`} style={{ scrollbarWidth: 'thin' }}>
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
                    <span className="flex-shrink-0 mt-0.5" style={{ color: style.color }}>
                      <RenderIcon icon={style.icon} style={{ width: '12px', height: '12px' }} />
                    </span>
                    <span style={{ color: i === 0 ? style.color : '#94a3b8' }}>{entry.text}</span>
                  </div>
                );
              })}
              {combatLogEntries.length === 0 && (
                <div className="text-slate-600 text-[10px] py-2 text-center italic">战斗开始...</div>
              )}
            </div>
          )}
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
            <span className="text-2xl">{renderBannerIcon(centerBanner.icon)}</span>
            <span 
              className="text-xl font-bold tracking-wider"
              style={{ color: centerBanner.color, textShadow: `0 0 10px ${centerBanner.color}60` }}
            >
              {centerBanner.text}
            </span>
          </div>
        </div>
      )}

      {/* 敌军全员溃逃后的选择：继续追击 or 收兵结算 */}
      {showChaseChoice && (
        <div className="fixed inset-0 z-[310] bg-black/80 backdrop-blur-[1px] flex items-center justify-center px-4">
          <div className="w-full max-w-lg border border-amber-700/50 bg-[#0f0b08] shadow-2xl">
            <div className="px-6 pt-6 pb-3 border-b border-amber-900/30 text-center">
              <div className="text-amber-400 text-xl font-bold tracking-widest">敌军已溃</div>
              <div className="mt-2 text-sm text-amber-200/85">
                敌人已全员溃逃，是否继续追击并争取更多击杀？
              </div>
            </div>
            <div className="px-6 py-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowChaseChoice(false);
                  addToLog('你下令继续追击溃敌！', 'info');
                  showCenterBanner('继续追击！', '#f59e0b', '⚔');
                }}
                className="py-2.5 border border-red-700/60 bg-red-950/30 text-red-300 hover:bg-red-900/40 transition-colors text-sm tracking-widest"
              >
                继续追击
              </button>
              <button
                type="button"
                onClick={() => {
                  addToLog('你下令停止追击，战斗结束。', 'info');
                  endCombatAfterEnemyRout();
                }}
                className="py-2.5 border border-amber-700/60 bg-amber-900/20 text-amber-300 hover:bg-amber-800/35 transition-colors text-sm tracking-widest"
              >
                就地收兵
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 快捷键帮助面板 */}
      {!isMobile && (
      <div className="fixed bottom-2 left-2 text-[8px] text-slate-600 z-50 bg-black/50 px-2 py-1 rounded">
        <span className="text-slate-500">快捷键:</span>
        <span className="ml-2"><b className="text-slate-400">1-9</b> 技能</span>
        <span className="ml-2"><b className="text-slate-400">Space</b> 等待(每回合1次)</span>
        <span className="ml-2"><b className="text-slate-400">F</b> 结束</span>
        <span className="ml-2"><b className="text-slate-400">WASD</b> 视角</span>
        <span className="ml-2"><b className="text-slate-400">+/-</b> 缩放</span>
        <span className="ml-2"><b className="text-slate-400">Shift/R</b> 聚焦人物</span>
        <span className="ml-2"><b className="text-slate-400">Esc</b> 取消</span>
      </div>
      )}

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
