/**
 * 野心目标选择弹窗
 * 展示候选目标和"无野心"选项，战国风格UI
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Party } from '../types';
import { generateAmbitionChoices, getAmbitionTypeInfo, AmbitionTemplate } from '../services/ambitionService';

interface AmbitionSelectProps {
  party: Party;
  onSelect: (ambitionId: string) => void;
  onSelectNoAmbition: () => void;
}

export const AmbitionSelect: React.FC<AmbitionSelectProps> = ({ party, onSelect, onSelectNoAmbition }) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pendingConfirmId, setPendingConfirmId] = useState<string | null>(null);
  const [pendingNoAmbitionConfirm, setPendingNoAmbitionConfirm] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [isCompactLandscape, setIsCompactLandscape] = useState(false);
  const [compactFontScale, setCompactFontScale] = useState(1);
  
  const { choices, showNoAmbition } = useMemo(
    () => generateAmbitionChoices(party),
    [party]
  );

  useEffect(() => {
    const detect = () => {
      const vw = window.visualViewport?.width ?? window.innerWidth;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const coarse = window.matchMedia('(pointer: coarse)').matches;
      const landscape = vw > vh;
      const compact = coarse && landscape;
      const dpr = window.devicePixelRatio || 1;
      const BASELINE_DPR = 1.7;
      const shortest = Math.min(vw, vh);
      const scale = Math.max(0.58, Math.min(1.08, (shortest / 440) * (BASELINE_DPR / dpr)));

      setIsMobileLayout(coarse || vw < 1024);
      setIsCompactLandscape(compact);
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

  useEffect(() => {
    if (!pendingConfirmId && !pendingNoAmbitionConfirm) return;
    const t = window.setTimeout(() => {
      setPendingConfirmId(null);
      setPendingNoAmbitionConfirm(false);
    }, 2200);
    return () => window.clearTimeout(t);
  }, [pendingConfirmId, pendingNoAmbitionConfirm]);

  if (choices.length === 0 && !showNoAmbition) return null;

  const cardColumns = isMobileLayout ? 1 : Math.min(choices.length, 3);

  return (
    <div
      className={`fixed inset-0 bg-black/85 z-[100] flex items-center justify-center ${
        isCompactLandscape ? 'p-2' : 'p-6'
      }`}
    >
      {/* 背景纹理 */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(139,69,19,0.4) 2px, rgba(139,69,19,0.4) 4px)' }}
      />
      
      <div
        className={`w-full relative flex flex-col overflow-hidden ${
          isCompactLandscape ? 'max-w-none h-full max-h-[96vh]' : 'max-w-3xl max-h-[92vh]'
        }`}
      >
        {/* 标题 */}
        <div
          className={`text-center ${
            isCompactLandscape ? 'mb-2' : 'mb-8'
          }`}
          style={isCompactLandscape ? {
            paddingTop: `${Math.max(1, Math.round(3 * compactFontScale))}px`,
            paddingLeft: `${Math.max(4, Math.round(8 * compactFontScale))}px`,
            paddingRight: `${Math.max(4, Math.round(8 * compactFontScale))}px`
          } : undefined}
        >
          <div className={`flex items-center justify-center ${isCompactLandscape ? 'gap-2 mb-1' : 'gap-4 mb-3'}`}>
            <div className={isCompactLandscape ? 'w-10 h-px bg-gradient-to-r from-transparent to-amber-700/60' : 'w-24 h-px bg-gradient-to-r from-transparent to-amber-700/60'} />
            <span
              className={`${isCompactLandscape ? 'text-[9px] tracking-[0.32em]' : 'text-xs tracking-[0.5em]'} text-amber-700/70 uppercase`}
            >
              选定志向
            </span>
            <div className={isCompactLandscape ? 'w-10 h-px bg-gradient-to-l from-transparent to-amber-700/60' : 'w-24 h-px bg-gradient-to-l from-transparent to-amber-700/60'} />
          </div>
          <h2
            className={`font-bold text-amber-400 ${isCompactLandscape ? 'tracking-[0.18em]' : 'tracking-[0.3em]'}`}
            style={isCompactLandscape ? { fontSize: `clamp(0.95rem, ${2.2 * compactFontScale}vw, 1.2rem)` } : undefined}
          >
            立下何等宏愿？
          </h2>
          <p
            className={`${isCompactLandscape ? 'text-[10px] mt-1' : 'text-sm mt-2'} text-slate-500 tracking-wider`}
            style={isCompactLandscape ? { fontSize: `clamp(0.62rem, ${1.4 * compactFontScale}vw, 0.72rem)` } : undefined}
          >
            选择一个目标作为战团的志向，完成后将增加声望并提升全员士气
          </p>
        </div>

        {/* 目标卡片列表 */}
        <div
          className={`min-h-0 ${
            isCompactLandscape
              ? 'flex items-stretch gap-2 overflow-x-auto overflow-y-hidden pr-1 pb-1'
              : 'grid gap-4 overflow-y-auto'
          }`}
          style={{
            gridTemplateColumns: isCompactLandscape ? undefined : `repeat(${cardColumns}, minmax(0, 1fr))`,
            paddingLeft: isCompactLandscape ? `${Math.max(4, Math.round(6 * compactFontScale))}px` : undefined,
            paddingRight: isCompactLandscape ? `${Math.max(4, Math.round(6 * compactFontScale))}px` : undefined
          }}
        >
          {choices.map((ambition) => {
            const typeInfo = getAmbitionTypeInfo(ambition.type);
            const isHovered = hoveredId === ambition.id;
            const isPendingConfirm = pendingConfirmId === ambition.id;
            
            return (
              <button
                key={ambition.id}
                onClick={() => {
                  if (isPendingConfirm) {
                    onSelect(ambition.id);
                    return;
                  }
                  setPendingNoAmbitionConfirm(false);
                  setPendingConfirmId(ambition.id);
                }}
                onMouseEnter={() => setHoveredId(ambition.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`relative text-left border transition-all duration-300 group min-w-0 ${
                  isCompactLandscape
                    ? 'p-3 flex-shrink-0 w-[38vw] max-w-[280px] min-w-[210px] h-[clamp(260px,62vh,420px)] flex flex-col'
                    : 'p-5'
                } ${
                  isPendingConfirm
                    ? 'bg-amber-900/40 border-amber-300/80 shadow-lg shadow-amber-900/30'
                    : isHovered
                    ? `bg-amber-900/30 border-amber-500/70 shadow-lg shadow-amber-900/20 ${isCompactLandscape ? '' : 'scale-[1.02]'}`
                    : 'bg-[#12100c]/90 border-amber-900/40 hover:border-amber-700/50'
                }`}
              >
                {/* 类型标签 */}
                <div className={`flex items-center ${isCompactLandscape ? 'gap-1.5 mb-2' : 'gap-2 mb-3'}`}>
                  <span className={isCompactLandscape ? 'text-sm' : 'text-base'}>{typeInfo.icon}</span>
                  <span className={`text-[9px] uppercase tracking-[0.2em] font-bold ${
                    isHovered ? 'text-amber-400' : 'text-amber-700'
                  }`}>
                    {typeInfo.name}
                  </span>
                </div>

                {/* 名称 */}
                <h3 className={`font-bold tracking-wider transition-colors ${
                  isCompactLandscape ? 'mb-1.5' : 'text-lg mb-2'
                } ${
                  isHovered ? 'text-amber-300' : 'text-amber-100'
                }`}
                  style={isCompactLandscape ? { fontSize: `clamp(0.74rem, ${1.75 * compactFontScale}vw, 0.92rem)` } : undefined}
                >
                  {ambition.name}
                </h3>

                {/* 描述 */}
                <p
                  className={`${isCompactLandscape ? 'text-[11px] leading-snug mb-2 flex-1' : 'text-sm leading-relaxed mb-4'} text-slate-400`}
                  style={isCompactLandscape ? { fontSize: `clamp(0.62rem, ${1.45 * compactFontScale}vw, 0.74rem)` } : undefined}
                >
                  {ambition.description}
                </p>

                {/* 奖励 */}
                <div className={`flex items-center flex-wrap transition-colors ${
                  isCompactLandscape ? 'gap-1.5 pt-2' : 'gap-2 pt-3'
                } border-t mt-auto ${
                  isHovered ? 'border-amber-700/40' : 'border-amber-900/20'
                }`}>
                  <span className="text-[10px] text-amber-700 uppercase tracking-widest">奖励</span>
                  <span
                    className={`font-bold ${isCompactLandscape ? 'text-[11px]' : 'text-sm'} ${isHovered ? 'text-amber-400' : 'text-amber-600'}`}
                  >
                    +{ambition.reputationReward} 声望
                  </span>
                  {ambition.goldReward > 0 && (
                    <span
                      className={`font-bold ${isCompactLandscape ? 'text-[11px]' : 'text-sm'} ${isHovered ? 'text-amber-400' : 'text-amber-600'}`}
                    >
                      +{ambition.goldReward} 金币
                    </span>
                  )}
                  <span className={`text-[10px] text-emerald-700 ${isCompactLandscape ? '' : 'ml-2'}`}>
                    + 全员士气提升
                  </span>
                </div>

                {/* 悬停高亮条 */}
                <div className={`absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber-500 to-transparent transition-opacity ${
                  (isHovered || isPendingConfirm) ? 'opacity-100' : 'opacity-0'
                }`} />
                {isPendingConfirm && (
                  <div className="absolute top-1.5 right-2 text-[10px] text-amber-300/90 tracking-wide">
                    再次点击确认
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* 无野心选项 */}
        {showNoAmbition && (
          <div className={`${isCompactLandscape ? 'mt-2' : 'mt-6'} text-center`}>
            <button
              onClick={() => {
                if (pendingNoAmbitionConfirm) {
                  onSelectNoAmbition();
                  return;
                }
                setPendingConfirmId(null);
                setPendingNoAmbitionConfirm(true);
              }}
              className={`${isCompactLandscape ? 'px-4 py-1.5 text-[11px]' : 'px-8 py-2.5 text-sm'} text-slate-600 hover:text-slate-400 border border-slate-800 hover:border-slate-600 tracking-wider transition-all`}
            >
              {pendingNoAmbitionConfirm ? '再次点击确认：暂无志向' : '暂无志向 — 约7日后再议'}
            </button>
          </div>
        )}

        {/* 底部说明 */}
        <div className={`${isCompactLandscape ? 'mt-2 pb-1' : 'mt-6'} text-center`}>
          <p className={`${isCompactLandscape ? 'text-[9px]' : 'text-[10px]'} text-slate-700 tracking-wider`}>
            选定后可随时取消（点击目标），但会降低全员士气
          </p>
        </div>
      </div>
    </div>
  );
};
