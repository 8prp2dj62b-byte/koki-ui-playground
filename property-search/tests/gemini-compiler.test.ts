import test from 'node:test';
import assert from 'node:assert/strict';
import { GeminiPropertySearchCompiler } from '../gemini-compiler.js';
import type { ImotGeminiNomenclature } from '../imot-taxonomy.js';

const nomenclature: ImotGeminiNomenclature = {
  source: 'imot.bg',
  capturedAt: '2026-09-05T06:00:00.000Z',
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
  navigation: {
    sale: [
      { label: 'град Сливен', path: '/obiavi/prodazhbi/grad-sliven' },
      { label: 'област Сливен', path: '/obiavi/prodazhbi/oblast-sliven' },
    ],
    rent: [
      { label: 'град Сливен', path: '/obiavi/naemi/grad-sliven' },
      { label: 'област Сливен', path: '/obiavi/naemi/oblast-sliven' },
    ],
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

  const result = await compiler.compile('Къща в град Сливен за продажба');
  assert.equal(result.status, 'ready');
  assert.match(sentPrompt, /IMOT_NOMENCLATURE:/);
  assert.match(sentPrompt, /grad-sliven/);
  assert.match(sentPrompt, /област Сливен/);
  assert.match(sentPrompt, /Строителство/);
  assert.match(sentPrompt, /Тухла/);
});

test('Gemini can stop execution and return structured additions when mapping is uncertain', async () => {
  const compiler = new GeminiPropertySearchCompiler({
    apiKey: 'test-key',
    nomenclatureProvider: async () => nomenclature,
    fetchImpl: async () => geminiResponse({
      status: 'needs_input',
      request: null,
      additions: [{
        field: 'location.scope',
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
    assert.deepEqual(result.additions[0].options.map(x => x.value), ['град Сливен', 'област Сливен']);
  }
});

test('READY output is rejected if Gemini invents a location outside the supplied nomenclature', async () => {
  const compiler = new GeminiPropertySearchCompiler({
    apiKey: 'test-key',
    nomenclatureProvider: async () => nomenclature,
    fetchImpl: async () => geminiResponse({
      status: 'ready',
      request: {
        operation: 'search_properties',
        transaction: 'sale',
        propertyTypes: ['house'],
        location: { city: 'Несъществуващ град', neighborhoods: [] },
        requiredFeatures: [],
        preferredFeatures: [],
        excludedFeatures: [],
        freeTextConstraints: [],
      },
      additions: [],
    }),
  });

  await assert.rejects(
    () => compiler.compile('Къща в несъществуващ град'),
    /INTENT_READY_LOCATION_NOT_IN_NOMENCLATURE/,
  );
});
