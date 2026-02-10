#!/usr/bin/env python3
"""
《战国·与伍同行》配置自动生成脚本
使用 Google Gemini API 批量生成游戏配置数据。

用法:
    1. 将你的 Gemini API Key 粘贴到 scripts/api_key.txt 的第二行
       （或设置环境变量 GEMINI_API_KEY）

    2. 运行脚本:
       python generate_csv.py              # 生成全部
       python generate_csv.py weapons      # 只生成武器
       python generate_csv.py quests       # 生成普通任务描述模板（JSON→TypeScript）
       python generate_csv.py elite_quests # 生成高声望任务描述模板
       python generate_csv.py weapons events backgrounds  # 指定多个类型
       python generate_csv.py --dry-run    # 干跑模式，只打印 prompt 不调用 API
"""

import os
import re
import sys
import json
import shutil
from pathlib import Path

# ============================================================
#  配置区：API Key 从 api_key.txt 读取，也支持环境变量
# ============================================================
def _load_api_key() -> str:
    """按优先级加载 API Key: 环境变量 > api_key.txt"""
    env_key = os.environ.get("GEMINI_API_KEY", "")
    if env_key:
        return env_key
    key_file = Path(__file__).parent / "api_key.txt"
    if key_file.exists():
        lines = key_file.read_text(encoding="utf-8").strip().splitlines()
        # 取最后一行非空行作为 key（第一行是说明）
        for line in reversed(lines):
            line = line.strip()
            if line and not line.startswith("#") and not line.startswith("在此"):
                return line
    return "YOUR_API_KEY_HERE"

API_KEY = _load_api_key()

# Gemini 模型名称
MODEL_NAME = "gemini-2.5-flash"

# CSV 目录（相对于本脚本）
CSV_DIR = Path(__file__).parent.parent / "csv"

# constants.tsx 路径
# 自动检测 constants 文件（可能是 .ts 或 .tsx）
_constants_dir = Path(__file__).parent.parent
CONSTANTS_FILE = _constants_dir / "constants.ts" if (_constants_dir / "constants.ts").exists() else _constants_dir / "constants.tsx"

# 所有支持的生成类型
ALL_TYPES = ["weapons", "armor", "helmets", "shields", "backgrounds", "events", "quests", "elite_quests"]

# ============================================================
#  通用系统提示词
# ============================================================
SYSTEM_PROMPT = """你是一个战国时期硬核战术 RPG 游戏的数据设计师。
游戏名《战国·与伍同行》，致敬《Battle Brothers》（战场兄弟），背景设定在战国末期（约公元前260-221年）。
玩家控制一支名为"伍"的佣兵团，需要管理装备、招募角色、在六角格地图上进行回合制战斗。

核心机制：
- AP/疲劳双系统：每个动作消耗行动点(AP)和累积疲劳值(Fatigue)
- 部位打击：攻击可能命中头部或身体
- 武器分类：剑、斧、矛、戈/戟(长柄)、锤/殳(钝器)、匕首、砍刀、连枷、弓、弩、投掷
- 护甲通过 durability（耐久）吸收伤害，越重 maxFatiguePenalty 越高
- 数据用 | 分隔的 CSV 格式（不是逗号分隔！）

请严格按照我提供的表头和已有数据的数值范围生成新条目。
不要输出任何解释、注释或 markdown 格式标记（如 ```），只输出纯 CSV 数据行。"""


# ============================================================
#  工具函数
# ============================================================

def read_csv(filename: str) -> str:
    """读取 CSV 文件内容"""
    filepath = CSV_DIR / filename
    if not filepath.exists():
        print(f"  [警告] 文件不存在: {filepath}")
        return ""
    return filepath.read_text(encoding="utf-8").strip()


def get_header(csv_content: str) -> str:
    """获取 CSV 的表头行"""
    return csv_content.split("\n")[0] if csv_content else ""


def count_columns(header: str) -> int:
    """统计表头列数"""
    return len(header.split("|"))


def clean_ai_response(text: str) -> str:
    """清理 AI 返回内容中的 markdown 标记"""
    # 移除 ```csv ... ``` 或 ``` ... ``` 代码块标记
    text = re.sub(r"```(?:csv|text|plain)?\s*\n?", "", text)
    text = re.sub(r"```\s*$", "", text, flags=re.MULTILINE)
    return text.strip()


def validate_and_filter_lines(lines: list[str], expected_cols: int, header: str) -> list[str]:
    """校验 CSV 行的列数，过滤不合法的行"""
    valid = []
    header_line = header.strip()
    for line in lines:
        line = line.strip()
        if not line:
            continue
        # 跳过表头行（AI 可能重复输出）
        if line == header_line:
            continue
        cols = len(line.split("|"))
        if cols == expected_cols:
            valid.append(line)
        else:
            print(f"  [跳过] 列数不匹配 (期望{expected_cols}, 实际{cols}): {line[:80]}...")
    return valid


def backup_file(filepath: Path):
    """备份文件为 .bak"""
    bak = filepath.with_suffix(filepath.suffix + ".bak")
    shutil.copy2(filepath, bak)
    print(f"  [备份] {filepath.name} -> {bak.name}")


def append_to_csv(filename: str, new_lines: list[str]):
    """将新行追加到 CSV 文件末尾"""
    filepath = CSV_DIR / filename
    backup_file(filepath)

    existing = filepath.read_text(encoding="utf-8").rstrip()
    new_content = existing + "\n" + "\n".join(new_lines) + "\n"
    filepath.write_text(new_content, encoding="utf-8")
    print(f"  [写入] 向 {filename} 追加了 {len(new_lines)} 条数据")


def call_gemini(prompt: str, dry_run: bool = False) -> str:
    """调用 Gemini API"""
    if dry_run:
        print("\n" + "=" * 60)
        print("[DRY RUN] 以下是将发送给 Gemini 的提示词：")
        print("=" * 60)
        print(prompt[:2000] + ("..." if len(prompt) > 2000 else ""))
        print("=" * 60 + "\n")
        return ""

    try:
        from google import genai
    except ImportError:
        print("[错误] 请先安装依赖: pip install -r requirements.txt")
        sys.exit(1)

    if API_KEY == "YOUR_API_KEY_HERE" or not API_KEY:
        print("[错误] 请设置 GEMINI_API_KEY 环境变量，或在脚本顶部填写 API_KEY")
        sys.exit(1)

    client = genai.Client(api_key=API_KEY)
    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=prompt,
        config={
            "system_instruction": SYSTEM_PROMPT,
            "temperature": 0.8,
        },
    )
    return response.text


# ============================================================
#  各类型的 Prompt 构建函数
# ============================================================

def prompt_weapons() -> tuple[str, str, int]:
    """构建武器生成提示词，返回 (prompt, csv文件名, 期望列数)"""
    csv_content = read_csv("weapons.csv")
    header = get_header(csv_content)
    col_count = count_columns(header)

    prompt = f"""请为我的游戏生成更多武器配置。

表头格式：
{header}

字段说明：
- id: 格式为 w_{{类型}}_{{编号}}，如 w_dagger_1, w_cleaver_2
- name: 武器名称，必须是战国时期合理的名称
- value: 金帛价值（40~3000，越好越贵）
- weight: 重量（3~20）
- durability: 耐久度（20~100）
- dmgMin/dmgMax: 最低/最高伤害
- armorPen: 穿甲率（0.0~0.6，匕首高约0.3~0.5、大武器低约0.1~0.3）
- armorDmg: 对护甲伤害倍率（0.3~1.8，钝器/斧最高约1.2~1.8、匕首最低约0.3~0.5）
- fatigueCost: 每次攻击疲劳消耗（8~22）
- range: 射程（近战=1，长柄=2，投掷=3~4，远程=6）
- hitChanceMod: 命中修正（-10~+20，矛/匕首高、斧/锤低）
- description: 战国风格的中文描述，一句话，20字以内

已有数据（请参考数值范围和风格，不要重复这些条目）：
{csv_content}

请补充以下缺失的武器类型，每种生成 2~3 个品质档次（低/中/高）：
1. 匕首类 (w_dagger_1/2/3) — 轻便(weight 3~6)、低伤害、高穿甲(armorPen 0.3~0.5)、低疲劳消耗(fatigueCost 6~10)、名称需含"匕"字
2. 砍刀类 (w_cleaver_1/2/3) — 中等、造成流血、名称需含"刀"字
3. 连枷类 (w_flail_1/2) — 中等偏重、无视盾牌、名称需含"鞭"或"锏"字
4. 锤类 (w_hammer_1/2/3) — 重型(weight 12~20)、高护甲伤害(armorDmg 1.5~2.0)、名称需含"锤"字
5. 投掷类 (w_throw_1/2) — range=3或4，weight 2~5，名称为投掷物如"飞石""标枪""投矛"

再补充 3~4 个已有类型（剑/斧/矛/弓/弩）的高阶或低阶变种。

总共约 18~22 条新数据。只输出 CSV 数据行，不要表头行，不要任何其他文字。每行用 | 分隔，共 {col_count} 列。"""

    return prompt, "weapons.csv", col_count


def prompt_armor() -> tuple[str, str, int]:
    """构建护甲生成提示词"""
    csv_content = read_csv("armor.csv")
    header = get_header(csv_content)
    col_count = count_columns(header)

    prompt = f"""请为我的游戏生成更多护甲（身甲）配置。

表头格式：
{header}

字段说明：
- id: 格式为 a_{{类型}}，如 a_padded, a_chain
- name: 护甲名称，战国时期合理的名称
- value: 金帛价值（20~5000）
- weight: 重量（2~40，越重防护越好）
- durability: 耐久度（30~350，代表护甲能吸收多少伤害）
- maxFatiguePenalty: 最大疲劳惩罚（0~35，越重惩罚越大）
- description: 战国风格中文描述，一句话

已有数据（共6条，注意数值的递进关系）：
{csv_content}

当前品质档次的 durability 分布为: 30, 50, 90, 140, 210, 300
中间有较大空隙，请填补以下区间：
- durability 60~80 区间（轻中甲，如加厚的皮甲、带铜钉的皮甲）
- durability 100~130 区间（中甲）
- durability 160~200 区间（中重甲）
- durability 240~280 区间（重甲变种）
- 再加 1~2 条超高端甲（durability 330~400）

总共约 6~8 条新数据。只输出 CSV 数据行，不要表头行，共 {col_count} 列，用 | 分隔。"""

    return prompt, "armor.csv", col_count


def prompt_helmets() -> tuple[str, str, int]:
    """构建头盔生成提示词"""
    csv_content = read_csv("helmets.csv")
    header = get_header(csv_content)
    col_count = count_columns(header)

    prompt = f"""请为我的游戏生成更多头盔配置。

表头格式：
{header}

字段说明：
- id: 格式为 h_{{类型}}，如 h_straw, h_leather
- name: 头盔名称，战国时期合理的名称
- value: 金帛价值（15~2000）
- weight: 重量（1~15）
- durability: 耐久度（20~250，代表头盔能吸收多少伤害）
- maxFatiguePenalty: 最大疲劳惩罚（0~12）
- description: 战国风格中文描述，一句话

已有数据（共4条）：
{csv_content}

当前 durability 分布: 20, 50, 120, 200
请填补空隙并扩展：
- durability 30~40 区间（简易防护，如草帽、布帽加固版）
- durability 70~100 区间（中档头盔）
- durability 150~180 区间（高档头盔）
- durability 230~280 区间（极品头盔）

总共约 5~6 条新数据。只输出 CSV 数据行，不要表头行，共 {col_count} 列，用 | 分隔。"""

    return prompt, "helmets.csv", col_count


def prompt_shields() -> tuple[str, str, int]:
    """构建盾牌生成提示词"""
    csv_content = read_csv("shields.csv")
    header = get_header(csv_content)
    col_count = count_columns(header)

    prompt = f"""请为我的游戏生成更多盾牌配置。

表头格式：
{header}

字段说明：
- id: 格式为 s_{{类型}}，如 s_wooden, s_kite
- name: 盾牌名称，战国时期合理的名称
- value: 金帛价值（50~800）
- weight: 重量（3~25）
- durability: 耐久度（15~100）
- defenseBonus: 近战防御加成（5~30）
- rangedBonus: 远程防御加成（3~35）
- fatigueCost: 使用盾牌的疲劳消耗（3~20）
- description: 战国风格中文描述，一句话

已有数据（共3条）：
{csv_content}

当前品质档次: 藤牌(轻) -> 圆盾(中) -> 大盾(重)
请补充：
- 一个比藤牌更差的简陋盾（木板、门板之类）
- 一个藤牌和圆盾之间的中档盾
- 一个圆盾和大盾之间的中重盾
- 一个特殊盾（如铜面盾牌，高防御但很重）

总共约 4~5 条新数据。只输出 CSV 数据行，不要表头行，共 {col_count} 列，用 | 分隔。"""

    return prompt, "shields.csv", col_count


def prompt_backgrounds() -> tuple[str, str, int]:
    """构建角色背景生成提示词"""
    csv_content = read_csv("backgrounds.csv")
    header = get_header(csv_content)
    col_count = count_columns(header)

    prompt = f"""请为我的游戏生成更多角色背景配置。

表头格式：
{header}

字段说明：
- id: 大写英文标识符，如 BLACKSMITH, BEGGAR
- name: 中文名称（2~4字）
- icon: 一个 emoji 图标
- salaryMult: 薪资倍率（0.3~8.0，出身越好/越稀有越贵）
- gearQuality: 初始装备品质（0=无装备/布衣, 1=皮甲级, 2=青铜级）
- hpMod: 生命修正范围，格式"最小值,最大值"（如 -10,5）
- fatigueMod: 体力修正范围
- resolveMod: 胆识修正范围
- meleeSkillMod: 近战命中修正范围
- rangedSkillMod: 远程命中修正范围
- defMod: 防御修正范围
- initMod: 先手修正范围
- desc: 一句话描述，10字以内

注意：所有 xxxMod 字段的格式必须是"数字,数字"（如 5,15 或 -10,0），代表随机范围。

已有数据（共32个背景）：
{csv_content}

请生成 5~8 个新背景，填补职业多样性，例如：
1. MASON|石匠 — 体力好、耐力高、salaryMult 1.1
2. SCHOLAR|书生 — 胆识高（读书明理）、战斗弱、salaryMult 1.2
3. SERVANT|仆役 — 比较平庸、salaryMult 0.6
4. BRAWLER|拳师 — 近战强、无装备、salaryMult 1.5
5. MESSENGER|信使 — 跑得快（先手/体力高）、salaryMult 1.0
6. APPRENTICE|学徒 — 潜力股（初始弱但成长性好-需通过低数值体现）、salaryMult 0.8

只输出 CSV 数据行，不要表头行，共 {col_count} 列，用 | 分隔。
每行的 xxxMod 字段必须严格遵循"数字,数字"格式。"""

    return prompt, "backgrounds.csv", col_count


def prompt_backgrounds_stories(new_bg_ids: list[str]) -> str:
    """构建背景故事生成提示词"""
    ids_str = ", ".join(new_bg_ids)

    prompt = f"""请为以下角色背景各生成 2~3 条背景故事（用于角色创建时的随机文本）。

角色背景 ID 列表：{ids_str}

每条故事是一句话（20~40字），描述这个角色为何离开原来的生活加入佣兵团。
语言风格要有战国时期的文学韵味。

请严格按照以下 JSON 格式输出，不要有任何其他文字：
{{
    "BLACKSMITH": ["故事1", "故事2", "故事3"],
    "PHYSICIAN": ["故事1", "故事2"],
    ...
}}

只输出 JSON，不要 markdown 代码块标记。"""
    return prompt


def prompt_events() -> tuple[str, str, int]:
    """构建随机事件生成提示词"""
    csv_content = read_csv("events.csv")
    header = get_header(csv_content)
    col_count = count_columns(header)

    prompt = f"""请为我的游戏生成大量随机遭遇事件。

表头格式：
{header}

字段说明：
- id: 格式为 e{{编号}}，从 e5 开始递增
- title: 事件标题（3~6字）
- description: 事件描述（40~80字，描述场景和遭遇）
- c1_text: 选项1按钮文字（3~5字）
- c1_consequence: 选项1的结果叙述（20~40字）
- c1_gold: 选项1的金帛影响（正数=获得，负数=失去，范围 -200~500）
- c1_food: 选项1的粮食影响（范围 -30~30）
- c1_morale: 选项1的士气影响（范围 -20~20）
- c2_text: 选项2按钮文字（3~5字）
- c2_consequence: 选项2的结果叙述（20~40字）
- c2_gold: 选项2的金帛影响
- c2_food: 选项2的粮食影响
- c2_morale: 选项2的士气影响

已有事件（共4个，请参考风格和数值平衡）：
{csv_content}

请生成 20 个新事件（id 从 e5 到 e24），涵盖以下主题类型：
1. 道德抉择型（3~4个）— 救人vs自保，如遇到受伤的难民、被遗弃的孩童
2. 风险收益型（3~4个）— 赌博/探索废墟/打开棺材，高风险高回报
3. 战团内部型（3~4个）— 成员争吵/生病/偷盗/士气问题
4. 商业交易型（2~3个）— 遇到商人/走私者/黑市
5. 历史氛围型（2~3个）— 遇到逃难百姓/战场遗址/古墓/废弃营地
6. 自然灾害型（2~3个）— 暴风雪/洪水/瘟疫/断粮
7. 奇遇型（2~3个）— 高人指点/发现宝藏/神秘旅人

要求：
- 两个选项要形成有意义的对比（善vs恶、冒险vs保守、花钱vs省钱）
- 不要出现白拿好处的选项，每个选项都要有代价或风险
- 描述要有战国时期的文学韵味
- 数值影响要合理平衡

只输出 CSV 数据行，不要表头行，共 {col_count} 列，用 | 分隔。"""

    return prompt, "events.csv", col_count


# ============================================================
#  任务模板生成 (JSON → TypeScript)
# ============================================================

# 当前 constants.ts 中已有的区域
BIOMES = ["NORTHERN_TUNDRA", "CENTRAL_PLAINS", "SOUTHERN_WETLANDS", "FAR_SOUTH_DESERT"]
BIOME_NAMES = {
    "NORTHERN_TUNDRA": "北方苦寒之地（类似战场兄弟的北方冻土）",
    "CENTRAL_PLAINS": "中原大地（战国时期的核心地带，流寇、叛军、邪教出没）",
    "SOUTHERN_WETLANDS": "南方沼泽密林（百越蛮族、水贼出没）",
    "FAR_SOUTH_DESERT": "西南沙漠（胡人、沙匪、商路争夺）",
}
QUEST_TYPES = ["HUNT", "PATROL", "ESCORT", "DELIVERY"]


def _read_existing_quest_templates() -> str:
    """从 constants.ts 中读取现有的 QUEST_TEMPLATES，供 AI 参考风格"""
    if not CONSTANTS_FILE.exists():
        return ""
    content = CONSTANTS_FILE.read_text(encoding="utf-8")
    # 提取 QUEST_TEMPLATES 对象（大致范围）
    start = content.find("export const QUEST_TEMPLATES = {")
    if start == -1:
        return ""
    # 找到匹配的结束 };
    depth = 0
    end = start
    for i in range(start, len(content)):
        if content[i] == '{':
            depth += 1
        elif content[i] == '}':
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    # 截取前 2000 字符作为参考（避免 prompt 过长）
    snippet = content[start:end]
    if len(snippet) > 2000:
        snippet = snippet[:2000] + "\n... (已截断)"
    return snippet


def _read_existing_elite_templates() -> str:
    """从 constants.ts 中读取现有的 ELITE_QUEST_TEMPLATES"""
    if not CONSTANTS_FILE.exists():
        return ""
    content = CONSTANTS_FILE.read_text(encoding="utf-8")
    start = content.find("export const ELITE_QUEST_TEMPLATES = {")
    if start == -1:
        return ""
    depth = 0
    end = start
    for i in range(start, len(content)):
        if content[i] == '{':
            depth += 1
        elif content[i] == '}':
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    snippet = content[start:end]
    if len(snippet) > 2000:
        snippet = snippet[:2000] + "\n... (已截断)"
    return snippet


def prompt_quests() -> str:
    """构建普通任务模板生成提示词，返回 prompt（生成 JSON）"""
    existing = _read_existing_quest_templates()

    prompt = f"""请为我的游戏生成更多任务描述模板。我需要 JSON 格式的数据，后续会由脚本转换为 TypeScript。

## 任务模板结构说明

每个区域 (biome) 下有多种任务类型：
- HUNT: 杀敌/讨伐任务，描述函数参数为 (target, place, npc)
- PATROL: 巡逻任务，描述函数参数为 (place, npc)
- ESCORT: 护送任务，描述函数参数为 (place, npc)
- DELIVERY: 送信/运货任务，描述函数参数为 (place, npc)

每个模板包含：
- targets: 目标名称数组（仅 HUNT 类型需要）
- titles: 三个难度对应的标题 {{"1": "...", "2": "...", "3": "..."}}（PATROL/ESCORT/DELIVERY 三个难度通常相同）
- descs: 描述文本数组，使用占位符 {{target}}, {{place}}, {{npc}}（非 HUNT 类型没有 {{target}}）

## 描述文本要求
- 每条描述 60~120 字
- 使用 {{target}}, {{place}}, {{npc}} 占位符
- 必须有战国时期的文学韵味和代入感
- 描述要有场景感：包含 NPC 的动作、表情、语气
- 要形式多样：有的是对话形式，有的是告示形式，有的是旁白叙述
- 使用「」表示对话内容

## 已有数据（请参考风格，不要重复这些内容）
{existing}

## 四个区域
1. NORTHERN_TUNDRA — {BIOME_NAMES['NORTHERN_TUNDRA']}
2. CENTRAL_PLAINS — {BIOME_NAMES['CENTRAL_PLAINS']}
3. SOUTHERN_WETLANDS — {BIOME_NAMES['SOUTHERN_WETLANDS']}
4. FAR_SOUTH_DESERT — {BIOME_NAMES['FAR_SOUTH_DESERT']}

## 生成要求
为每个区域的每种任务类型各生成 1~2 个新模板组，每组包含 3~4 条描述。
重点增加 HUNT 类型的多样性（每区域增加 2~3 个新 HUNT 模板组）。

请严格按以下 JSON 格式输出，不要有任何其他文字或 markdown 标记：
{{
  "NORTHERN_TUNDRA": {{
    "HUNT": [
      {{
        "targets": ["目标1", "目标2", "目标3"],
        "titles": {{"1": "低难度标题", "2": "中难度标题", "3": "高难度标题"}},
        "descs": [
          "{{npc}}说道：「{{place}}那边的{{target}}又闹事了……」",
          "告示上写着：「悬赏通缉{{place}}之{{target}}……」"
        ]
      }}
    ],
    "PATROL": [
      {{
        "titles": {{"1": "巡逻", "2": "巡逻", "3": "巡逻"}},
        "descs": [
          "{{npc}}递来地图：「{{place}}一带需要巡查……」"
        ]
      }}
    ],
    "ESCORT": [...],
    "DELIVERY": [...]
  }},
  "CENTRAL_PLAINS": {{ ... }},
  "SOUTHERN_WETLANDS": {{ ... }},
  "FAR_SOUTH_DESERT": {{ ... }}
}}

只输出 JSON，不要 markdown 代码块标记。"""
    return prompt


def prompt_elite_quests() -> str:
    """构建高声望任务模板生成提示词"""
    existing = _read_existing_elite_templates()

    prompt = f"""请为我的游戏生成更多高声望专属任务模板。这些是只有声望足够高的战团才能接取的精英任务。

## 高声望任务模板结构
在普通任务基础上，增加：
- type: 任务类型 ("HUNT", "PATROL", "ESCORT")
- minDifficulty: 最低难度（通常为 2 或 3）
- requiredReputation: 所需声望值（200~600）
- targets: 目标名称数组（可为空，如护送任务）
- titles: 三个难度对应的标题
- descs: 描述文本数组，使用占位符 {{target}}, {{place}}, {{npc}}

## 描述文本要求
- 每条描述 80~150 字（比普通任务更长、更有氛围感）
- 使用 {{target}}, {{place}}, {{npc}} 占位符
- 语气要更郑重、更有分量——这是委托给精锐的重大任务
- 要体现出对战团声望的认可

## 已有高声望任务模板（请参考风格，不要重复）
{existing}

## 四个区域
1. NORTHERN_TUNDRA — {BIOME_NAMES['NORTHERN_TUNDRA']}
2. CENTRAL_PLAINS — {BIOME_NAMES['CENTRAL_PLAINS']}
3. SOUTHERN_WETLANDS — {BIOME_NAMES['SOUTHERN_WETLANDS']}
4. FAR_SOUTH_DESERT — {BIOME_NAMES['FAR_SOUTH_DESERT']}

## 生成要求
每个区域生成 2~3 个新的高声望任务模板。

请严格按以下 JSON 格式输出：
{{
  "NORTHERN_TUNDRA": [
    {{
      "type": "HUNT",
      "targets": ["目标1", "目标2"],
      "titles": {{"1": "标题1", "2": "标题2", "3": "标题3"}},
      "descs": [
        "{{npc}}取出密函：「{{place}}出现了{{target}}……」"
      ],
      "minDifficulty": 3,
      "requiredReputation": 300
    }}
  ],
  "CENTRAL_PLAINS": [...],
  "SOUTHERN_WETLANDS": [...],
  "FAR_SOUTH_DESERT": [...]
}}

只输出 JSON，不要 markdown 代码块标记。"""
    return prompt


def _desc_to_ts_function(desc_text: str, quest_type: str) -> str:
    """将占位符描述文本转换为 TypeScript 箭头函数字符串"""
    # 替换占位符为模板字面量
    ts_body = desc_text.replace("{target}", "${target}").replace("{place}", "${place}").replace("{npc}", "${npc}")

    if quest_type == "HUNT":
        # HUNT: (target, place, npc) => `...`
        # 检测是否用到了各参数，对未用到的加下划线前缀
        uses_npc = "{npc}" in desc_text
        npc_param = "npc" if uses_npc else "_npc"
        return f"(target: string, place: string, {npc_param}: string) => `{ts_body}`"
    else:
        # PATROL/ESCORT/DELIVERY: (place, npc) => `...`
        uses_npc = "{npc}" in desc_text
        npc_param = "npc" if uses_npc else "_npc"
        return f"(place: string, {npc_param}: string) => `{ts_body}`"


def _titles_to_ts_function(titles: dict, quest_type: str) -> str:
    """将标题字典转换为 TypeScript 箭头函数"""
    t1 = titles.get("1", titles.get(1, ""))
    t2 = titles.get("2", titles.get(2, ""))
    t3 = titles.get("3", titles.get(3, ""))

    # 如果三个标题都相同，用简化写法
    if t1 == t2 == t3:
        return f"(_diff: 1|2|3) => '{t1}'"
    # 两个相同的情况
    if t2 == t3:
        return f"(diff: 1|2|3) => diff === 1 ? '{t1}' : '{t2}'"
    return f"(diff: 1|2|3) => diff === 1 ? '{t1}' : diff === 2 ? '{t2}' : '{t3}'"


def _quest_template_to_ts(tmpl: dict, quest_type: str, indent: str = "      ") -> str:
    """将单个任务模板 JSON 转换为 TypeScript 对象字符串"""
    lines = [f"{indent}{{"]

    # targets (仅 HUNT)
    if quest_type == "HUNT" and "targets" in tmpl:
        targets_str = json.dumps(tmpl["targets"], ensure_ascii=False)
        lines.append(f"{indent}  targets: {targets_str},")

    # titles
    titles_fn = _titles_to_ts_function(tmpl["titles"], quest_type)
    lines.append(f"{indent}  titles: {titles_fn},")

    # descs
    descs = tmpl.get("descs", [])
    lines.append(f"{indent}  descs: [")
    for desc in descs:
        fn = _desc_to_ts_function(desc, quest_type)
        lines.append(f"{indent}    {fn},")
    lines.append(f"{indent}  ],")

    lines.append(f"{indent}}}")
    return "\n".join(lines)


def _elite_template_to_ts(tmpl: dict, indent: str = "    ") -> str:
    """将高声望任务模板 JSON 转换为 TypeScript 对象字符串"""
    quest_type = tmpl.get("type", "HUNT")
    lines = [f"{indent}{{"]

    lines.append(f"{indent}  type: '{quest_type}' as const,")

    # targets
    targets = tmpl.get("targets", [])
    targets_str = json.dumps(targets, ensure_ascii=False)
    lines.append(f"{indent}  targets: {targets_str},")

    # titles
    titles_fn = _titles_to_ts_function(tmpl["titles"], quest_type)
    lines.append(f"{indent}  titles: {titles_fn},")

    # descs
    descs = tmpl.get("descs", [])
    lines.append(f"{indent}  descs: [")
    for desc in descs:
        fn = _desc_to_ts_function(desc, quest_type)
        lines.append(f"{indent}    {fn},")
    lines.append(f"{indent}  ],")

    # minDifficulty & requiredReputation
    min_diff = tmpl.get("minDifficulty", 3)
    req_rep = tmpl.get("requiredReputation", 300)
    lines.append(f"{indent}  minDifficulty: {min_diff} as 1|2|3,")
    lines.append(f"{indent}  requiredReputation: {req_rep},")

    lines.append(f"{indent}}}")
    return "\n".join(lines)


def update_quest_templates_in_constants(quest_data: dict):
    """将新的普通任务模板追加到 constants.ts 的 QUEST_TEMPLATES 中"""
    if not CONSTANTS_FILE.exists():
        print(f"  [警告] 找不到 {CONSTANTS_FILE}，跳过更新")
        return

    content = CONSTANTS_FILE.read_text(encoding="utf-8")
    backup_file(CONSTANTS_FILE)
    updated = False

    for biome in BIOMES:
        biome_data = quest_data.get(biome, {})
        if not biome_data:
            continue

        for quest_type in QUEST_TYPES:
            templates = biome_data.get(quest_type, [])
            if not templates:
                continue

            # 生成要插入的 TS 代码
            new_entries = []
            for tmpl in templates:
                ts_code = _quest_template_to_ts(tmpl, quest_type)
                new_entries.append(ts_code)

            if not new_entries:
                continue

            # 在对应 biome -> quest_type 数组的末尾（最后一个 ] 之前）插入
            # 策略：找到 QUEST_TEMPLATES 中对应位置
            # 查找模式: biome 下的 quest_type 数组
            # 使用简单策略：找到 `quest_type: [` 在 biome 块内的位置
            insert_text = ",\n" + ",\n".join(new_entries)

            # 找到 QUEST_TEMPLATES 对象起始
            qt_start = content.find("export const QUEST_TEMPLATES = {")
            if qt_start == -1:
                print("  [警告] 未找到 QUEST_TEMPLATES")
                continue

            # 找到对应 biome 块
            biome_search_start = content.find(f"  {biome}: {{", qt_start)
            if biome_search_start == -1:
                print(f"  [警告] 未找到 biome: {biome}")
                continue

            # 找到对应 quest_type 数组
            type_search_start = content.find(f"    {quest_type}: [", biome_search_start)
            if type_search_start == -1:
                # 该 biome 下没有这个 quest_type，需要新增整个数组
                # 找到 biome 块的最后一个 ] 或 }, 之前插入
                print(f"  [信息] {biome} 下没有 {quest_type} 类型，将新增")
                # 找到 biome 块的结尾 },
                # 简单做法：找到下一个 biome 的开始或 }; 结束
                next_biome_pos = len(content)
                for next_biome in BIOMES:
                    if next_biome == biome:
                        continue
                    pos = content.find(f"  {next_biome}: {{", biome_search_start + 1)
                    if pos != -1 and pos < next_biome_pos:
                        next_biome_pos = pos

                # 也检查 QUEST_TEMPLATES 的结尾 };
                qt_end = content.find("};", biome_search_start)
                if qt_end != -1 and qt_end < next_biome_pos:
                    next_biome_pos = qt_end

                # 在 biome 结尾的 }, 之前插入新的 quest_type 数组
                # 回溯找到 }, 之前的位置
                insert_pos = content.rfind("},", biome_search_start, next_biome_pos)
                if insert_pos == -1:
                    insert_pos = content.rfind("],", biome_search_start, next_biome_pos)
                if insert_pos == -1:
                    print(f"  [警告] 无法定位 {biome} 块的结尾")
                    continue

                # 在 ], 或 }, 之后插入
                insert_pos = content.find("\n", insert_pos)
                new_array_code = f"\n    {quest_type}: [\n" + ",\n".join(new_entries) + ",\n    ],"
                content = content[:insert_pos] + new_array_code + content[insert_pos:]
                updated = True
                print(f"  [新增] {biome}.{quest_type}: {len(new_entries)} 个模板")
                continue

            # 找到该 quest_type 数组的最后一个 }（最后一个模板的结尾）
            # 从 type_search_start 开始，找到匹配的 ]
            bracket_depth = 0
            array_end = type_search_start
            for i in range(type_search_start, len(content)):
                if content[i] == '[':
                    bracket_depth += 1
                elif content[i] == ']':
                    bracket_depth -= 1
                    if bracket_depth == 0:
                        array_end = i
                        break

            # 在 ] 之前插入新模板
            # 找到 ] 前最后一个 } 的位置
            last_brace = content.rfind("}", type_search_start, array_end)
            if last_brace == -1:
                # 空数组，直接在 [ 之后插入
                insert_pos = content.find("[", type_search_start) + 1
                insert_text = "\n" + ",\n".join(new_entries) + ",\n    "
            else:
                insert_pos = last_brace + 1
                # 检查后面是否已有逗号
                after = content[insert_pos:insert_pos+5].strip()
                if after and after[0] == ',':
                    insert_text = "\n" + ",\n".join(new_entries)
                else:
                    insert_text = ",\n" + ",\n".join(new_entries)

            content = content[:insert_pos] + insert_text + content[insert_pos:]
            updated = True
            print(f"  [追加] {biome}.{quest_type}: {len(new_entries)} 个模板")

    if updated:
        CONSTANTS_FILE.write_text(content, encoding="utf-8")
        print(f"  [写入] 已更新 QUEST_TEMPLATES")
    else:
        print("  [跳过] 没有需要追加的任务模板")


def update_elite_templates_in_constants(elite_data: dict):
    """将新的高声望任务模板追加到 constants.ts 的 ELITE_QUEST_TEMPLATES 中"""
    if not CONSTANTS_FILE.exists():
        print(f"  [警告] 找不到 {CONSTANTS_FILE}，跳过更新")
        return

    content = CONSTANTS_FILE.read_text(encoding="utf-8")
    backup_file(CONSTANTS_FILE)
    updated = False

    for biome in BIOMES:
        templates = elite_data.get(biome, [])
        if not templates:
            continue

        new_entries = []
        for tmpl in templates:
            ts_code = _elite_template_to_ts(tmpl)
            new_entries.append(ts_code)

        if not new_entries:
            continue

        # 找到 ELITE_QUEST_TEMPLATES 中对应 biome 数组
        eq_start = content.find("export const ELITE_QUEST_TEMPLATES = {")
        if eq_start == -1:
            print("  [警告] 未找到 ELITE_QUEST_TEMPLATES")
            continue

        biome_search_start = content.find(f"  {biome}: [", eq_start)
        if biome_search_start == -1:
            print(f"  [警告] ELITE_QUEST_TEMPLATES 中未找到 {biome}")
            continue

        # 找到该 biome 数组的结尾 ]
        bracket_depth = 0
        array_end = biome_search_start
        for i in range(biome_search_start, len(content)):
            if content[i] == '[':
                bracket_depth += 1
            elif content[i] == ']':
                bracket_depth -= 1
                if bracket_depth == 0:
                    array_end = i
                    break

        # 在 ] 之前插入，找到最后一个 }
        last_brace = content.rfind("}", biome_search_start, array_end)
        if last_brace == -1:
            insert_pos = content.find("[", biome_search_start) + 1
            insert_text = "\n" + ",\n".join(new_entries) + ",\n  "
        else:
            insert_pos = last_brace + 1
            after = content[insert_pos:insert_pos+5].strip()
            if after and after[0] == ',':
                insert_text = "\n" + ",\n".join(new_entries)
            else:
                insert_text = ",\n" + ",\n".join(new_entries)

        content = content[:insert_pos] + insert_text + content[insert_pos:]
        updated = True
        print(f"  [追加] ELITE {biome}: {len(new_entries)} 个模板")

    if updated:
        CONSTANTS_FILE.write_text(content, encoding="utf-8")
        print(f"  [写入] 已更新 ELITE_QUEST_TEMPLATES")
    else:
        print("  [跳过] 没有需要追加的高声望任务模板")


# ============================================================
#  Stories 更新逻辑
# ============================================================

def update_stories_in_constants(stories_dict: dict):
    """将新的背景故事插入 constants.tsx 的 STORIES 对象中"""
    if not CONSTANTS_FILE.exists():
        print(f"  [警告] 找不到 {CONSTANTS_FILE}，跳过 STORIES 更新")
        return

    content = CONSTANTS_FILE.read_text(encoding="utf-8")

    # 找到 STORIES 对象的闭合大括号 };
    # 匹配模式: const STORIES: Record<string, string[]> = { ... };
    pattern = r"(const STORIES:\s*Record<string,\s*string\[\]>\s*=\s*\{)(.*?)(\};)"
    match = re.search(pattern, content, re.DOTALL)

    if not match:
        print("  [警告] 在 constants.tsx 中未找到 STORIES 对象，跳过更新")
        return

    backup_file(CONSTANTS_FILE)

    existing_block = match.group(2)
    new_entries = ""
    for bg_id, stories in stories_dict.items():
        # 检查是否已存在
        if f"'{bg_id}'" in existing_block:
            print(f"  [跳过] STORIES 中已存在 '{bg_id}'")
            continue
        stories_str = json.dumps(stories, ensure_ascii=False)
        new_entries += f"\n    '{bg_id}': {stories_str},"

    if new_entries:
        # 在闭合 }; 之前插入新条目
        new_block = existing_block.rstrip() + new_entries + "\n"
        new_content = content[:match.start(2)] + new_block + content[match.start(3):]
        CONSTANTS_FILE.write_text(new_content, encoding="utf-8")
        print(f"  [写入] 向 constants.tsx 的 STORIES 追加了 {len(stories_dict)} 个背景故事")
    else:
        print("  [跳过] 没有需要追加的 STORIES 条目")


# ============================================================
#  主逻辑
# ============================================================

def generate_type(gen_type: str, dry_run: bool = False):
    """生成指定类型的数据（CSV 或 任务模板 JSON）"""
    print(f"\n{'=' * 50}")
    print(f"  正在生成: {gen_type}")
    print(f"{'=' * 50}")

    # ---- 任务模板类型：走 JSON → TypeScript 流程 ----
    if gen_type in ("quests", "elite_quests"):
        if gen_type == "quests":
            prompt = prompt_quests()
        else:
            prompt = prompt_elite_quests()

        response = call_gemini(prompt, dry_run=dry_run)
        if dry_run or not response:
            return

        cleaned = clean_ai_response(response)
        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError as e:
            print(f"  [错误] JSON 解析失败: {e}")
            print(f"  原始返回:\n{cleaned[:800]}")
            return

        if gen_type == "quests":
            # 统计数量
            total = sum(
                len(templates)
                for biome_data in data.values()
                for templates in biome_data.values()
            )
            print(f"  [解析] 获得 {total} 个任务模板")
            update_quest_templates_in_constants(data)
        else:
            total = sum(len(templates) for templates in data.values())
            print(f"  [解析] 获得 {total} 个高声望任务模板")
            update_elite_templates_in_constants(data)
        return

    # ---- CSV 类型：原有流程 ----
    prompt_funcs = {
        "weapons": prompt_weapons,
        "armor": prompt_armor,
        "helmets": prompt_helmets,
        "shields": prompt_shields,
        "backgrounds": prompt_backgrounds,
        "events": prompt_events,
    }

    if gen_type not in prompt_funcs:
        print(f"  [错误] 未知的生成类型: {gen_type}")
        print(f"  支持的类型: {', '.join(ALL_TYPES)}")
        return

    prompt, csv_file, expected_cols = prompt_funcs[gen_type]()

    # 调用 Gemini
    response = call_gemini(prompt, dry_run=dry_run)
    if dry_run or not response:
        return

    # 清理和校验
    cleaned = clean_ai_response(response)
    lines = cleaned.split("\n")
    header = get_header(read_csv(csv_file))
    valid_lines = validate_and_filter_lines(lines, expected_cols, header)

    if not valid_lines:
        print("  [错误] AI 返回的数据全部不合法，请检查并重试")
        print(f"  原始返回:\n{response[:500]}")
        return

    print(f"  [校验] 通过 {len(valid_lines)}/{len(lines)} 条数据")

    # 写入 CSV
    append_to_csv(csv_file, valid_lines)

    # 对于 backgrounds，额外生成 stories
    if gen_type == "backgrounds":
        # 提取新增的背景 ID
        new_bg_ids = []
        for line in valid_lines:
            bg_id = line.split("|")[0].strip()
            if bg_id:
                new_bg_ids.append(bg_id)

        if new_bg_ids:
            print(f"\n  正在为 {len(new_bg_ids)} 个新背景生成故事...")
            stories_prompt = prompt_backgrounds_stories(new_bg_ids)
            stories_response = call_gemini(stories_prompt, dry_run=dry_run)

            if stories_response:
                stories_cleaned = clean_ai_response(stories_response)
                try:
                    stories_dict = json.loads(stories_cleaned)
                    update_stories_in_constants(stories_dict)
                except json.JSONDecodeError as e:
                    print(f"  [错误] 故事 JSON 解析失败: {e}")
                    print(f"  原始返回:\n{stories_cleaned[:500]}")


def main():
    args = sys.argv[1:]

    # 检查是否 dry-run 模式
    dry_run = "--dry-run" in args
    if dry_run:
        args.remove("--dry-run")

    # 确定要生成的类型
    types_to_generate = args if args else ALL_TYPES

    # 验证类型
    for t in types_to_generate:
        if t not in ALL_TYPES:
            print(f"[错误] 未知类型 '{t}'，支持的类型: {', '.join(ALL_TYPES)}")
            sys.exit(1)

    print("=" * 50)
    print("  《战国·与伍同行》配置数据生成器")
    print("=" * 50)
    print(f"  模型: {MODEL_NAME}")
    print(f"  CSV 目录: {CSV_DIR}")
    print(f"  待生成: {', '.join(types_to_generate)}")
    print(f"  Dry-run: {'是' if dry_run else '否'}")

    if not dry_run and (API_KEY == "YOUR_API_KEY_HERE" or not API_KEY):
        print("\n[错误] 请设置 GEMINI_API_KEY 环境变量:")
        print("  export GEMINI_API_KEY=\"your-api-key-here\"")
        print("  或在脚本顶部修改 API_KEY 变量")
        sys.exit(1)

    for gen_type in types_to_generate:
        generate_type(gen_type, dry_run=dry_run)

    print(f"\n{'=' * 50}")
    print("  全部完成！")
    print(f"{'=' * 50}")


if __name__ == "__main__":
    main()
