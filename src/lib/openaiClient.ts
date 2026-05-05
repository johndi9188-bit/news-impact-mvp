import OpenAI from "openai";

export function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const baseURL =
    process.env.OPENAI_BASE_URL?.replace(/\/$/, "") || "https://api.openai.com/v1";
  return new OpenAI({ apiKey, baseURL });
}
