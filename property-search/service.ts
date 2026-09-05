import { GeminiPropertySearchCompiler } from './gemini-compiler.js';
import { ImotClient } from './imot-client-live.js';
import { ImotTaxonomyResolver } from './imot-taxonomy.js';
import { PropertySearchStore } from './store.js';
import type { PropertySearchRequest } from './types.js';

export class PropertySearchService {
  readonly store: PropertySearchStore;
  readonly compiler: GeminiPropertySearchCompiler;
  readonly client: ImotClient;

  constructor(options?: {
    dbPath?: string;
    geminiApiKey?: string;
    geminiModel?: string;
  }) {
    const key = options?.geminiApiKey || process.env.GEMINI_API_KEY || '';
    const taxonomy = new ImotTaxonomyResolver();
    this.store = new PropertySearchStore(options?.dbPath);
    this.compiler = new GeminiPropertySearchCompiler({
      apiKey: key,
      model: options?.geminiModel || process.env.GEMINI_MODEL || undefined,
      nomenclatureProvider: () => taxonomy.getGeminiNomenclature(),
    });
    this.client = new ImotClient(this.store);
  }

  async createSearch(ownerKey: string, input: { text: string; title?: string }) {
    const owner = requireOwner(ownerKey);
    const compilation = await this.compiler.compile(input.text);
    if (compilation.status === 'needs_input') {
      return {
        needsInput: true as const,
        additions: compilation.additions,
        search: null,
        results: [],
      };
    }

    const request = compilation.request;
    const title = input.title?.trim() || this.defaultTitle(request);
    const saved = this.store.createSearch({
      ownerKey: owner,
      title,
      originalText: input.text,
      request,
    });
    const run = await this.refreshSearch(owner, saved.id);
    return { needsInput: false as const, additions: [], search: this.store.getSearch(owner, saved.id), ...run };
  }

  async addCriterion(ownerKey: string, searchId: string, text: string) {
    const owner = requireOwner(ownerKey);
    const current = this.requireSearch(owner, searchId);
    const compilation = await this.compiler.compile(text, current.request);
    if (compilation.status === 'needs_input') {
      return {
        needsInput: true as const,
        additions: compilation.additions,
        search: current,
        results: this.store.listResults(searchId),
      };
    }

    const request = compilation.request;
    const mergedText = `${current.originalText}\n+ ${text}`;
    this.store.updateSearchRequest(owner, searchId, mergedText, request);
    const run = await this.refreshSearch(owner, searchId);
    return { needsInput: false as const, additions: [], search: this.store.getSearch(owner, searchId), ...run };
  }

  async refreshSearch(ownerKey: string, searchId: string) {
    const owner = requireOwner(ownerKey);
    const search = this.requireSearch(owner, searchId);
    if (search.status !== 'active') throw new Error('SEARCH_NOT_ACTIVE');
    const runId = this.store.startRun(searchId);
    try {
      // Only a READY Gemini request enters ImotClient, unchanged 1:1.
      const result = await this.client.search(search.request);
      const delta = this.store.reconcile(searchId, result.listings);
      this.store.finishRun(runId, {
        result: 'SUCCESS',
        pagesFetched: result.stats.pagesFetched,
        listingsFound: result.listings.length,
        newListings: delta.newListings,
        changedListings: delta.changedListings,
      });
      return {
        source: 'imot.bg' as const,
        request: search.request,
        stats: result.stats,
        delta,
        results: this.store.listResults(searchId),
      };
    } catch (error) {
      this.store.finishRun(runId, {
        result: 'FAILED',
        errorCode: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
      });
      throw error;
    }
  }

  async refreshAllActive() {
    const searches = this.store.listActiveSearches();
    const output: Array<{ searchId: string; ownerKey: string; ok: boolean; error?: string }> = [];
    for (const search of searches) {
      try {
        await this.refreshSearch(search.ownerKey, search.id);
        output.push({ searchId: search.id, ownerKey: search.ownerKey, ok: true });
      } catch (error) {
        output.push({
          searchId: search.id,
          ownerKey: search.ownerKey,
          ok: false,
          error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
        });
      }
    }
    return output;
  }

  getSearch(ownerKey: string, searchId: string) {
    return this.requireSearch(requireOwner(ownerKey), searchId);
  }

  listResults(ownerKey: string, searchId: string) {
    this.requireSearch(requireOwner(ownerKey), searchId);
    return this.store.listResults(searchId);
  }

  setResultState(ownerKey: string, searchId: string, listingId: string, state: 'SEEN' | 'SAVED' | 'DISMISSED') {
    this.requireSearch(requireOwner(ownerKey), searchId);
    this.store.setMatchState(searchId, listingId, state);
    return this.store.listResults(searchId);
  }

  setSearchStatus(ownerKey: string, searchId: string, status: 'active' | 'paused' | 'archived') {
    const owner = requireOwner(ownerKey);
    this.requireSearch(owner, searchId);
    this.store.setSearchStatus(owner, searchId, status);
    return this.store.getSearch(owner, searchId);
  }

  private requireSearch(ownerKey: string, id: string) {
    const found = this.store.getSearch(ownerKey, id);
    if (!found) throw new Error('SEARCH_NOT_FOUND');
    return found;
  }

  private defaultTitle(request: PropertySearchRequest) {
    const type = request.propertyTypes[0] || 'Имот';
    const city = request.location.city || request.location.district || '';
    return `${type} ${city}`.trim();
  }
}

function requireOwner(value: string) {
  const owner = String(value || '').trim();
  if (!owner || owner.length > 256) throw new Error('OWNER_REQUIRED');
  return owner;
}
