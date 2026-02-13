
import React, { useState, useEffect, useRef } from 'react';
import { GameTipData } from '../services/tipService';

interface GameTipProps {
  tip: GameTipData | null;
  onDismiss: () => void;
}

export const GameTip: React.FC<GameTipProps> = ({ tip, onDismiss }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const timerRef = useRef<number | null>(null);
  const prevTipIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (tip && tip.id !== prevTipIdRef.current) {
      prevTipIdRef.current = tip.id;
      setIsExiting(false);
      // 延迟一帧触发淡入动画
      requestAnimationFrame(() => setIsVisible(true));
      // 自动消失定时器
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        handleDismiss();
      }, tip.duration);
    }
    if (!tip) {
      prevTipIdRef.current = null;
      setIsVisible(false);
      setIsExiting(false);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [tip?.id]);

  const handleDismiss = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      setIsExiting(false);
      onDismiss();
    }, 400);
  };

  if (!tip) return null;

  const positionClass = tip.position === 'top' ? 'top-20' : 'bottom-24';

  return (
    <div
      className={`fixed left-1/2 -translate-x-1/2 z-[250] pointer-events-auto
        transition-all duration-500 ease-out
        ${positionClass}
        ${isVisible && !isExiting ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'}
      `}
      onClick={handleDismiss}
      style={{ cursor: 'pointer', maxWidth: '90vw', width: 'fit-content' }}
    >
      <div className="relative bg-[#0d0906]/95 border border-amber-800/50 shadow-2xl backdrop-blur-sm px-6 py-3.5 overflow-hidden">
        {/* 竹简纹理 */}
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(139,69,19,0.5) 3px, rgba(139,69,19,0.5) 4px)',
          }}
        />
        {/* 左侧琥珀色竖线 */}
        <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-gradient-to-b from-amber-600/80 via-amber-500/60 to-amber-600/80" />

        {/* 内容 */}
        <div className="relative flex items-start gap-3">
          <span className="text-amber-600 text-sm mt-0.5 shrink-0">策</span>
          <p className="text-amber-300/90 text-sm leading-relaxed tracking-wider">
            {tip.text}
          </p>
        </div>

        {/* 关闭提示 */}
        <div className="relative text-right mt-1.5">
          <span className="text-[9px] text-amber-800/50 tracking-widest">点击关闭</span>
        </div>
      </div>
    </div>
  );
};
