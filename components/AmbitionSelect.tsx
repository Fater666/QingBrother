/**
 * 野心目标选择弹窗
 * 展示候选目标和"无野心"选项，战国风格UI
 */

import React, { useState, useMemo } from 'react';
import { Party } from '../types';
import { generateAmbitionChoices, getAmbitionTypeInfo, AmbitionTemplate } from '../services/ambitionService';

interface AmbitionSelectProps {
  party: Party;
  onSelect: (ambitionId: string) => void;
  onSelectNoAmbition: () => void;
}

export const AmbitionSelect: React.FC<AmbitionSelectProps> = ({ party, onSelect, onSelectNoAmbition }) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  
  const { choices, showNoAmbition } = useMemo(
    () => generateAmbitionChoices(party),
    [party]
  );

  if (choices.length === 0 && !showNoAmbition) return null;

  return (
    <div className="fixed inset-0 bg-black/85 z-[100] flex items-center justify-center p-6">
      {/* 背景纹理 */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(139,69,19,0.4) 2px, rgba(139,69,19,0.4) 4px)' }}
      />
      
      <div className="w-full max-w-3xl relative">
        {/* 标题 */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-4 mb-3">
            <div className="w-24 h-px bg-gradient-to-r from-transparent to-amber-700/60" />
            <span className="text-xs text-amber-700/70 uppercase tracking-[0.5em]">选定志向</span>
            <div className="w-24 h-px bg-gradient-to-l from-transparent to-amber-700/60" />
          </div>
          <h2 className="text-2xl font-bold text-amber-400 tracking-[0.3em]">
            立下何等宏愿？
          </h2>
          <p className="text-sm text-slate-500 mt-2 tracking-wider">
            选择一个目标作为战团的志向，完成后将增加声望并提升全员士气
          </p>
        </div>

        {/* 目标卡片列表 */}
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(choices.length, 3)}, 1fr)` }}>
          {choices.map((ambition) => {
            const typeInfo = getAmbitionTypeInfo(ambition.type);
            const isHovered = hoveredId === ambition.id;
            
            return (
              <button
                key={ambition.id}
                onClick={() => onSelect(ambition.id)}
                onMouseEnter={() => setHoveredId(ambition.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`relative text-left p-5 border transition-all duration-300 group ${
                  isHovered
                    ? 'bg-amber-900/30 border-amber-500/70 shadow-lg shadow-amber-900/20 scale-[1.02]'
                    : 'bg-[#12100c]/90 border-amber-900/40 hover:border-amber-700/50'
                }`}
              >
                {/* 类型标签 */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-base">{typeInfo.icon}</span>
                  <span className={`text-[9px] uppercase tracking-[0.2em] font-bold ${
                    isHovered ? 'text-amber-400' : 'text-amber-700'
                  }`}>
                    {typeInfo.name}
                  </span>
                </div>

                {/* 名称 */}
                <h3 className={`text-lg font-bold tracking-wider mb-2 transition-colors ${
                  isHovered ? 'text-amber-300' : 'text-amber-100'
                }`}>
                  {ambition.name}
                </h3>

                {/* 描述 */}
                <p className="text-sm text-slate-400 leading-relaxed mb-4">
                  {ambition.description}
                </p>

                {/* 奖励 */}
                <div className={`flex items-center gap-2 pt-3 border-t transition-colors ${
                  isHovered ? 'border-amber-700/40' : 'border-amber-900/20'
                }`}>
                  <span className="text-[10px] text-amber-700 uppercase tracking-widest">奖励</span>
                  <span className={`text-sm font-bold ${isHovered ? 'text-amber-400' : 'text-amber-600'}`}>
                    +{ambition.reputationReward} 声望
                  </span>
                  <span className="text-[10px] text-emerald-700 ml-2">
                    + 全员士气提升
                  </span>
                </div>

                {/* 悬停高亮条 */}
                <div className={`absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber-500 to-transparent transition-opacity ${
                  isHovered ? 'opacity-100' : 'opacity-0'
                }`} />
              </button>
            );
          })}
        </div>

        {/* 无野心选项 */}
        {showNoAmbition && (
          <div className="mt-6 text-center">
            <button
              onClick={onSelectNoAmbition}
              className="px-8 py-2.5 text-slate-600 hover:text-slate-400 border border-slate-800 hover:border-slate-600 text-sm tracking-wider transition-all"
            >
              暂无志向 — 约7日后再议
            </button>
          </div>
        )}

        {/* 底部说明 */}
        <div className="mt-6 text-center">
          <p className="text-[10px] text-slate-700 tracking-wider">
            选定后可随时取消（点击目标），但会降低全员士气
          </p>
        </div>
      </div>
    </div>
  );
};
