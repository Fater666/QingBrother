
import React, { useState, useEffect } from 'react';

export interface SaveSlotMeta {
  slotIndex: number;
  timestamp: number;       // 保存时间戳
  day: number;             // 游戏天数
  gold: number;            // 金币
  mercCount: number;       // 佣兵数
  leaderName: string;      // 队长名
  view: string;            // 保存时的视图
}

const SAVE_KEY_PREFIX = 'zhanguo_save_slot_';
const SAVE_META_KEY = 'zhanguo_save_meta';
const AUTO_SAVE_KEY = 'zhanguo_auto_save';
const AUTO_SAVE_META_KEY = 'zhanguo_auto_save_meta';
const MAX_SLOTS = 3;

export const getSaveSlotKey = (slot: number) => `${SAVE_KEY_PREFIX}${slot}`;
export const getAutoSaveKey = () => AUTO_SAVE_KEY;

export const getAllSaveMetas = (): (SaveSlotMeta | null)[] => {
  try {
    const raw = localStorage.getItem(SAVE_META_KEY);
    if (!raw) return Array(MAX_SLOTS).fill(null);
    const metas: (SaveSlotMeta | null)[] = JSON.parse(raw);
    // 确保长度正确
    while (metas.length < MAX_SLOTS) metas.push(null);
    return metas.slice(0, MAX_SLOTS);
  } catch {
    return Array(MAX_SLOTS).fill(null);
  }
};

export const hasAnySaveData = (): boolean => {
  return getAllSaveMetas().some(m => m !== null) || getAutoSaveMeta() !== null;
};

export const saveMetas = (metas: (SaveSlotMeta | null)[]) => {
  localStorage.setItem(SAVE_META_KEY, JSON.stringify(metas));
};

export const getAutoSaveMeta = (): SaveSlotMeta | null => {
  try {
    const raw = localStorage.getItem(AUTO_SAVE_META_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const saveAutoMeta = (meta: SaveSlotMeta) => {
  localStorage.setItem(AUTO_SAVE_META_KEY, JSON.stringify(meta));
};

interface SaveLoadPanelProps {
  mode: 'SAVE' | 'LOAD';
  onSave?: (slotIndex: number) => void;
  onLoad?: (slotIndex: number) => void;
  onLoadAuto?: () => void;
  onClose: () => void;
}

const formatDate = (ts: number): string => {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const SaveLoadPanel: React.FC<SaveLoadPanelProps> = ({ mode, onSave, onLoad, onLoadAuto, onClose }) => {
  const [metas, setMetas] = useState<(SaveSlotMeta | null)[]>([]);
  const [autoMeta, setAutoMeta] = useState<SaveSlotMeta | null>(null);
  const [confirmSlot, setConfirmSlot] = useState<number | null>(null);

  useEffect(() => {
    setMetas(getAllSaveMetas());
    setAutoMeta(getAutoSaveMeta());
  }, []);

  const handleSlotClick = (slotIndex: number) => {
    if (mode === 'SAVE') {
      // 如果已有存档，先确认覆盖
      if (metas[slotIndex]) {
        setConfirmSlot(slotIndex);
      } else {
        onSave?.(slotIndex);
        onClose();
      }
    } else {
      // 读档模式：只有有存档的才能点
      if (metas[slotIndex]) {
        onLoad?.(slotIndex);
        onClose();
      }
    }
  };

  const handleConfirmOverwrite = () => {
    if (confirmSlot !== null) {
      onSave?.(confirmSlot);
      onClose();
    }
  };

  const handleDeleteSlot = (e: React.MouseEvent, slotIndex: number) => {
    e.stopPropagation();
    localStorage.removeItem(getSaveSlotKey(slotIndex));
    const newMetas = [...metas];
    newMetas[slotIndex] = null;
    saveMetas(newMetas);
    setMetas(newMetas);
  };

  const handleAutoSlotClick = () => {
    if (mode !== 'LOAD' || !autoMeta) return;
    onLoadAuto?.();
    onClose();
  };

  const title = mode === 'SAVE' ? '刻 录 简 牍' : '续 读 简 牍';
  const subtitle = mode === 'SAVE' ? '选择存档位' : '选择读档位';

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* 覆盖确认弹窗 */}
      {confirmSlot !== null && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60">
          <div className="bg-[#1a110a] border border-amber-900/60 p-6 max-w-sm w-full mx-4 shadow-2xl">
            <p className="text-amber-400 text-center tracking-widest mb-6">
              此栏位已有存档，确定覆盖？
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmSlot(null)}
                className="flex-1 py-2 border border-slate-700/50 text-slate-400 hover:text-slate-200 text-sm tracking-widest transition-all hover:border-slate-600"
              >
                取消
              </button>
              <button
                onClick={handleConfirmOverwrite}
                className="flex-1 py-2 border border-amber-700/60 bg-amber-900/20 text-amber-400 hover:bg-amber-800/40 text-sm tracking-widest transition-all"
              >
                确认覆盖
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-lg max-h-[88vh] bg-[#0d0906] border border-amber-900/40 shadow-2xl relative overflow-y-auto mx-4">
        {/* 竹简纹理背景 */}
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(139,69,19,0.5) 3px, rgba(139,69,19,0.5) 4px)' }}
        />

        {/* 标题 */}
        <div className="relative px-8 pt-8 pb-4 border-b border-amber-900/20">
          <h3 className="text-xl text-amber-500 tracking-[0.4em] font-bold text-center">{title}</h3>
          <p className="text-xs text-amber-700/50 tracking-widest text-center mt-2">{subtitle}</p>
        </div>

        {/* 自动存档槽 */}
        <div className="relative px-6 pt-4">
          <div className="mb-1 text-[10px] text-cyan-500/80 tracking-[0.2em]">自动存档栏位（独立）</div>
          <button
            onClick={handleAutoSlotClick}
            disabled={mode === 'LOAD' && !autoMeta}
            className={`w-full text-left relative transition-all duration-300 border p-4 ${
              mode === 'LOAD' && autoMeta
                ? 'border-cyan-600/60 hover:border-cyan-400 hover:bg-cyan-900/20 cursor-pointer'
                : 'border-cyan-900/60 bg-cyan-950/10 cursor-default'
            }`}
            title={mode === 'SAVE' ? '自动存档会在战斗与定时触发' : undefined}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-cyan-300 text-sm tracking-wider font-bold">
                  自动存档
                  <span className="text-cyan-700/70 font-normal ml-2 text-xs">AUTO</span>
                </p>
                {autoMeta ? (
                  <>
                    <p className="text-cyan-600/60 text-xs mt-1">
                      {autoMeta.leaderName || '无名'} · 第 {Math.floor(autoMeta.day)} 天 · 金 {autoMeta.gold}
                    </p>
                    <p className="text-[10px] text-slate-600/70 mt-1">{formatDate(autoMeta.timestamp)}</p>
                  </>
                ) : (
                  <p className="text-slate-600 text-xs mt-1">暂无自动存档</p>
                )}
              </div>
              <span className="text-[10px] text-cyan-600/80 tracking-widest">
                {mode === 'SAVE' ? '自动覆盖' : (autoMeta ? '可读档' : '暂无数据')}
              </span>
            </div>
          </button>
        </div>

        {/* 手动存档槽列表 */}
        <div className="relative px-6 py-6 space-y-3">
          {Array.from({ length: MAX_SLOTS }).map((_, i) => {
            const meta = metas[i];
            const isEmpty = !meta;
            const isDisabled = mode === 'LOAD' && isEmpty;

            return (
              <button
                key={i}
                onClick={() => !isDisabled && handleSlotClick(i)}
                disabled={isDisabled}
                className={`w-full text-left relative group transition-all duration-300 border p-4 ${
                  isDisabled
                    ? 'border-slate-800/20 cursor-not-allowed opacity-40'
                    : 'border-amber-900/30 hover:border-amber-600/60 hover:bg-amber-900/10 cursor-pointer'
                }`}
              >
                {/* 槽位编号 */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-amber-700/60 text-xs font-mono w-6">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {isEmpty ? (
                      <div>
                        <p className="text-slate-600 text-sm tracking-widest">— 空 —</p>
                        {mode === 'SAVE' && (
                          <p className="text-[10px] text-slate-700 mt-1">点击此处保存</p>
                        )}
                      </div>
                    ) : (
                      <div>
                        <p className="text-amber-400/90 text-sm tracking-wider font-bold">
                          {meta.leaderName || '无名'}
                          <span className="text-amber-600/60 font-normal ml-2 text-xs">
                            第 {Math.floor(meta.day)} 天
                          </span>
                        </p>
                        <div className="flex gap-4 mt-1 text-[11px]">
                          <span className="text-amber-600/50">金: {meta.gold}</span>
                          <span className="text-emerald-600/50">伍: {meta.mercCount}人</span>
                        </div>
                        <p className="text-[10px] text-slate-600/60 mt-1">
                          {formatDate(meta.timestamp)}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* 删除按钮 - 仅有存档时显示 */}
                  {!isEmpty && (
                    <button
                      onClick={(e) => handleDeleteSlot(e, i)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-red-900/60 hover:text-red-500 text-xs p-1"
                      title="删除此存档"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* 关闭按钮 */}
        <div className="relative px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full py-3 border border-amber-800/30 hover:border-amber-600/50 text-amber-700/70 hover:text-amber-500 text-sm tracking-[0.3em] transition-all hover:bg-amber-900/10"
          >
            返 回
          </button>
        </div>
      </div>
    </div>
  );
};
