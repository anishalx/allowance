import OpenAI from 'openai';

let client: OpenAI | null = null;

export function openai() {
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export const models = {
  compiler: process.env.OPENAI_MODEL || 'gpt-5.5',
  auditor: process.env.OPENAI_AUDITOR_MODEL || process.env.OPENAI_MODEL || 'gpt-5.5',
  agent: process.env.OPENAI_AGENT_MODEL || process.env.OPENAI_MODEL || 'gpt-5.5',
};
