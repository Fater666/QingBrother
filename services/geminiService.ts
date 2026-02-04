
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function generateDynamicEvent(context: string) {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `基于以下战国末期的背景：${context}。生成一个随机遭遇事件。`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          choices: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                consequence: { type: Type.STRING },
                impact: {
                  type: Type.OBJECT,
                  properties: {
                    gold: { type: Type.NUMBER },
                    food: { type: Type.NUMBER },
                    morale: { type: Type.NUMBER }
                  }
                }
              }
            }
          }
        },
        required: ["title", "description", "choices"]
      }
    }
  });

  try {
    return JSON.parse(response.text);
  } catch (e) {
    console.error("Failed to parse event JSON", e);
    return null;
  }
}
