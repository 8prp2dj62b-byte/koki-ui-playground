import { GeminiPropertySearchCompiler } from './gemini-compiler.js';
import { ImotClient } from './imot-client.js';
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
    this.store = new PropertySearchStore(options?.dbPath);
    this.compiler = new GeminiPropertySearchCompiler({
      apiKey: key,
      model: options?.geminiModel || process.env.GEMINI_MODEL || undefined,
    });
    this.client = new ImotClient(this.store);
  }

  async createSearch(input: { text: string; title?: string }) {
    const request = await this.compiler.compile(input.text);
    const title = input.title?.trim() || this.defaultTitle(request);
    const saved = this.store.createSearch({
      title,
      originalText: input.text,
      request,
    });
    const run = await this.refreshSearch(saved.id);
    return { search: this.store.getSearch(saved.id), ...run };
  }

  async addCriterion(searchId: string, text: string) {
    const current = this.requireSearch(searchId);
    const request = await this.compiler.compile(text, current.request);
    const mergedText = `${current.originalText}\n+ ${text}`;
    this.store.updateSearchRequest(searchId, mergedText, request);
    const run = await this.refreshSearch(searchId);
    return { search: this.store.getSearch(searchId), ...run };
  }

  async refreshSearch(searchId: string) {
    const search = this.requireSearch(searchId);
    if (search.status !== 'active') throw new Error('SEARCH_NOT_ACTIVE');
    const runId = this.store.startRun(searchId);
    try {
      // Critical architecture rule: saved Gemini JSON enters ImotClient 1:1.
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
    const output: Array<{ searchId: string; ok: boolean; error?: string }> = [];
    for (const search of searches) {
      try {
        await this.refreshSearch(search.id);
        output.push({ searchId: search.id, ok: true });
      } catch (error) {
        output.push({
          searchId: search.id,
          ok: false,
          error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
        });
      }
    }
    return output;
  }

  getSearch(searchId: string) {
    return this.requireSearch(searchId);
  }

  listResults(searchId: string) {
    this.requireSearch(searchId);
    return this.store.listResults(searchId);
  }

  setResultState(searchId: string, listingId: string, state: 'SEEN' | 'SAVED' | 'DISMISSED') {
    this.requireSearch(searchId);
    this.store.setMatchState(searchId, listingId, state);
    return this.store.listResults(searchId);
  }

  setSearchStatus(searchId: string, status: 'active' | 'paused' | 'archived') {
    this.requireSearch(searchId);
    this.store.setSearchStatus(searchId, status);
    return this.store.getSearch(searchId);
  }

  private requireSearch(id: string) {
    const found = this.store.getSearch(id);
    if (!found) throw new Error('SEARCH_NOT_FOUND');
    return found;
  }

  private defaultTitle(request: PropertySearchRequest) {
    const type = request.propertyTypes[0] || 'Имот';
    const city = request.location.city || '';
    return `${type} ${city}`.trim();
  }
}
