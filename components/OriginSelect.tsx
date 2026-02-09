
import React, { useState, useEffect } from 'react';
import { OriginConfig } from '../types.ts';

export const ORIGIN_CONFIGS: OriginConfig[] = [
  {
    id: 'DEFEATED_GENERAL',
    name: '败军之将',
    subtitle: '长平遗恨',
    description: '你曾是赵国的一名低级军官。长平之战后，四十万赵卒被坑杀，而你——侥幸逃脱。你率领仅存的数名残兵遁入太行山中，以佣兵为业，在愧疚与求生之间苟延残喘。你的部下多为经历过沙场的老兵，虽然士气低迷，但战斗经验丰富。',
    gold: 1500,
    food: 120,
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
    gold: 2000,
    food: 100,
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
    gold: 800,
    food: 200,
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
    gold: 1000,
    food: 150,
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
  }
];

interface OriginSelectProps {
  onSelect: (origin: OriginConfig, leaderName: string) => void;
}

export const OriginSelect: React.FC<OriginSelectProps> = ({ onSelect }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [leaderName, setLeaderName] = useState('');
  const [fadeIn, setFadeIn] = useState(false);
  const [showNameInput, setShowNameInput] = useState(false);

  useEffect(() => {
    setFadeIn(true);
  }, []);

  const selectedOrigin = ORIGIN_CONFIGS.find(o => o.id === selectedId);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    const origin = ORIGIN_CONFIGS.find(o => o.id === id)!;
    // 默认使用第一个佣兵的名字
    setLeaderName(origin.mercenaries[0].name || '');
    setShowNameInput(true);
  };

  const handleConfirm = () => {
    if (!selectedOrigin) return;
    const name = leaderName.trim() || selectedOrigin.mercenaries[0].name || '无名';
    onSelect(selectedOrigin, name);
  };

  return (
    <div className={`w-screen h-screen bg-black flex flex-col relative overflow-hidden select-none transition-opacity duration-1000 ${fadeIn ? 'opacity-100' : 'opacity-0'}`}>
      {/* 背景 */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 800px 600px at 50% 30%, rgba(139, 90, 43, 0.3), transparent),
            repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(139, 90, 43, 0.3) 2px, rgba(139, 90, 43, 0.3) 4px)
          `
        }}
      />

      {/* 标题区域 */}
      <div className="shrink-0 pt-10 pb-6 text-center relative z-10">
        <h1 className="text-3xl font-bold text-amber-600 tracking-[0.4em] font-serif"
          style={{ textShadow: '0 0 30px rgba(217, 119, 6, 0.2)' }}>
          选择你的来历
        </h1>
        <p className="text-sm text-amber-900/50 mt-3 tracking-widest">
          每段过往，皆是命运的伏笔
        </p>
        <div className="w-48 h-px bg-gradient-to-r from-transparent via-amber-800/40 to-transparent mx-auto mt-4" />
      </div>

      {/* 卡片区域 */}
      <div className="flex-1 flex items-start justify-center gap-5 px-8 pb-4 relative z-10 overflow-y-auto">
        {ORIGIN_CONFIGS.map((origin) => {
          const isSelected = selectedId === origin.id;
          return (
            <div
              key={origin.id}
              onClick={() => handleSelect(origin.id)}
              className={`relative w-72 shrink-0 cursor-pointer transition-all duration-500 group
                ${isSelected
                  ? 'scale-[1.02]'
                  : 'hover:scale-[1.01] opacity-80 hover:opacity-100'
                }`}
            >
              {/* 卡片主体 */}
              <div className={`border p-6 transition-all duration-500 bg-gradient-to-b from-[#141210] to-[#0a0908]
                ${isSelected
                  ? 'border-amber-600/80 shadow-[0_0_30px_rgba(217,119,6,0.15)]'
                  : 'border-amber-900/30 hover:border-amber-800/50'
                }`}>
                {/* 标签 */}
                <div className={`text-[10px] tracking-[0.3em] uppercase mb-3 transition-colors duration-300
                  ${isSelected ? 'text-amber-500' : 'text-amber-800/60'}`}>
                  {origin.subtitle}
                </div>

                {/* 名称 */}
                <h2 className={`text-2xl font-bold tracking-[0.2em] font-serif mb-4 transition-colors duration-300
                  ${isSelected ? 'text-amber-400' : 'text-amber-100/70'}`}
                  style={isSelected ? { textShadow: '0 0 15px rgba(217, 119, 6, 0.3)' } : {}}>
                  {origin.name}
                </h2>

                {/* 描述 */}
                <p className="text-xs text-slate-500 leading-relaxed mb-5 min-h-[6rem]">
                  {origin.description}
                </p>

                {/* 分隔线 */}
                <div className="h-px bg-gradient-to-r from-transparent via-amber-900/30 to-transparent mb-4" />

                {/* 初始资源 */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">初始金币</span>
                    <span className="text-amber-500 font-mono font-bold">{origin.gold}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">初始粮食</span>
                    <span className="text-emerald-500 font-mono font-bold">{origin.food}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">医药储备</span>
                    <span className="text-sky-400 font-mono font-bold">40</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">修甲材料</span>
                    <span className="text-orange-400 font-mono font-bold">50</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">起始人数</span>
                    <span className="text-sky-400 font-mono font-bold">{origin.mercenaries.length} 人</span>
                  </div>
                </div>

                {/* 成员构成 */}
                <div className="mt-4 pt-3 border-t border-white/5">
                  <div className="text-[10px] text-slate-700 uppercase tracking-widest mb-2">起始成员</div>
                  <div className="flex flex-wrap gap-1">
                    {origin.mercenaries.map((m, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 bg-amber-950/40 border border-amber-900/20 text-amber-600/80">
                        {m.name} · {m.bg === 'DESERTER' ? '逃兵' : m.bg === 'NOBLE' ? '士族' : m.bg === 'FARMER' ? '农夫' : m.bg === 'HUNTER' ? '猎户' : m.bg === 'NOMAD' ? '胡人' : m.bg}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 选中标识 */}
                {isSelected && (
                  <div className="absolute top-3 right-3">
                    <div className="w-3 h-3 bg-amber-500 rotate-45" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 底部：命名 & 确认 */}
      {showNameInput && selectedOrigin && (
        <div className="shrink-0 bg-gradient-to-t from-black via-black/95 to-transparent pt-8 pb-8 px-8 relative z-20">
          <div className="max-w-xl mx-auto">
            <div className="flex items-center gap-6">
              {/* 命名输入 */}
              <div className="flex-1">
                <label className="text-[10px] text-amber-800/60 uppercase tracking-[0.3em] block mb-2">
                  为你的首领命名
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={leaderName}
                    onChange={(e) => setLeaderName(e.target.value)}
                    maxLength={8}
                    className="w-full bg-black/80 border border-amber-900/40 text-amber-100 text-xl font-serif tracking-[0.2em] px-4 py-3 focus:outline-none focus:border-amber-600 transition-colors placeholder:text-slate-800"
                    placeholder="输入姓名..."
                  />
                  <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-600/30 to-transparent" />
                </div>
              </div>

              {/* 确认按钮 */}
              <button
                onClick={handleConfirm}
                className="group px-10 py-4 border border-amber-700/60 bg-amber-900/20 hover:bg-amber-800/40 transition-all duration-500 relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-600/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <span className="text-amber-500 text-lg font-bold tracking-[0.5em] font-serif relative z-10">
                  踏上征途
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 未选择时的底部提示 */}
      {!showNameInput && (
        <div className="shrink-0 pb-10 text-center">
          <p className="text-xs text-slate-700 tracking-widest animate-pulse">
            — 选择一段过往 —
          </p>
        </div>
      )}
    </div>
  );
};
