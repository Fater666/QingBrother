
import React, { useState, useEffect } from 'react';
import { OriginConfig, GameDifficulty } from '../types.ts';
import { BACKGROUNDS } from '../constants';

export const ORIGIN_CONFIGS: OriginConfig[] = [
  {
    id: 'DEFEATED_GENERAL',
    name: '败军之将',
    subtitle: '长平遗恨',
    description: '你曾是赵国的一名低级军官。长平之战后，四十万赵卒被坑杀，而你——侥幸逃脱。你率领仅存的数名残兵遁入太行山中，以佣兵为业，在愧疚与求生之间苟延残喘。你的部下多为经历过沙场的老兵，虽然士气低迷，但战斗经验丰富。',
    startBiomePool: ['CENTRAL_PLAINS', 'NORTHERN_TUNDRA'],
    gold: 1500,
    food: 250,
    bonusSummary: '战斗经验获取 +15%',
    restrictionSummary: '招募花费 +10%',
    modifiers: {
      battleXpMultiplier: 1.15,
      recruitCostMultiplier: 1.1,
    },
    mercenaries: [
      { name: '赵括', bg: 'DESERTER', formationIndex: 0, equipment: {
        mainHand: ['w_sword_2', 'w_spear_2'],
        offHand: ['s_round'],
        armor: ['a_leather'],
        helmet: ['h_cap'],
      }},
      { name: '李信', bg: 'DESERTER', formationIndex: 1, equipment: {
        mainHand: ['w_sword_1', 'w_spear_1'],
        offHand: ['s_buckler'],
        armor: ['a_robe', 'a_copper_studded'],
        helmet: ['h_hood', 'h_cap'],
      }},
      { name: '韩青', bg: 'FARMER', formationIndex: 9, equipment: {
        mainHand: ['w_spear_1', 'w_axe_1'],
        armor: ['a_cloth', 'a_robe'],
      }},
    ],
    introStory: [
      '长平之战已过去三年。',
      '你时常在梦中听到那四十万亡魂的嘶喊。白起的旗帜、燃烧的营寨、堆积如山的尸骨——这一切都已成为你无法摆脱的噩梦。',
      '你带着最后几名弟兄逃入太行山，靠着替商队护卫、替村庄清剿山贼勉强度日。手下的兵虽然残破，却都是从死人堆里爬出来的悍卒。',
      '今日，你们辗转来到了这座城邑。囊中渐空，必须尽快找到新的契约。',
      '在这乱世之中，活着，便是最大的胜利。',
    ]
  },
  {
    id: 'FALLEN_NOBLE',
    name: '落魄士族',
    subtitle: '家道中落',
    description: '你出身韩国的一个没落士族。家族在政斗中败落后，你散尽最后的家财，招募了一小批杂兵，以佣兵之名行走天下。你的教养使你善于交涉，但麾下人手单薄，需要谨慎经营。',
    startBiomePool: ['CENTRAL_PLAINS'],
    gold: 2000,
    food: 200,
    bonusSummary: '招募花费 -15%',
    restrictionSummary: '更难获得高士气（正向提升判定减半）',
    modifiers: {
      recruitCostMultiplier: 0.85,
      moraleGainMultiplier: 0.5,
    },
    mercenaries: [
      { name: '韩非', bg: 'NOBLE', formationIndex: 0, equipment: {
        mainHand: ['w_sword_2'],
        armor: ['a_leather', 'a_bronze_cuirass'],
        helmet: ['h_cap', 'h_hardened_leather'],
      }},
      { name: '张仆', bg: 'FARMER', formationIndex: 1, equipment: {
        mainHand: ['w_cleaver_1', 'w_spear_4'],
        armor: ['a_cloth', 'a_robe'],
      }},
    ],
    introStory: [
      '韩氏一族，曾是新郑城中有头有脸的人家。',
      '然而朝堂之上风云变幻，父亲一封奏疏触怒了权贵，满门抄斩的圣旨下达时，你恰好在外游学。等你赶回家中，只看到了被查封的府邸和门前的封条。',
      '你用缝在衣带里的最后一点金子，雇了几个愿意跟你走的家仆和浪人。从此，你不再是士族公子，而是乱世中一个靠刀口舔血过活的佣兵头子。',
      '你率领这支寒酸的队伍来到了这座城邑。虽然囊中尚且宽裕，但人手太少，必须尽快招兵买马。',
      '你暗暗发誓：总有一天，你会重振家族的荣光。',
    ]
  },
  {
    id: 'WILDLAND_HERO',
    name: '草莽豪杰',
    subtitle: '揭竿而起',
    description: '你是太行山中的一名猎户。匪患日炽，你的村庄遭到洗劫后，你联合幸存的乡邻组成了一支自卫武装。你的部下忠厚朴实、吃苦耐劳，虽然缺乏正规训练，但胜在团结和对这片土地的熟悉。',
    startBiomePool: ['NORTHERN_TUNDRA', 'SOUTHERN_WETLANDS'],
    gold: 800,
    food: 350,
    bonusSummary: '每日粮食消耗 -15%',
    restrictionSummary: '市集购买价格 +10%',
    modifiers: {
      dailyFoodConsumptionMultiplier: 0.85,
      marketBuyPriceMultiplier: 1.1,
    },
    mercenaries: [
      { name: '石壮', bg: 'HUNTER', formationIndex: 0, equipment: {
        mainHand: ['w_bow_1', 'w_axe_1'],
        armor: ['a_leather'],
        helmet: ['h_cap', 'h_padded_cap'],
      }},
      { name: '王大牛', bg: 'FARMER', formationIndex: 1, equipment: {
        mainHand: ['w_axe_1', 'w_spear_1'],
        armor: ['a_robe'],
      }},
      { name: '刘铁柱', bg: 'FARMER', formationIndex: 9, equipment: {
        mainHand: ['w_cleaver_1', 'w_mace_1'],
        armor: ['a_cloth'],
      }},
      { name: '陈小六', bg: 'HUNTER', formationIndex: 10, equipment: {
        mainHand: ['w_bow_1'],
        armor: ['a_robe', 'a_leather'],
        helmet: ['h_hood', 'h_padded_cap'],
      }},
    ],
    introStory: [
      '太行山，自古便是匪患丛生之地。',
      '你在这片大山中长大，以狩猎为生。日子虽然清苦，但也算安宁——直到那一天，一伙山贼冲进了你的村子。',
      '他们烧了粮仓，杀了反抗的男人，抢走了所有值钱的东西。你的父亲死在了贼人的戈矛之下。',
      '你用猎弓射杀了三个落单的山贼，然后召集了幸存的乡邻。你们拿起柴刀、锄头和猎弓，发誓要让那些贼人血债血偿。',
      '仇已报，但村子回不去了。你带着这群朴实而坚韧的弟兄下了山，来到这座城邑，打算以佣兵的身份重新开始。',
      '你们没什么钱，但有的是力气和粮食。',
    ]
  },
  {
    id: 'NOMAD_RIDER',
    name: '胡地归人',
    subtitle: '南下谋生',
    description: '你是北方游牧部落与中原女子的混血儿。因部落内斗失去了一切后，你率领几名忠心的骑手南下。你的部下骑术精湛、机动力强，但在中原的城邑中格格不入，时常遭人白眼。',
    startBiomePool: ['FAR_SOUTH_DESERT', 'NORTHERN_TUNDRA'],
    gold: 1000,
    food: 300,
    bonusSummary: '世界地图移动速度 +8%',
    restrictionSummary: '招募花费 +20%，市集购买价格 +20%',
    modifiers: {
      worldMoveSpeedMultiplier: 1.08,
      recruitCostMultiplier: 1.2,
      marketBuyPriceMultiplier: 1.2,
    },
    mercenaries: [
      { name: '呼延豹', bg: 'NOMAD', formationIndex: 0, equipment: {
        mainHand: ['w_cleaver_2', 'w_axe_4'],
        offHand: ['s_light_wood'],
        armor: ['a_copper_studded', 'a_leather'],
        helmet: ['h_hardened_leather'],
      }},
      { name: '拓跋青', bg: 'NOMAD', formationIndex: 1, equipment: {
        mainHand: ['w_bow_1', 'w_bow_2'],
        armor: ['a_leather'],
        helmet: ['h_padded_cap', 'h_hood'],
      }},
      { name: '阿史那', bg: 'NOMAD', formationIndex: 9, equipment: {
        mainHand: ['w_spear_2', 'w_spear_1'],
        offHand: ['s_buckler', 's_reinforced_wicker'],
        armor: ['a_robe', 'a_leather'],
        helmet: ['h_hood'],
      }},
    ],
    introStory: [
      '北方的草原上，强者为王。',
      '你的母亲是被掳至草原的中原女子，父亲是部落中的一个小头目。你从小便学会了骑马和射箭，却也因为混血的身份饱受歧视。',
      '父亲死后，叔父夺走了部落的控制权。你被驱逐出去，只带走了几匹瘦马和三个愿意追随你的兄弟。',
      '你们穿越了漫长的雪原和荒漠，翻过长城的废墟，来到了中原。这里的人管你们叫"胡人"，用警惕和鄙夷的眼神看着你们。',
      '但你不在乎。在这片陌生的土地上，你们的弓箭和骑术就是最好的通行证。',
      '你们来到了这座城邑，打算在此扎根，用刀枪为自己挣出一片天地。',
    ]
  },
  {
    id: 'BLANK_SLATE',
    name: '白手起家',
    subtitle: '无名之辈',
    description: '你没有显赫的出身，也没有独特的优势。带着几名同伴和不多的盘缠，你决定以最朴素的方式在乱世中求存。',
    startBiomePool: ['CENTRAL_PLAINS'],
    gold: 1200,
    food: 280,
    bonusSummary: '无',
    restrictionSummary: '无',
    modifiers: {
      battleXpMultiplier: 1,
      recruitCostMultiplier: 1,
      marketBuyPriceMultiplier: 1,
      worldMoveSpeedMultiplier: 1,
      dailyFoodConsumptionMultiplier: 1,
      moraleGainMultiplier: 1,
      initialMoraleModifier: 0,
    },
    mercenaries: [
      { name: '阿平', bg: 'FARMER', formationIndex: 0, equipment: {
        mainHand: ['w_spear_1', 'w_cleaver_1'],
        armor: ['a_cloth', 'a_robe'],
      }},
      { name: '二壮', bg: 'LABORER', formationIndex: 1, equipment: {
        mainHand: ['w_axe_1', 'w_spear_1'],
        armor: ['a_cloth'],
      }},
      { name: '老郭', bg: 'WOODCUTTER', formationIndex: 9, equipment: {
        mainHand: ['w_axe_1', 'w_mace_1'],
        armor: ['a_robe'],
      }},
    ],
    introStory: [
      '你并非名门之后，也非行伍宿将。',
      '只是乱世中再普通不过的人，带着几个同伴，想着先活下来，再谈明天。',
      '你们走到这座城邑，决定从最平凡的契约做起。',
      '没有天命加身，只有脚下的路要一步步走。',
    ]
  }
];

interface OriginSelectProps {
  onSelect: (origin: OriginConfig, leaderName: string) => void;
  selectedDifficulty: GameDifficulty;
  onDifficultyChange: (difficulty: GameDifficulty) => void;
}

const DIFFICULTY_OPTIONS: { value: GameDifficulty; label: string; desc: string }[] = [
  { value: 'EASY', label: '简单', desc: '敌人更少，属性略低，收入更高。适合熟悉玩法。' },
  { value: 'NORMAL', label: '普通', desc: '标准体验。敌人数、属性与经济均为基准值。' },
  { value: 'HARD', label: '困难', desc: '敌人明显更多，属性略高，收入降低。强调资源运营。' },
  { value: 'EXPERT', label: '专家', desc: '敌人最多且更强，收入最低。适合追求高压挑战。' },
];

const ORIGIN_CONFIGS_ORDERED: OriginConfig[] = [...ORIGIN_CONFIGS].sort((a, b) => {
  if (a.id === 'BLANK_SLATE' && b.id !== 'BLANK_SLATE') return -1;
  if (b.id === 'BLANK_SLATE' && a.id !== 'BLANK_SLATE') return 1;
  return 0;
});

export const OriginSelect: React.FC<OriginSelectProps> = ({ onSelect, selectedDifficulty, onDifficultyChange }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [leaderName, setLeaderName] = useState('');
  const [fadeIn, setFadeIn] = useState(false);
  const [stage, setStage] = useState<'ORIGIN' | 'DIFFICULTY'>('ORIGIN');
  const [isCompactLandscape, setIsCompactLandscape] = useState(false);
  const [compactFontScale, setCompactFontScale] = useState(1);

  useEffect(() => {
    setFadeIn(true);
  }, []);

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
      const scale = Math.max(0.72, Math.min(1.32, (shortest / 440) * (BASELINE_DPR / dpr)));

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

  const selectedOrigin = ORIGIN_CONFIGS.find(o => o.id === selectedId);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    const origin = ORIGIN_CONFIGS.find(o => o.id === id)!;
    // 默认使用第一个佣兵的名字
    setLeaderName(origin.mercenaries[0].name || '');
  };

  const handleConfirm = () => {
    if (!selectedOrigin) return;
    const name = leaderName.trim() || selectedOrigin.mercenaries[0].name || '无名';
    onSelect(selectedOrigin, name);
  };

  return (
    <div className={`w-full h-full bg-black flex flex-col relative overflow-hidden select-none transition-opacity duration-1000 ${fadeIn ? 'opacity-100' : 'opacity-0'}`}>
      {/* 背景 */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 800px 600px at 50% 30%, rgba(139, 90, 43, 0.3), transparent),
            repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(139, 90, 43, 0.3) 2px, rgba(139, 90, 43, 0.3) 4px)
          `
        }}
      />

      {/* 标题栏（紧凑单行） */}
      <div className={`shrink-0 flex items-center justify-center relative z-10 border-b border-amber-900/20 ${isCompactLandscape ? 'h-9 gap-2.5' : 'h-10 gap-3'}`}>
        <div className={`${isCompactLandscape ? 'w-8' : 'w-8'} h-px bg-gradient-to-r from-transparent to-amber-800/30`} />
        <h1
          className={`${isCompactLandscape ? 'text-[14px] tracking-[0.18em]' : 'text-sm sm:text-lg tracking-[0.2em] sm:tracking-[0.3em]'} font-bold text-amber-600 font-serif`}
          style={{
            textShadow: '0 0 30px rgba(217, 119, 6, 0.2)',
            fontSize: isCompactLandscape ? `clamp(0.84rem, ${1.55 * compactFontScale}vw, 1.02rem)` : undefined,
          }}
        >
          {stage === 'ORIGIN' ? '选择你的来历' : '选择开局难度'}
        </h1>
        <span className={`text-[10px] text-amber-900/50 tracking-widest ${isCompactLandscape ? 'hidden' : 'hidden sm:inline'}`}>每段过往，皆是命运的伏笔</span>
        <div className={`${isCompactLandscape ? 'w-8' : 'w-8'} h-px bg-gradient-to-l from-transparent to-amber-800/30`} />
      </div>

      {/* 来历选择阶段 */}
      {stage === 'ORIGIN' && (
      <div className={`flex-1 min-h-0 relative z-10 ${isCompactLandscape ? 'px-2 py-1.5 overflow-hidden' : 'px-2 sm:px-4 py-2 overflow-y-auto'}`}>
        <div className={`${isCompactLandscape ? 'mx-auto max-w-[980px] h-full flex flex-row gap-2 overflow-hidden min-h-0' : 'mx-auto max-w-[980px] w-full flex flex-col lg:flex-row gap-2 sm:gap-3 min-h-full'}`}>
          {/* 左栏：来历简表 */}
          <div className={`${isCompactLandscape ? 'flex-[12] min-w-0 p-1.5' : 'w-full lg:flex-[5] min-w-0 p-2 sm:p-3'} bg-black/40 border border-amber-900/30 flex flex-col ${isCompactLandscape ? 'overflow-hidden min-h-0' : ''}`}>
            <div className={`flex items-center justify-between border-b border-amber-900/20 shrink-0 ${isCompactLandscape ? 'mb-1 pb-1' : 'mb-2 pb-2'}`}>
              <h2 className="text-[10px] text-amber-700 uppercase tracking-[0.2em]">来历列表</h2>
              <span className="text-[10px] text-slate-600">{ORIGIN_CONFIGS_ORDERED.length} 项</span>
            </div>
            <div className={`${isCompactLandscape ? 'overflow-y-auto flex-1 min-h-0 custom-scrollbar pr-1' : 'overflow-y-auto max-h-[44vh] lg:max-h-none lg:flex-1 custom-scrollbar pr-1'}`}>
              <div className="grid grid-cols-1 gap-2">
                {ORIGIN_CONFIGS_ORDERED.map((origin) => {
                  const isSelected = selectedId === origin.id;
                  return (
                    <button
                      key={origin.id}
                      type="button"
                      onClick={() => handleSelect(origin.id)}
                      className={`w-full border text-left transition-all ${isCompactLandscape ? 'p-2' : 'p-2.5'} ${
                        isSelected
                          ? 'bg-amber-900/30 border-amber-500 shadow-[inset_0_0_15px_rgba(245,158,11,0.15)]'
                          : 'bg-black/30 border-slate-800/50 hover:border-amber-700/60 hover:bg-black/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className={`${isCompactLandscape ? 'text-[9px]' : 'text-[10px]'} tracking-[0.18em] uppercase ${isSelected ? 'text-amber-500' : 'text-amber-800/70'} truncate`}>
                            {origin.subtitle}
                          </p>
                          <p
                            className={`${isCompactLandscape ? 'text-[13px]' : 'text-sm sm:text-base'} font-bold font-serif ${isSelected ? 'text-amber-100' : 'text-slate-200'} truncate`}
                            style={isCompactLandscape ? { fontSize: `clamp(0.72rem, ${1.45 * compactFontScale}vw, 0.95rem)` } : undefined}
                          >
                            {origin.name}
                          </p>
                        </div>
                        {isSelected && <span className="text-amber-400 text-xs">◆</span>}
                      </div>
                      <div className={`${isCompactLandscape ? 'mt-1 text-[9px]' : 'mt-1.5 text-[10px]'} grid grid-cols-3 gap-1`}>
                        <span className="text-emerald-400/90 truncate col-span-3">加成：{origin.bonusSummary}</span>
                      </div>
                      <p className={`${isCompactLandscape ? 'mt-0.5 text-[9px]' : 'mt-1 text-[10px]'} text-red-400/85 truncate`}>
                        限制：{origin.restrictionSummary}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 右栏：来历详情 */}
          <div className={`${isCompactLandscape ? 'flex-[9] min-w-0 p-2 overflow-hidden min-h-0' : 'w-full lg:flex-[7] min-w-0 p-3 sm:p-4'} bg-[#0d0b08] border border-amber-900/30 shadow-xl flex flex-col`}>
            {selectedOrigin ? (
              <>
                <div className={`${isCompactLandscape ? 'mb-1.5 pb-1.5' : 'mb-3 pb-3'} border-b border-amber-900/30 shrink-0`}>
                  <div className="text-[10px] tracking-[0.2em] uppercase text-amber-700">{selectedOrigin.subtitle}</div>
                  <h2
                    className={`${isCompactLandscape ? 'text-[15px]' : 'text-lg sm:text-xl'} font-bold font-serif text-amber-300`}
                    style={isCompactLandscape ? { fontSize: `clamp(0.86rem, ${1.95 * compactFontScale}vw, 1.06rem)` } : undefined}
                  >
                    {selectedOrigin.name}
                  </h2>
                </div>

                <div className={`${isCompactLandscape ? 'flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar' : ''}`}>
                  <p className={`${isCompactLandscape ? 'text-[10px] mb-2' : 'text-[11px] sm:text-[12px] mb-3'} text-slate-400 leading-relaxed`}>
                    {selectedOrigin.description}
                  </p>

                  <div className={`${isCompactLandscape ? 'mb-2 text-[10px]' : 'mb-3 text-[11px]'} grid grid-cols-2 gap-x-3 gap-y-1.5`}>
                    <div className="flex justify-between"><span className="text-slate-600">开局金币</span><span className="text-amber-500 font-mono font-bold">{selectedOrigin.gold}</span></div>
                    <div className="flex justify-between"><span className="text-slate-600">开局粮食</span><span className="text-emerald-500 font-mono font-bold">{selectedOrigin.food}</span></div>
                    <div className="flex justify-between"><span className="text-slate-600">开局人数</span><span className="text-sky-400 font-mono font-bold">{selectedOrigin.mercenaries.length}人</span></div>
                    <div className="flex justify-between"><span className="text-slate-600">开局医药</span><span className="text-sky-400 font-mono font-bold">40</span></div>
                  </div>

                  <div className={`${isCompactLandscape ? 'mb-2 text-[9px]' : 'mb-3 text-[10px]'} border border-amber-900/25 bg-black/20 px-2 py-1.5 space-y-1`}>
                    <p className="text-emerald-400/90">加成：{selectedOrigin.bonusSummary}</p>
                    <p className="text-red-400/85">限制：{selectedOrigin.restrictionSummary}</p>
                  </div>

                  <div className={`${isCompactLandscape ? 'mb-2 text-[9px]' : 'mb-3 text-[10px]'} border border-amber-900/25 bg-black/20 px-2 py-1.5`}>
                    <p className="text-slate-500 mb-1">成员构成</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedOrigin.mercenaries.map((m, i) => (
                        <span key={i} className="text-[9px] px-1.5 py-0.5 bg-amber-950/40 border border-amber-900/20 text-amber-600/90">
                          {m.name} · {BACKGROUNDS[m.bg]?.name || m.bg}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className={`${isCompactLandscape ? 'text-[10px]' : 'text-[11px]'}`}>
                    <p className="text-slate-500 mb-1">背景故事</p>
                    <div className={`${isCompactLandscape ? 'max-h-24' : 'max-h-28 sm:max-h-32'} overflow-y-auto pr-1 custom-scrollbar text-slate-400 leading-relaxed`}>
                      {selectedOrigin.introStory.map((line, idx) => (
                        <p key={idx} className="mb-1 last:mb-0">{line}</p>
                      ))}
                    </div>
                  </div>
                </div>

                <div className={`${isCompactLandscape ? 'mt-1.5 pt-1.5' : 'mt-3 pt-3'} border-t border-amber-900/25 shrink-0 flex justify-end`}>
                  <button
                    onClick={() => setStage('DIFFICULTY')}
                    className={`${isCompactLandscape ? 'px-3 py-1 text-[10px]' : 'px-4 py-1.5 text-[11px]'} border border-amber-700/60 text-amber-400 hover:text-amber-200 hover:bg-amber-900/20 transition-all tracking-[0.18em]`}
                  >
                    继续：选择难度
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <p className={`${isCompactLandscape ? 'text-[11px]' : 'text-sm'} text-slate-500 tracking-[0.12em]`}>请先从左侧选择一个来历</p>
                <p className={`${isCompactLandscape ? 'text-[9px]' : 'text-[10px]'} text-slate-700 mt-1`}>右侧将显示完整信息与继续入口</p>
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* 难度选择阶段（第二轮窗口） */}
      {stage === 'DIFFICULTY' && selectedOrigin && (
        <div className={`flex-1 min-h-0 relative z-10 overflow-y-auto ${isCompactLandscape ? 'px-2 py-1.5' : 'px-3 sm:px-4 py-3'}`}>
          <div className="mx-auto max-w-[980px] border border-amber-900/30 bg-[#0d0b08]/90 p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-amber-300 text-sm sm:text-base font-bold tracking-[0.15em]">
                已选来历：{selectedOrigin.name}
              </div>
              <button
                onClick={() => setStage('ORIGIN')}
                className="px-2 py-1 text-[10px] border border-amber-900/40 text-amber-500 hover:border-amber-700 hover:bg-amber-900/20 transition-all"
              >
                返回重选来历
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 mb-4">
              {DIFFICULTY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => onDifficultyChange(opt.value)}
                  className={`text-left border p-2.5 transition-all ${
                    selectedDifficulty === opt.value
                      ? 'border-amber-500 bg-amber-900/25'
                      : 'border-amber-900/40 bg-black/40 hover:border-amber-700 hover:bg-amber-900/15'
                  }`}
                >
                  <div className="text-amber-300 font-bold tracking-[0.12em] mb-1">{opt.label}</div>
                  <div className="text-[11px] text-slate-400 leading-relaxed">{opt.desc}</div>
                </button>
              ))}
            </div>

            <div className={`flex items-end ${isCompactLandscape ? 'gap-2' : 'gap-3'}`}>
              <div className="flex-1 min-w-0">
                <label className={`${isCompactLandscape ? 'text-[9px] tracking-[0.15em] mb-0.5' : 'text-[9px] tracking-[0.2em] mb-1'} text-amber-800/60 uppercase block`}>
                  首领姓名
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={leaderName}
                    onChange={(e) => setLeaderName(e.target.value)}
                    maxLength={8}
                    className="w-full bg-black/80 border border-amber-900/40 text-amber-100 font-serif tracking-[0.15em] px-3 py-1.5 focus:outline-none focus:border-amber-600 transition-colors placeholder:text-slate-800 text-base"
                    placeholder="输入姓名..."
                  />
                  <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-600/30 to-transparent" />
                </div>
              </div>
              <button
                onClick={handleConfirm}
                className={`group shrink-0 border border-amber-700/60 bg-amber-900/20 hover:bg-amber-800/40 transition-all duration-300 relative overflow-hidden ${isCompactLandscape ? 'px-4 py-1.5' : 'px-5 sm:px-8 py-2'}`}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-600/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <span className={`text-amber-500 font-bold font-serif relative z-10 ${isCompactLandscape ? 'text-[14px] tracking-[0.18em]' : 'text-sm sm:text-base tracking-[0.2em] sm:tracking-[0.35em]'}`}>
                  踏上征途
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
