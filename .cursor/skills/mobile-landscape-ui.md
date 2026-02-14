---
name: mobile-landscape-ui
description: 手机横屏 UI 适配规范。在修改任何面板/页面的移动端横屏布局、处理不同 DPI 机型显示差异、或用户反馈"手机横屏下看不到/被挤压/滚动不了"时使用。
---

# 手机横屏 UI 适配规范

本项目是一款运行在 Android WebView 中的 H5 游戏（React + Tailwind），需通用适配任意 DPI/分辨率的手机横屏。方案不依赖特定 DPI 值，而是通过 `devicePixelRatio` 归一化 + 视口比例动态缩放，保证所有机型视觉一致。

## 核心检测逻辑

```tsx
const [isMobileLayout, setIsMobileLayout] = useState(false);
const [isCompactLandscape, setIsCompactLandscape] = useState(false);
const [compactFontScale, setCompactFontScale] = useState(1);

useEffect(() => {
  const detect = () => {
    const vw = window.visualViewport?.width ?? window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const landscape = vw > vh;
    // 统一手机横屏：不按尺寸阈值或具体 DPI 分流，所有触屏横屏走同一分支
    const compact = coarse && landscape;
    // DPR 归一化：以基准 DPR 为 1 倍参考，自动适配任意 DPI
    const dpr = window.devicePixelRatio || 1;
    const BASELINE_DPR = 1.7; // 可按项目主力机型微调，不影响通用性
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
```

## 布局规则

### 1. 所有机型走同一套规则

**禁止**按 `viewportWidth < 960` 等尺寸阈值或具体 DPI 数值把机型分流成不同布局。  
用 `coarse + landscape` 统一判定，`devicePixelRatio` 只参与缩放系数计算。

### 2. 横屏布局可选：双栏或上下

手机横屏**不是必须分栏**。优先按页面信息密度选择布局：

- 信息区和操作区需要同时常驻可见：用 `flex-row` 双栏
- 页面结构天然是“标题/说明在上 + 操作按钮在下”：用纵向上下布局（`flex-col`）

```tsx
const compactRootClass = isCompactLandscape
  ? (preferColumns
      ? 'flex-1 flex flex-row gap-2 overflow-hidden min-h-0'
      : 'flex-1 flex flex-col items-center justify-center overflow-hidden min-h-0')
  : (isMobileLayout ? '纵向堆叠' : '桌面大屏布局');
```

- 双栏时左右容器都加 `min-w-0`，可用 `flex-[12]/flex-[9]` 等弹性比例
- 上下布局时保持单列主轴，不引入“伪双栏”占位容器
- **禁止** `min-w-[260px]` 等硬性最小宽度

### 3. 滚动只留一层

- 外层容器 `overflow-hidden`
- 双栏：左右栏各自内部有一个 `overflow-y-auto` 滚动区
- 上下：仅内容主区保留一个 `overflow-y-auto`，标题/按钮区尽量固定高度
- **禁止**外层 `overflow-y-auto` + 内层 `overflow-y-auto` 嵌套

### 4. 压缩栏目高度，把空间让给内容

紧凑横屏下：
- 顶栏：`py-0.5`、按钮/标题字号缩小、隐藏次要信息（如分隔符）
- 详情头部（名称/价格区）：`mb-1 pb-1`、gap 缩小
- padding 用 `compactFontScale` 动态算：

```tsx
style={isCompactLandscape ? {
  paddingLeft: `${Math.max(4, Math.round(8 * compactFontScale))}px`,
  paddingTop: `${Math.max(1, Math.round(3 * compactFontScale))}px`,
} : undefined}
```

### 5. 信息分区：双栏时左简右详（上下布局可跳过）

当使用双栏且右侧是"属性/详情"面板时：
- 把姓名、费用、操作按钮移到**左侧**简略显示
- 右侧只保留：特质标签 + 属性条 + 描述（最大化属性可见区域）

### 6. 字号用视口自适应

关键文字使用 `clamp + vw + compactFontScale`，避免固定像素：

```tsx
style={isCompactLandscape
  ? { fontSize: `clamp(0.66rem, ${1.3 * compactFontScale}vw, 0.82rem)` }
  : undefined}
```

非关键/辅助文字可保持 Tailwind class（`text-[10px]` 等），但在紧凑模式用更小档位。

### 7. 组件参数化密度

通过 prop 控制密度，而非复制组件：

```tsx
// StatBarSmall 增加 dense 参数
<StatBarSmall label="生命" val={hp} max={120} dense={isCompactLandscape} />

// dense 模式：字号 11px、条高 h-2.5；默认：字号 10px、条高 h-2
```

## 三个判定变量的使用场景

| 变量 | 含义 | 使用场景 |
|------|------|----------|
| `isMobileLayout` | 触屏 或 视口<1024 | 决定是否走移动端分支（竖屏纵向堆叠等） |
| `isCompactLandscape` | 触屏 + 横屏 | 决定是否走紧凑横屏规则（可双栏，也可上下） |
| `compactFontScale` | 0.58~1.08（自动计算） | 动态缩放字号/间距，通过 DPR 归一化确保任意机型视觉趋同 |

## 常见反模式

| 错误做法 | 正确做法 |
|----------|----------|
| 按 `width < 960` 分两套布局 | `coarse + landscape` 统一分支 |
| 把“横屏”等同于“必须双栏” | 按信息结构选择：双栏或上下 |
| 固定 `min-w-[260px]` | `min-w-0` + 弹性比例 |
| 外层 + 内层双层滚动 | 外层 hidden，内层单层滚动 |
| 详情头部占 50% 高度 | 压缩到最小，内容区 flex-1 |
| 字号写死 `text-xl` | `clamp() + compactFontScale` |
| 给不同 DPI/分辨率做 if-else | DPR 归一化到连续 scale 参数 |

## 已应用此规范的组件

- `components/CityView.tsx`（商店/招募/酒肆/医馆）
- `components/SquadManagement.tsx`（战团营地）
