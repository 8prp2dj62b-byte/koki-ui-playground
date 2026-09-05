import { assertPropertySearchRequest, type PropertySearchRequest } from './types.js';
import type { ImotGeminiNomenclature } from './imot-taxonomy.js';
import { buildPropertySearchUserPrompt, PROPERTY_SEARCH_SYSTEM_PROMPT } from './gemini-prompt.js';

export interface PropertySearchAddition {
  field: string;
  reason: 'missing' | 'ambiguous' | 'unsupported';
  question: string;
  options: Array<{ label: string; value: string }>;
}

export type PropertySearchCompilation =
  | { status: 'ready'; request: PropertySearchRequest; additions: [] }
  | { status: 'needs_input'; request: null; additions: PropertySearchAddition[] };

export interface GeminiCompilerOptions {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
  nomenclatureProvider: () => Promise<ImotGeminiNomenclature>;
}

export class GeminiPropertySearchCompiler {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly nomenclatureProvider: () => Promise<ImotGeminiNomenclature>;

  constructor(options: GeminiCompilerOptions) {
    if (!options.apiKey) throw new Error('GEMINI_API_KEY_REQUIRED');
    if (typeof options.nomenclatureProvider !== 'function') throw new Error('IMOT_NOMENCLATURE_PROVIDER_REQUIRED');
    this.apiKey = options.apiKey;
    this.model = options.model || 'gemini-2.5-flash';
    this.fetchImpl = options.fetchImpl || fetch;
    this.nomenclatureProvider = options.nomenclatureProvider;
  }

  async compile(text: string, currentRequest?: PropertySearchRequest): Promise<PropertySearchCompilation> {
    const clean = text.trim();
    if (!clean) throw new Error('SEARCH_TEXT_REQUIRED');

    const nomenclature = await this.nomenclatureProvider();
    if (!nomenclature?.locationRoutes?.sale?.length || !nomenclature?.locationRoutes?.rent?.length) {
      throw new Error('IMOT_NOMENCLATURE_UNAVAILABLE');
    }

    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await this.callGemini(clean, nomenclature, currentRequest);
        return validateCompilation(result);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('INTENT_COMPILATION_FAILED');
  }

  private async callGemini(
    text: string,
    nomenclature: ImotGeminiNomenclature,
    currentRequest?: PropertySearchRequest,
  ): Promise<unknown> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const response = await this.fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: PROPERTY_SEARCH_SYSTEM_PROMPT }] },
        contents: [{
          role: 'user',
          parts: [{ text: buildPropertySearchUserPrompt({ text, nomenclature, currentRequest }) }],
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
    try { return JSON.parse(raw); }
    catch { throw new Error('INTENT_COMPILATION_INVALID_JSON'); }
  }
}

function validateCompilation(value: unknown): PropertySearchCompilation {
  if (!value || typeof value !== 'object') throw new Error('INTENT_COMPILATION_INVALID_ENVELOPE');
  const candidate = value as Record<string, unknown>;

  if (candidate.status === 'ready') {
    assertPropertySearchRequest(candidate.request);
    const request = candidate.request as PropertySearchRequest;
    if (!request.transaction) throw new Error('INTENT_READY_TRANSACTION_REQUIRED');
    if (request.propertyTypes.length !== 1) throw new Error('INTENT_READY_ONE_PROPERTY_TYPE_REQUIRED');
    if (!request.location.city && !request.location.district) throw new Error('INTENT_READY_LOCATION_REQUIRED');
    return { status: 'ready', request, additions: [] };
  }

  if (candidate.status === 'needs_input') {
    if (candidate.request !== null) throw new Error('INTENT_NEEDS_INPUT_REQUEST_MUST_BE_NULL');
    if (!Array.isArray(candidate.additions) || candidate.additions.length === 0) {
      throw new Error('INTENT_ADDITIONS_REQUIRED');
    }
    return {
      status: 'needs_input',
      request: null,
      additions: candidate.additions.map(validateAddition),
    };
  }

  throw new Error('INTENT_COMPILATION_INVALID_STATUS');
}

function validateAddition(value: unknown): PropertySearchAddition {
  if (!value || typeof value !== 'object') throw new Error('INTENT_ADDITION_INVALID');
  const item = value as Record<string, unknown>;
  const field = typeof item.field === 'string' ? item.field.trim() : '';
  const question = typeof item.question === 'string' ? item.question.trim() : '';
  const reason = item.reason;
  if (!field || !question || !['missing','ambiguous','unsupported'].includes(String(reason))) {
    throw new Error('INTENT_ADDITION_INVALID');
  }
  const options = Array.isArray(item.options)
    ? item.options.map((option) => {
        const row = option as Record<string, unknown>;
        const label = typeof row?.label === 'string' ? row.label.trim() : '';
        const optionValue = typeof row?.value === 'string' ? row.value.trim() : '';
        if (!label || !optionValue) throw new Error('INTENT_ADDITION_OPTION_INVALID');
        return { label, value: optionValue };
      })
    : [];
  return { field, question, reason: reason as PropertySearchAddition['reason'], options };
}
