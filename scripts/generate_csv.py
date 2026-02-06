#!/usr/bin/env python3
"""
《战国·与伍同行》CSV 配置自动生成脚本
使用 Google Gemini API 批量生成游戏配置数据。

用法:
    1. 将你的 Gemini API Key 粘贴到 scripts/api_key.txt 的第二行
       （或设置环境变量 GEMINI_API_KEY）

    2. 运行脚本:
       python generate_csv.py              # 生成全部
       python generate_csv.py weapons      # 只生成武器
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
ALL_TYPES = ["weapons", "armor", "helmets", "shields", "backgrounds", "events"]

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
- salaryMult: 薪资倍率（0.5~3.5，出身越好/越稀有越贵）
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

已有数据（共7个背景）：
{csv_content}

请生成以下新背景（约 10 个）：
1. BLACKSMITH|铁匠 — 力量高(hp/fatigue正)、近战略强、远程弱、salaryMult 1.3
2. PHYSICIAN|医者 — 胆识高、战斗弱、salaryMult 1.6
3. BEGGAR|乞丐 — 最廉价(salaryMult 0.5)、属性差但hp尚可
4. MERCHANT|商贩 — 有钱(salaryMult 2.0, gearQuality 1)、战斗弱、先手高
5. ASSASSIN|刺客 — 先手极高、近战强、脆皮(hp低)、salaryMult 2.5
6. LABORER|壮丁 — 体力极高、其余平庸、salaryMult 0.7
7. FISHERMAN|渔夫 — 类似农夫但体力更好、salaryMult 0.9
8. MINER|矿工 — hp高、体力高、灵活性差、salaryMult 1.0
9. PERFORMER|伶人 — 先手高、胆识高、战斗极弱、salaryMult 1.2
10. MOHIST|墨者 — 全能型稀有背景、salaryMult 3.5, gearQuality 2

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
    """生成指定类型的 CSV 数据"""
    print(f"\n{'=' * 50}")
    print(f"  正在生成: {gen_type}")
    print(f"{'=' * 50}")

    # 获取 prompt
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
