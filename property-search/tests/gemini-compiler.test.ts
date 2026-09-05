import test from 'node:test';
import assert from 'node:assert/strict';
import { GeminiPropertySearchCompiler } from '../gemini-compiler.js';
import type { ImotGeminiNomenclature } from '../imot-taxonomy.js';

const nomenclature: ImotGeminiNomenclature = {
  source: 'imot.bg',
  transactions: [
    { requestValue: 'sale', sourceRoute: 'prodazhbi' },
    { requestValue: 'rent', sourceRoute: 'naemi' },
  ],
  propertyTypes: [
    { requestValue: 'house', sourceSlug: 'kashta' },
    { requestValue: '3-room', sourceSlug: 'tristaen' },
  ],
  locationRoutes: {
    sale: ['grad-sliven', 'oblast-sliven', 'oblast-blagoevgrad/gr-bansko'],
    rent: ['grad-sliven', 'oblast-sliven', 'oblast-blagoevgrad/gr-bansko'],
  },
  formControls: {
    sale: [{ kind: 'select', name: 'construction', label: 'Строителство', options: [{ value: 'brick', label: 'Тухла' }] }],
    rent: [],
  },
};

function geminiResponse(value: unknown) {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

test('every Gemini call contains the complete supplied imot.bg nomenclature', async () => {
  let sentPrompt = '';
  const compiler = new GeminiPropertySearchCompiler({
    apiKey: 'test-key',
    nomenclatureProvider: async () => nomenclature,
    fetchImpl: async (_input, init) => {
      const body = JSON.parse(String(init?.body || '{}'));
      sentPrompt = body.contents?.[0]?.parts?.[0]?.text || '';
      return geminiResponse({
        status: 'ready',
        request: {
          operation: 'search_properties',
          transaction: 'sale',
          propertyTypes: ['house'],
          location: { city: 'Сливен', neighborhoods: [] },
          requiredFeatures: [],
          preferredFeatures: [],
          excludedFeatures: [],
          freeTextConstraints: [],
        },
        additions: [],
      });
    },
  });

  const result = await compiler.compile('Къща в Сливен за продажба');
  assert.equal(result.status, 'ready');
  assert.match(sentPrompt, /IMOT_NOMENCLATURE:/);
  assert.match(sentPrompt, /grad-sliven/);
  assert.match(sentPrompt, /oblast-blagoevgrad\/gr-bansko/);
  assert.match(sentPrompt, /Строителство/);
});

test('Gemini can stop execution and return structured additions when mapping is uncertain', async () => {
  const compiler = new GeminiPropertySearchCompiler({
    apiKey: 'test-key',
    nomenclatureProvider: async () => nomenclature,
    fetchImpl: async () => geminiResponse({
      status: 'needs_input',
      request: null,
      additions: [{
        field: 'location',
        reason: 'ambiguous',
        question: 'Имаш предвид град Сливен или област Сливен?',
        options: [
          { label: 'град Сливен', value: 'град Сливен' },
          { label: 'област Сливен', value: 'област Сливен' },
        ],
      }],
    }),
  });

  const result = await compiler.compile('Къща Сливен');
  assert.equal(result.status, 'needs_input');
  if (result.status === 'needs_input') {
    assert.equal(result.additions[0].reason, 'ambiguous');
    assert.equal(result.additions[0].options.length, 2);
  }
});
