
import { EVENT_TEMPLATES } from "../constants.tsx";

/**
 * 以前用于调用 AI 生成事件。
 * 现在直接从 CSV 配置 (EVENT_TEMPLATES) 中随机抽取事件。
 */
export async function generateDynamicEvent(context: string) {
  // 模拟极短的加载时间
  await new Promise(resolve => setTimeout(resolve, 100));
  
  if (!EVENT_TEMPLATES || EVENT_TEMPLATES.length === 0) {
      return null;
  }

  const randomIndex = Math.floor(Math.random() * EVENT_TEMPLATES.length);
  return EVENT_TEMPLATES[randomIndex];
}
