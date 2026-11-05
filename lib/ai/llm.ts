import OpenAI from 'openai';
import { secret } from '../env';

// The AI runs on DeepSeek through its OpenAI-compatible Responses API. The `openai` package is only the
// HTTP client. DeepSeek's Responses API is stateless: no previous_response_id, so callers resend the
// conversation. AI_BASE_URL and the AI_*_MODEL variables point it at any other Responses-compatible
// provider or model.
export const AI_BASE_URL = (process.env.AI_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
export const aiApiKey = () => secret('DEEPSEEK_API_KEY');

let client: OpenAI | null = null;

export function llm() {
  client ??= new OpenAI({ apiKey: aiApiKey(), baseURL: AI_BASE_URL });
  return client;
}

// Flash everywhere by default. Compiling the same rules, V4 Pro took 44–156 s against Flash's 4–25 s and
// produced the same policy; the auditor sits in the payment path and the agent makes many calls per run.
const DEFAULT_MODEL = process.env.AI_MODEL || 'deepseek-flash';

export const models = {
  compiler: DEFAULT_MODEL,
  auditor: process.env.AI_AUDITOR_MODEL || DEFAULT_MODEL,
  agent: process.env.AI_AGENT_MODEL || DEFAULT_MODEL,
};

// Models the playground and the console may pick from. Safety must not depend on which one: that's the
// point of Allowance.
export const AGENT_MODELS = ['deepseek-flash', 'deepseek-v4-pro'] as const;
