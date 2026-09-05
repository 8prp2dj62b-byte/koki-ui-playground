import { assertPropertySearchRequest, type PropertySearchRequest } from './types.js';
import { buildPropertySearchUserPrompt, PROPERTY_SEARCH_SYSTEM_PROMPT } from './gemini-prompt.js';

export interface GeminiCompilerOptions {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

export class GeminiPropertySearchCompiler {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GeminiCompilerOptions) {
    if (!options.apiKey) throw new Error('GEMINI_API_KEY_REQUIRED');
    this.apiKey = options.apiKey;
    this.model = options.model || 'gemini-2.5-flash';
    this.fetchImpl = options.fetchImpl || fetch;
  }

  async compile(text: string, currentRequest?: PropertySearchRequest): Promise<PropertySearchRequest> {
    const clean = text.trim();
    if (!clean) throw new Error('SEARCH_TEXT_REQUIRED');

    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await this.callGemini(clean, currentRequest);
        assertPropertySearchRequest(result);
        return result;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('INTENT_COMPILATION_FAILED');
  }

  private async callGemini(text: string, currentRequest?: PropertySearchRequest): Promise<unknown> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const response = await this.fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: PROPERTY_SEARCH_SYSTEM_PROMPT }],
        },
        contents: [{
          role: 'user',
          parts: [{ text: buildPropertySearchUserPrompt({ text, currentRequest }) }],
        }],
        generationConfig: {
          temperature: 0,
          topP: 1,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GEMINI_HTTP_${response.status}:${body.slice(0, 300)}`);
    }
    const payload = await response.json() as any;
    const raw = payload?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('').trim();
    if (!raw) throw new Error('GEMINI_EMPTY_RESPONSE');
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error('INTENT_COMPILATION_INVALID_JSON');
    }
  }
}
