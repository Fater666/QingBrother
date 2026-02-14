import React, { useMemo, useState } from 'react';
import { Character, City, Item, MoraleStatus, Party, WorldEntity } from '../types.ts';
import {
  ARMOR_TEMPLATES,
  BACKGROUNDS,
  CONSUMABLE_TEMPLATES,
  HELMET_TEMPLATES,
  MAX_INVENTORY_SIZE,
  MAX_SQUAD_SIZE,
  PERK_TREE,
  SHIELD_TEMPLATES,
  WEAPON_TEMPLATES,
  checkLevelUp,
  getXPForNextLevel,
} from '../constants';

interface GMPanelProps {
  party: Party;
  cities: City[];
  entities: WorldEntity[];
  onUpdateParty: (party: Party) => void;
  onTeleport: (x: number, y: number) => void;
  onKillAllEnemies: () => void;
  onCreateMercenary: (bgKey?: string, forcedName?: string) => Character;
  onClose: () => void;
}

type GMTab = 'RESOURCE' | 'UNIT' | 'ITEM' | 'BATTLE';

const rarityClass: Record<string, string> = {
  COMMON: 'text-slate-300',
  UNCOMMON: 'text-emerald-400',
  RARE: 'text-sky-400',
  EPIC: 'text-violet-400',
  LEGENDARY: 'text-amber-400',
  UNIQUE: 'text-red-400',
};

const cloneItem = (item: Item): Item => ({ ...item });

const numberOr = (value: string, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const tabs: { id: GMTab; label: string }[] = [
  { id: 'RESOURCE', label: '资源' },
  { id: 'UNIT', label: '单位' },
  { id: 'ITEM', label: '装备' },
  { id: 'BATTLE', label: '战场' },
];

export const GMPanel: React.FC<GMPanelProps> = ({
  party,
  cities,
  entities,
  onUpdateParty,
  onTeleport,
  onKillAllEnemies,
  onCreateMercenary,
  onClose,
}) => {
  const [tab, setTab] = useState<GMTab>('RESOURCE');
  const [selectedMercId, setSelectedMercId] = useState<string>(party.mercenaries[0]?.id ?? '');
  const [resourceInput, setResourceInput] = useState<Record<'gold' | 'food' | 'medicine' | 'repairSupplies' | 'reputation', string>>({
    gold: '1000',
    food: '100',
    medicine: '50',
    repairSupplies: '50',
    reputation: '50',
  });
  const [targetLevelInput, setTargetLevelInput] = useState('1');
  const [perkFilter, setPerkFilter] = useState('');
  const [itemKeyword, setItemKeyword] = useState('');
  const [itemType, setItemType] = useState<'ALL' | Item['type']>('ALL');
  const [teleportX, setTeleportX] = useState(String(Math.floor(party.x)));
  const [teleportY, setTeleportY] = useState(String(Math.floor(party.y)));
  const [newMercName, setNewMercName] = useState('');
  const [newMercBg, setNewMercBg] = useState<string>('random');

  const selectedMerc = useMemo(
    () => party.mercenaries.find((m) => m.id === selectedMercId) || party.mercenaries[0] || null,
    [party.mercenaries, selectedMercId]
  );

  const allItems = useMemo<Item[]>(
    () => [...WEAPON_TEMPLATES, ...ARMOR_TEMPLATES, ...HELMET_TEMPLATES, ...SHIELD_TEMPLATES, ...CONSUMABLE_TEMPLATES],
    []
  );

  const filteredItems = useMemo(() => {
    const keyword = itemKeyword.trim();
    return allItems.filter((item) => {
      if (itemType !== 'ALL' && item.type !== itemType) return false;
      if (!keyword) return true;
      return item.name.includes(keyword) || item.id.includes(keyword);
    });
  }, [allItems, itemKeyword, itemType]);

  const hostileCount = useMemo(() => entities.filter((e) => e.faction === 'HOSTILE').length, [entities]);

  const updatePartyField = (key: 'gold' | 'food' | 'medicine' | 'repairSupplies' | 'reputation', delta: number) => {
    onUpdateParty({
      ...party,
      [key]: Math.max(0, Math.floor((party[key] as number) + delta)),
    });
  };

  const updateMerc = (updater: (m: Character) => Character) => {
    if (!selectedMerc) return;
    onUpdateParty({
      ...party,
      mercenaries: party.mercenaries.map((m) => (m.id === selectedMerc.id ? updater(m) : m)),
    });
  };

  const setMercLevel = () => {
    if (!selectedMerc) return;
    const targetLevel = Math.max(1, Math.floor(numberOr(targetLevelInput, selectedMerc.level)));
    updateMerc((m) => {
      if (targetLevel === m.level) return m;
      if (targetLevel > m.level) {
        let work = { ...m };
        while (work.level < targetLevel) {
          const need = getXPForNextLevel(work.level);
          const leveled = checkLevelUp({ ...work, xp: work.xp + need });
          work = leveled.char;
        }
        return work;
      }
      const diff = m.level - targetLevel;
      return {
        ...m,
        level: targetLevel,
        xp: 0,
        perkPoints: Math.max(0, m.perkPoints - diff),
        pendingLevelUps: Math.max(0, (m.pendingLevelUps ?? 0) - diff),
      };
    });
  };

  const patchStat = (field: keyof Character['stats'], value: string) => {
    if (!selectedMerc) return;
    const next = Math.max(0, Math.floor(numberOr(value, selectedMerc.stats[field])));
    updateMerc((m) => ({ ...m, stats: { ...m.stats, [field]: next } }));
  };

  const patchCore = (field: 'hp' | 'maxHp' | 'fatigue' | 'maxFatigue' | 'perkPoints', value: string) => {
    if (!selectedMerc) return;
    const next = Math.max(0, Math.floor(numberOr(value, selectedMerc[field])));
    updateMerc((m) => ({ ...m, [field]: next }));
  };

  const patchStar = (field: keyof Character['stars'], value: string) => {
    if (!selectedMerc) return;
    const next = Math.max(0, Math.min(3, Math.floor(numberOr(value, selectedMerc.stars[field]))));
    updateMerc((m) => ({ ...m, stars: { ...m.stars, [field]: next } }));
  };

  const togglePerk = (perkId: string) => {
    if (!selectedMerc) return;
    updateMerc((m) => {
      const exists = m.perks.includes(perkId);
      return {
        ...m,
        perks: exists ? m.perks.filter((p) => p !== perkId) : [...m.perks, perkId],
      };
    });
  };

  const healMerc = () => {
    updateMerc((m) => ({
      ...m,
      hp: m.maxHp,
      fatigue: 0,
      morale: MoraleStatus.STEADY,
    }));
  };

  const addMercenary = () => {
    if (party.mercenaries.length >= MAX_SQUAD_SIZE) return;
    const merc = onCreateMercenary(newMercBg === 'random' ? undefined : newMercBg, newMercName.trim() || undefined);
    onUpdateParty({ ...party, mercenaries: [...party.mercenaries, merc] });
    setSelectedMercId(merc.id);
    setNewMercName('');
  };

  const addItemToInventory = (template: Item) => {
    if (party.inventory.length >= MAX_INVENTORY_SIZE) return;
    onUpdateParty({
      ...party,
      inventory: [...party.inventory, cloneItem(template)],
    });
  };

  const healAll = () => {
    onUpdateParty({
      ...party,
      mercenaries: party.mercenaries.map((m) => ({
        ...m,
        hp: m.maxHp,
        fatigue: 0,
        morale: MoraleStatus.STEADY,
      })),
    });
  };

  const repairAll = () => {
    const repairItem = (item: Item | null): Item | null => (item ? { ...item, durability: item.maxDurability } : null);
    onUpdateParty({
      ...party,
      mercenaries: party.mercenaries.map((m) => ({
        ...m,
        equipment: {
          mainHand: repairItem(m.equipment.mainHand),
          offHand: repairItem(m.equipment.offHand),
          armor: repairItem(m.equipment.armor),
          helmet: repairItem(m.equipment.helmet),
          ammo: repairItem(m.equipment.ammo),
          accessory: repairItem(m.equipment.accessory),
        },
        bag: m.bag.map((it) => repairItem(it)),
      })),
      inventory: party.inventory.map((it) => ({ ...it, durability: it.maxDurability })),
    });
  };

  const perkEntries = useMemo(() => Object.values(PERK_TREE), []);
  const filteredPerks = useMemo(() => {
    const keyword = perkFilter.trim();
    if (!keyword) return perkEntries;
    return perkEntries.filter((p) => p.name.includes(keyword) || p.id.includes(keyword));
  }, [perkEntries, perkFilter]);

  return (
    <div className="fixed inset-0 z-[320] bg-black/75 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-6">
      <div className="w-full h-full max-w-[1200px] max-h-[92vh] border border-red-700/60 bg-[#140b0b] text-slate-100 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-red-900/60">
          <div>
            <h2 className="text-red-400 font-bold tracking-[0.25em] text-sm sm:text-base">GM工具</h2>
            <p className="text-[10px] sm:text-xs text-red-300/70">调试模式 - 修改将直接影响存档</p>
          </div>
          <button onClick={onClose} className="px-3 py-1 text-xs border border-red-700/60 text-red-300 hover:bg-red-900/30">
            关闭
          </button>
        </div>

        <div className="px-3 pt-2 flex gap-2 overflow-x-auto border-b border-red-900/40">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-xs border whitespace-nowrap ${
                tab === t.id
                  ? 'text-white bg-red-800/70 border-red-500'
                  : 'text-red-300 border-red-900/60 hover:border-red-600 hover:bg-red-900/20'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {tab === 'RESOURCE' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {([
                ['gold', '金币'],
                ['food', '粮草'],
                ['medicine', '医药'],
                ['repairSupplies', '修甲材料'],
                ['reputation', '声望'],
              ] as const).map(([key, label]) => (
                <div key={key} className="border border-red-900/40 p-3 space-y-2 bg-black/20">
                  <p className="text-sm text-red-300">{label}: <span className="text-amber-300 font-mono">{party[key]}</span></p>
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => updatePartyField(key, 100)} className="px-2 py-1 text-xs border border-emerald-700/50 text-emerald-300">+100</button>
                    <button onClick={() => updatePartyField(key, 1000)} className="px-2 py-1 text-xs border border-emerald-700/50 text-emerald-300">+1000</button>
                    <button onClick={() => updatePartyField(key, -100)} className="px-2 py-1 text-xs border border-amber-700/50 text-amber-300">-100</button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={resourceInput[key]}
                      onChange={(e) => setResourceInput((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="flex-1 bg-black/40 border border-red-900/50 px-2 py-1 text-xs"
                    />
                    <button
                      onClick={() => updatePartyField(key, numberOr(resourceInput[key], 0))}
                      className="px-3 py-1 text-xs border border-red-700/50 text-red-200"
                    >
                      添加
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'UNIT' && (
            <div className="grid grid-cols-1 xl:grid-cols-[240px_1fr] gap-4">
              <div className="border border-red-900/40 bg-black/20 p-2 space-y-2 max-h-[70vh] overflow-y-auto">
                {party.mercenaries.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setSelectedMercId(m.id);
                      setTargetLevelInput(String(m.level));
                    }}
                    className={`w-full text-left px-2 py-1 border text-xs ${
                      selectedMerc?.id === m.id ? 'border-red-500 bg-red-900/30 text-red-100' : 'border-red-900/40 text-slate-300'
                    }`}
                  >
                    {m.name} Lv.{m.level}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                {!selectedMerc ? (
                  <p className="text-slate-400 text-sm">暂无可编辑单位</p>
                ) : (
                  <>
                    <div className="border border-red-900/40 p-3 bg-black/20">
                      <p className="text-sm text-red-300 mb-2">当前单位: {selectedMerc.name}</p>
                      <div className="flex flex-wrap gap-2 items-center">
                        <input
                          value={targetLevelInput}
                          onChange={(e) => setTargetLevelInput(e.target.value)}
                          className="w-20 bg-black/40 border border-red-900/50 px-2 py-1 text-xs"
                        />
                        <button onClick={setMercLevel} className="px-3 py-1 text-xs border border-red-700/50">设置等级</button>
                        <button onClick={healMerc} className="px-3 py-1 text-xs border border-emerald-700/50 text-emerald-300">恢复当前单位</button>
                      </div>
                    </div>

                    <div className="border border-red-900/40 p-3 bg-black/20">
                      <p className="text-xs text-red-300 mb-2">核心属性</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {(['hp', 'maxHp', 'fatigue', 'maxFatigue', 'perkPoints'] as const).map((key) => (
                          <label key={key} className="text-[11px] text-slate-300">
                            {key}
                            <input
                              defaultValue={selectedMerc[key]}
                              onBlur={(e) => patchCore(key, e.target.value)}
                              className="mt-1 w-full bg-black/40 border border-red-900/50 px-2 py-1 text-xs"
                            />
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="border border-red-900/40 p-3 bg-black/20">
                      <p className="text-xs text-red-300 mb-2">战斗属性</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {(Object.keys(selectedMerc.stats) as (keyof Character['stats'])[]).map((key) => (
                          <label key={key} className="text-[11px] text-slate-300">
                            {key}
                            <input
                              defaultValue={selectedMerc.stats[key]}
                              onBlur={(e) => patchStat(key, e.target.value)}
                              className="mt-1 w-full bg-black/40 border border-red-900/50 px-2 py-1 text-xs"
                            />
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="border border-red-900/40 p-3 bg-black/20">
                      <p className="text-xs text-red-300 mb-2">天赋星数</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {(Object.keys(selectedMerc.stars) as (keyof Character['stars'])[]).map((key) => (
                          <label key={key} className="text-[11px] text-slate-300">
                            {key}
                            <input
                              type="number"
                              min={0}
                              max={3}
                              defaultValue={selectedMerc.stars[key]}
                              onBlur={(e) => patchStar(key, e.target.value)}
                              className="mt-1 w-full bg-black/40 border border-red-900/50 px-2 py-1 text-xs"
                            />
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="border border-red-900/40 p-3 bg-black/20">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-red-300">专精编辑</p>
                        <input
                          value={perkFilter}
                          onChange={(e) => setPerkFilter(e.target.value)}
                          placeholder="搜索专精"
                          className="w-36 bg-black/40 border border-red-900/50 px-2 py-1 text-xs"
                        />
                      </div>
                      <div className="max-h-52 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-1">
                        {filteredPerks.map((perk) => {
                          const learned = selectedMerc.perks.includes(perk.id);
                          return (
                            <button
                              key={perk.id}
                              onClick={() => togglePerk(perk.id)}
                              className={`text-left px-2 py-1 border text-xs ${
                                learned
                                  ? 'border-emerald-700/70 bg-emerald-900/20 text-emerald-300'
                                  : 'border-red-900/40 text-slate-300'
                              }`}
                            >
                              T{perk.tier} {perk.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                <div className="border border-red-900/40 p-3 bg-black/20 space-y-2">
                  <p className="text-xs text-red-300">生成佣兵 ({party.mercenaries.length}/{MAX_SQUAD_SIZE})</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <input
                      value={newMercName}
                      onChange={(e) => setNewMercName(e.target.value)}
                      placeholder="名称（可留空）"
                      className="bg-black/40 border border-red-900/50 px-2 py-1 text-xs"
                    />
                    <select
                      value={newMercBg}
                      onChange={(e) => setNewMercBg(e.target.value)}
                      className="bg-black/40 border border-red-900/50 px-2 py-1 text-xs"
                    >
                      <option value="random">随机背景</option>
                      {Object.entries(BACKGROUNDS).map(([key, bg]) => (
                        <option key={key} value={key}>{bg.name}</option>
                      ))}
                    </select>
                    <button onClick={addMercenary} className="px-3 py-1 text-xs border border-red-700/50">
                      添加佣兵
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'ITEM' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 items-center">
                <input
                  value={itemKeyword}
                  onChange={(e) => setItemKeyword(e.target.value)}
                  placeholder="按名称或ID搜索"
                  className="w-56 bg-black/40 border border-red-900/50 px-2 py-1 text-xs"
                />
                <select
                  value={itemType}
                  onChange={(e) => setItemType(e.target.value as 'ALL' | Item['type'])}
                  className="bg-black/40 border border-red-900/50 px-2 py-1 text-xs"
                >
                  <option value="ALL">全部</option>
                  <option value="WEAPON">武器</option>
                  <option value="ARMOR">护甲</option>
                  <option value="HELMET">头盔</option>
                  <option value="SHIELD">盾牌</option>
                  <option value="CONSUMABLE">消耗品</option>
                </select>
                <span className="text-xs text-slate-400">背包容量: {party.inventory.length}/{MAX_INVENTORY_SIZE}</span>
              </div>
              <div className="max-h-[65vh] overflow-y-auto border border-red-900/40">
                {filteredItems.map((item) => (
                  <div key={`${item.type}-${item.id}`} className="px-3 py-2 border-b border-red-900/20 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`text-sm truncate ${rarityClass[item.rarity || 'COMMON'] || 'text-slate-200'}`}>
                        {item.name}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {item.id} | {item.type} | 价值 {item.value}
                      </p>
                    </div>
                    <button onClick={() => addItemToInventory(item)} className="px-2 py-1 text-xs border border-emerald-700/50 text-emerald-300">
                      获取
                    </button>
                  </div>
                ))}
                {filteredItems.length === 0 && <p className="text-center text-slate-500 text-sm py-8">没有匹配物品</p>}
              </div>
            </div>
          )}

          {tab === 'BATTLE' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="border border-red-900/40 p-3 bg-black/20 space-y-2">
                <p className="text-sm text-red-300">传送</p>
                <div className="flex gap-2">
                  <input
                    value={teleportX}
                    onChange={(e) => setTeleportX(e.target.value)}
                    className="w-24 bg-black/40 border border-red-900/50 px-2 py-1 text-xs"
                    placeholder="X"
                  />
                  <input
                    value={teleportY}
                    onChange={(e) => setTeleportY(e.target.value)}
                    className="w-24 bg-black/40 border border-red-900/50 px-2 py-1 text-xs"
                    placeholder="Y"
                  />
                  <button
                    onClick={() => onTeleport(numberOr(teleportX, party.x), numberOr(teleportY, party.y))}
                    className="px-3 py-1 text-xs border border-red-700/50"
                  >
                    坐标传送
                  </button>
                </div>
                <div className="max-h-52 overflow-y-auto border border-red-900/30">
                  {cities.map((city) => (
                    <button
                      key={city.id}
                      onClick={() => onTeleport(city.x, city.y)}
                      className="w-full text-left px-2 py-1 text-xs border-b border-red-900/20 hover:bg-red-900/20"
                    >
                      {city.name} ({Math.floor(city.x)}, {Math.floor(city.y)})
                    </button>
                  ))}
                </div>
              </div>

              <div className="border border-red-900/40 p-3 bg-black/20 space-y-3">
                <p className="text-sm text-red-300">战场调试</p>
                <p className="text-xs text-slate-400">当前敌对实体: {hostileCount}</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={onKillAllEnemies} className="px-3 py-1 text-xs border border-red-700/50 text-red-200">
                    一键清除敌人
                  </button>
                  <button onClick={healAll} className="px-3 py-1 text-xs border border-emerald-700/50 text-emerald-300">
                    全队恢复
                  </button>
                  <button onClick={repairAll} className="px-3 py-1 text-xs border border-amber-700/50 text-amber-300">
                    修复全装备
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
