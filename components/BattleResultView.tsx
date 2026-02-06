
import React, { useState, useMemo, useEffect } from 'react';
import { BattleResult, Item, Party } from '../types.ts';
import { MAX_INVENTORY_SIZE } from '../constants';
import { Portrait } from './Portrait.tsx';
import { ItemIcon } from './ItemIcon.tsx';

interface BattleResultViewProps {
  result: BattleResult;
  party: Party;
  onComplete: (selectedLoot: Item[], goldReward: number, xpMap: Record<string, number>) => void;
}

// 物品类型中文名
const ITEM_TYPE_NAMES: Record<string, string> = {
  WEAPON: '武器',
  ARMOR: '护甲',
  HELMET: '头盔',
  SHIELD: '盾牌',
  CONSUMABLE: '消耗品',
  AMMO: '弹药',
  ACCESSORY: '饰品',
};

// 获取物品品质颜色（基于价值）
const getItemQualityColor = (value: number): string => {
  if (value >= 1500) return 'text-amber-400 border-amber-500/60';
  if (value >= 600) return 'text-blue-400 border-blue-500/60';
  if (value >= 200) return 'text-green-400 border-green-500/60';
  return 'text-slate-300 border-slate-600/60';
};

const getItemQualityBg = (value: number): string => {
  if (value >= 1500) return 'bg-amber-950/40';
  if (value >= 600) return 'bg-blue-950/40';
  if (value >= 200) return 'bg-emerald-950/30';
  return 'bg-slate-900/40';
};

export const BattleResultView: React.FC<BattleResultViewProps> = ({ result, party, onComplete }) => {
  const [phase, setPhase] = useState<'REPORT' | 'LOOT'>(result.victory ? 'REPORT' : 'REPORT');
  const [selectedItems, setSelectedItems] = useState<Set<number>>(() => new Set(result.lootItems.map((_, i) => i)));
  const [hoveredItem, setHoveredItem] = useState<Item | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  
  // 逐行淡入动画
  const [visibleRows, setVisibleRows] = useState(0);

  useEffect(() => {
    if (phase === 'REPORT') {
      setVisibleRows(0);
      const totalRows = 1 + result.casualties.length + result.survivors.length; // header + entries
      let current = 0;
      const timer = setInterval(() => {
        current++;
        setVisibleRows(current);
        if (current >= totalRows) clearInterval(timer);
      }, 150);
      return () => clearInterval(timer);
    }
  }, [phase, result.casualties.length, result.survivors.length]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => setMousePos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const currentInventoryCount = party.inventory.length;
  const selectedCount = selectedItems.size;
  const totalAfterLoot = currentInventoryCount + selectedCount;
  const isFull = totalAfterLoot >= MAX_INVENTORY_SIZE;

  const toggleItem = (index: number) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        // 检查背包容量
        if (currentInventoryCount + next.size + 1 > MAX_INVENTORY_SIZE) return prev;
        next.add(index);
      }
      return next;
    });
  };

  const selectAll = () => {
    const available = Math.max(0, MAX_INVENTORY_SIZE - currentInventoryCount);
    const newSet = new Set<number>();
    for (let i = 0; i < Math.min(result.lootItems.length, available); i++) {
      newSet.add(i);
    }
    setSelectedItems(newSet);
  };

  const deselectAll = () => {
    setSelectedItems(new Set());
  };

  const handleComplete = () => {
    const selectedLoot = result.lootItems.filter((_, i) => selectedItems.has(i));
    // 构建 XP map
    const xpMap: Record<string, number> = {};
    result.survivors.forEach(s => { xpMap[s.id] = s.xpGained; });
    onComplete(selectedLoot, result.goldReward, xpMap);
  };

  const handleDefeatRestart = () => {
    window.location.reload();
  };

  // 构造 survivor 的 Character-like 对象用于 Portrait
  const survivorCharacters = useMemo(() => {
    return result.survivors.map(s => {
      const merc = party.mercenaries.find(m => m.id === s.id);
      return merc || null;
    });
  }, [result.survivors, party.mercenaries]);

  // ============================== 阶段一：战斗报告 ==============================
  const renderReport = () => {
    const allEntries = [
      ...result.casualties.map(c => ({ type: 'casualty' as const, ...c })),
      ...result.survivors.map(s => ({ type: 'survivor' as const, ...s })),
    ];

    return (
      <div className="w-full max-w-2xl mx-auto flex flex-col items-center animate-fadeIn">
        {/* 标题区域 */}
        <div className="text-center mb-8">
          {result.victory ? (
            <>
              <div className="text-5xl mb-3">&#9876;</div>
              <h1 className="text-3xl font-bold text-amber-400 tracking-[0.3em] mb-2">
                战 斗 胜 利
              </h1>
              <p className="text-lg text-amber-600/80 italic">
                击败了 {result.enemyName}
              </p>
            </>
          ) : (
            <>
              <div className="text-5xl mb-3">&#9760;</div>
              <h1 className="text-3xl font-bold text-red-500 tracking-[0.3em] mb-2">
                全 军 覆 没
              </h1>
              <p className="text-lg text-red-400/80 italic">
                败于 {result.enemyName} 之手
              </p>
            </>
          )}
        </div>

        {/* 战斗统计 */}
        <div className={`flex gap-8 mb-8 text-sm transition-all duration-500 ${visibleRows >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">持续</span>
            <span className="text-amber-400 font-bold">{result.roundsTotal}</span>
            <span className="text-slate-500">回合</span>
          </div>
          <div className="h-4 w-px bg-slate-700" />
          <div className="flex items-center gap-2">
            <span className="text-slate-500">歼敌</span>
            <span className="text-red-400 font-bold">{result.enemiesKilled}</span>
          </div>
          {result.enemiesRouted > 0 && (
            <>
              <div className="h-4 w-px bg-slate-700" />
              <div className="flex items-center gap-2">
                <span className="text-slate-500">溃逃</span>
                <span className="text-yellow-500 font-bold">{result.enemiesRouted}</span>
              </div>
            </>
          )}
        </div>

        {/* 分隔线 */}
        <div className="w-full flex items-center gap-4 mb-6">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent to-amber-900/40" />
          <span className="text-xs text-amber-700/60 tracking-[0.3em]">己方伤亡</span>
          <div className="flex-1 h-px bg-gradient-to-l from-transparent to-amber-900/40" />
        </div>

        {/* 伤亡列表 */}
        <div className="w-full space-y-2">
          {/* 阵亡者 */}
          {result.casualties.map((c, i) => {
            const rowIndex = i + 1; // +1 for the stats row
            return (
              <div
                key={`cas-${i}`}
                className={`flex items-center gap-4 px-4 py-3 bg-red-950/20 border border-red-900/30 transition-all duration-500 ${
                  visibleRows >= rowIndex + 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`}
              >
                {/* 骷髅标记代替头像 */}
                <div className="w-12 h-12 bg-black/60 border border-red-800/50 flex items-center justify-center rounded-sm">
                  <span className="text-2xl text-red-600">&#9760;</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-red-400 font-bold">{c.name}</span>
                    <span className="text-[10px] text-red-600/60 tracking-wider">阵亡</span>
                  </div>
                  <div className="text-xs text-red-700/50 italic mt-0.5">{c.background}</div>
                </div>
                <div className="text-red-600/40 text-xs italic">KIA</div>
              </div>
            );
          })}

          {/* 存活者 */}
          {result.survivors.map((s, i) => {
            const rowIndex = result.casualties.length + i + 1;
            const hpPercent = Math.round((s.hpAfter / s.maxHp) * 100);
            const isInjured = s.hpAfter < s.maxHp;
            const isCritical = hpPercent < 30;
            const merc = survivorCharacters[i];
            
            const statusText = !isInjured ? '无恙' : isCritical ? '重伤' : '轻伤';
            const statusColor = !isInjured ? 'text-emerald-400' : isCritical ? 'text-red-400' : 'text-yellow-400';
            const borderColor = !isInjured ? 'border-emerald-900/30' : isCritical ? 'border-red-900/30' : 'border-yellow-900/30';
            const bgColor = !isInjured ? 'bg-emerald-950/10' : isCritical ? 'bg-red-950/15' : 'bg-yellow-950/10';

            return (
              <div
                key={`sur-${i}`}
                className={`flex items-center gap-4 px-4 py-3 ${bgColor} border ${borderColor} transition-all duration-500 ${
                  visibleRows >= rowIndex + 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`}
              >
                {/* 头像 */}
                <div className="w-12 h-12">
                  {merc ? <Portrait character={merc} size="sm" className="w-12 h-12" /> : (
                    <div className="w-12 h-12 bg-black/60 border border-slate-700 flex items-center justify-center rounded-sm">
                      <span className="text-slate-500">?</span>
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-200 font-bold">{s.name}</span>
                    <span className={`text-[10px] ${statusColor} tracking-wider`}>{statusText}</span>
                  </div>
                  {isInjured && (
                    <div className="flex items-center gap-2 mt-1">
                      <div className="w-24 h-1.5 bg-black/60 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${isCritical ? 'bg-red-500' : 'bg-yellow-500'}`}
                          style={{ width: `${hpPercent}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500">{s.hpAfter}/{s.maxHp}</span>
                    </div>
                  )}
                </div>
                {/* XP */}
                <div className="text-right">
                  <span className="text-emerald-400 font-bold text-sm">+{s.xpGained} XP</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* 按钮 */}
        <div className="mt-10">
          {result.victory ? (
            <button
              onClick={() => {
                if (result.lootItems.length > 0) {
                  setPhase('LOOT');
                } else {
                  // 没有战利品，直接完成
                  handleComplete();
                }
              }}
              className="px-12 py-3 bg-amber-800 hover:bg-amber-600 text-white font-bold tracking-[0.3em] transition-all shadow-lg border border-amber-500 hover:shadow-amber-500/20"
            >
              {result.lootItems.length > 0 ? '继 续' : '返回世界地图'}
              {result.lootItems.length > 0 && <span className="ml-2 text-amber-300/60">→</span>}
            </button>
          ) : (
            <button
              onClick={handleDefeatRestart}
              className="px-12 py-3 bg-red-900 hover:bg-red-700 text-white font-bold tracking-[0.3em] transition-all shadow-lg border border-red-600"
            >
              重新开始
            </button>
          )}
        </div>
      </div>
    );
  };

  // ============================== 阶段二：战利品拾取 ==============================
  const renderLoot = () => {
    return (
      <div className="w-full max-w-3xl mx-auto flex flex-col items-center animate-fadeIn">
        {/* 标题 */}
        <div className="w-full flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className="text-2xl">&#128176;</span>
            <h2 className="text-2xl font-bold text-amber-400 tracking-[0.2em]">缴获战利品</h2>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-950/30 border border-amber-900/40">
            <span className="text-sm text-amber-600">获得金帛</span>
            <span className="text-lg font-bold text-amber-400">+{result.goldReward}</span>
          </div>
        </div>

        {/* 背包容量提示 */}
        <div className="w-full flex items-center justify-between mb-4 px-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">背包容量</span>
            <span className={`text-sm font-mono font-bold ${isFull ? 'text-red-400' : 'text-slate-300'}`}>
              {currentInventoryCount + selectedCount}/{MAX_INVENTORY_SIZE}
            </span>
            {isFull && <span className="text-[10px] text-red-500 animate-pulse">背包已满</span>}
          </div>
          <div className="flex gap-2">
            <button
              onClick={selectAll}
              className="px-3 py-1 text-[10px] text-emerald-400 border border-emerald-800/40 hover:bg-emerald-900/20 transition-all tracking-wider"
            >
              全部拾取
            </button>
            <button
              onClick={deselectAll}
              className="px-3 py-1 text-[10px] text-slate-400 border border-slate-700/40 hover:bg-slate-800/20 transition-all tracking-wider"
            >
              全部丢弃
            </button>
          </div>
        </div>

        {/* 分隔线 */}
        <div className="w-full h-px bg-gradient-to-r from-transparent via-amber-900/40 to-transparent mb-4" />

        {/* 战利品网格 */}
        {result.lootItems.length > 0 ? (
          <div className="w-full grid grid-cols-5 gap-3 mb-8">
            {result.lootItems.map((item, i) => {
              const isSelected = selectedItems.has(i);
              const qualityColor = getItemQualityColor(item.value);
              const qualityBg = getItemQualityBg(item.value);
              const canSelect = isSelected || !isFull || (currentInventoryCount + selectedCount < MAX_INVENTORY_SIZE);

              return (
                <div
                  key={`loot-${i}`}
                  onClick={() => canSelect && toggleItem(i)}
                  onMouseEnter={() => setHoveredItem(item)}
                  onMouseLeave={() => setHoveredItem(null)}
                  className={`relative aspect-square border-2 cursor-pointer transition-all group ${
                    isSelected
                      ? `${qualityBg} ${qualityColor} shadow-lg ring-1 ring-white/10`
                      : canSelect
                        ? 'bg-black/40 border-slate-800 hover:border-slate-600 opacity-50 hover:opacity-80'
                        : 'bg-black/20 border-slate-900 opacity-30 cursor-not-allowed'
                  }`}
                >
                  {/* 物品图标 */}
                  <div className="w-full h-full p-2">
                    <ItemIcon item={item} showBackground={false} />
                  </div>

                  {/* 物品名称 */}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5 text-center">
                    <span className={`text-[10px] font-bold truncate block ${isSelected ? qualityColor.split(' ')[0] : 'text-slate-500'}`}>
                      {item.name}
                    </span>
                    <span className="text-[8px] text-slate-600">{ITEM_TYPE_NAMES[item.type] || item.type}</span>
                  </div>

                  {/* 选中勾号 */}
                  {isSelected && (
                    <div className="absolute top-1 right-1 w-5 h-5 bg-emerald-600 rounded-full flex items-center justify-center shadow-md">
                      <span className="text-white text-xs font-bold">&#10003;</span>
                    </div>
                  )}

                  {/* 耐久度条 */}
                  {item.durability < item.maxDurability && (
                    <div className="absolute top-1 left-1 right-7 h-1 bg-black/60 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-slate-400 rounded-full"
                        style={{ width: `${(item.durability / item.maxDurability) * 100}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center text-slate-600 italic py-12">没有可拾取的战利品</div>
        )}

        {/* 完成按钮 */}
        <button
          onClick={handleComplete}
          className="px-12 py-3 bg-amber-800 hover:bg-amber-600 text-white font-bold tracking-[0.3em] transition-all shadow-lg border border-amber-500 hover:shadow-amber-500/20"
        >
          完 成
        </button>
      </div>
    );
  };

  // ============================== Tooltip ==============================
  const renderTooltip = () => {
    if (!hoveredItem || phase !== 'LOOT') return null;
    return (
      <div
        className="fixed z-[200] pointer-events-none bg-[#1a110a] border border-amber-900/50 p-3 shadow-2xl max-w-xs"
        style={{ left: mousePos.x + 16, top: mousePos.y - 10 }}
      >
        <div className="text-amber-400 font-bold text-sm mb-1">{hoveredItem.name}</div>
        <div className="text-[10px] text-slate-500 mb-2">{ITEM_TYPE_NAMES[hoveredItem.type] || hoveredItem.type}</div>
        <div className="text-xs text-slate-400 mb-2 italic">{hoveredItem.description}</div>
        <div className="space-y-0.5 text-[10px]">
          {hoveredItem.damage && (
            <div className="flex justify-between">
              <span className="text-slate-500">伤害</span>
              <span className="text-red-400">{hoveredItem.damage[0]}-{hoveredItem.damage[1]}</span>
            </div>
          )}
          {hoveredItem.armorPen !== undefined && hoveredItem.armorPen > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-500">穿甲</span>
              <span className="text-orange-400">{Math.round(hoveredItem.armorPen * 100)}%</span>
            </div>
          )}
          {hoveredItem.defenseBonus !== undefined && hoveredItem.defenseBonus > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-500">防御加成</span>
              <span className="text-blue-400">+{hoveredItem.defenseBonus}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-slate-500">耐久</span>
            <span className="text-slate-300">{hoveredItem.durability}/{hoveredItem.maxDurability}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">价值</span>
            <span className="text-amber-400">{hoveredItem.value} 金</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black z-[90] flex items-center justify-center overflow-y-auto">
      {/* 背景氛围 */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{ backgroundImage: `radial-gradient(ellipse 800px 600px at 50% 40%, rgba(139, 90, 43, 0.4), transparent)` }}
      />
      {/* 竹简纹理 */}
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(139,69,19,0.3) 2px, rgba(139,69,19,0.3) 4px)' }}
      />

      <div className="relative z-10 w-full px-8 py-12">
        {phase === 'REPORT' ? renderReport() : renderLoot()}
      </div>

      {renderTooltip()}
    </div>
  );
};
