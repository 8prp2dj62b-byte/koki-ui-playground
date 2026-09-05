import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import type { ListingCache } from './imot-client.js';
import type { PropertyListing, PropertySearchRequest } from './types.js';

export type MatchState = 'NEW' | 'SEEN' | 'SAVED' | 'DISMISSED' | 'INACTIVE';

export interface SavedSearchRow {
  id: string;
  title: string;
  originalText: string;
  request: PropertySearchRequest;
  status: 'active' | 'paused' | 'archived';
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
}

export function listingSourceFingerprint(listing: PropertyListing) {
  const stableSourceFacts = {
    source: listing.source,
    listingId: listing.listingId,
    canonicalUrl: listing.canonicalUrl,
    title: listing.title,
    price: listing.price,
    currency: listing.currency,
    areaM2: listing.areaM2,
    pricePerM2: listing.pricePerM2,
    locationText: listing.locationText,
    thumbnailUrl: listing.thumbnailUrl,
    description: listing.description,
    propertyType: listing.propertyType,
    floor: listing.floor,
    totalFloors: listing.totalFloors,
    constructionType: listing.constructionType,
    constructionYear: listing.constructionYear,
    seller: listing.seller,
    contact: listing.contact,
    imageUrls: listing.imageUrls,
    publishedAt: listing.publishedAt,
  };
  return crypto.createHash('sha256').update(JSON.stringify(stableSourceFacts)).digest('hex');
}

export class PropertySearchStore implements ListingCache {
  private readonly db: Database.Database;

  constructor(path = process.env.KOKI_PROPERTY_DB || './data/koki-property-search.sqlite') {
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS property_saved_searches (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        original_text TEXT NOT NULL,
        request_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('active','paused','archived')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_run_at TEXT
      );

      CREATE TABLE IF NOT EXISTS property_listings (
        source_listing_id TEXT PRIMARY KEY,
        canonical_url TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS property_search_matches (
        search_id TEXT NOT NULL REFERENCES property_saved_searches(id) ON DELETE CASCADE,
        source_listing_id TEXT NOT NULL REFERENCES property_listings(source_listing_id) ON DELETE CASCADE,
        state TEXT NOT NULL CHECK(state IN ('NEW','SEEN','SAVED','DISMISSED','INACTIVE')),
        first_matched_at TEXT NOT NULL,
        last_matched_at TEXT NOT NULL,
        PRIMARY KEY(search_id, source_listing_id)
      );

      CREATE TABLE IF NOT EXISTS property_search_runs (
        id TEXT PRIMARY KEY,
        search_id TEXT NOT NULL REFERENCES property_saved_searches(id) ON DELETE CASCADE,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        result TEXT NOT NULL CHECK(result IN ('RUNNING','SUCCESS','PARTIAL','FAILED')),
        pages_fetched INTEGER NOT NULL DEFAULT 0,
        listings_found INTEGER NOT NULL DEFAULT 0,
        new_listings INTEGER NOT NULL DEFAULT 0,
        changed_listings INTEGER NOT NULL DEFAULT 0,
        error_code TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_property_search_status
        ON property_saved_searches(status);
      CREATE INDEX IF NOT EXISTS idx_property_match_search_state
        ON property_search_matches(search_id, state);
    `);
  }

  async get(listingId: string): Promise<PropertyListing | null> {
    const row = this.db.prepare(
      `SELECT payload_json FROM property_listings WHERE source_listing_id = ? AND status = 'active'`
    ).get(listingId) as { payload_json: string } | undefined;
    return row ? JSON.parse(row.payload_json) : null;
  }

  async put(listing: PropertyListing): Promise<void> {
    const now = new Date().toISOString();
    const payload = JSON.stringify(listing);
    const hash = listingSourceFingerprint(listing);
    this.db.prepare(`
      INSERT INTO property_listings (
        source_listing_id, canonical_url, payload_json, source_hash, status, first_seen_at, last_seen_at
      ) VALUES (?, ?, ?, ?, 'active', ?, ?)
      ON CONFLICT(source_listing_id) DO UPDATE SET
        canonical_url = excluded.canonical_url,
        payload_json = excluded.payload_json,
        source_hash = excluded.source_hash,
        status = 'active',
        last_seen_at = excluded.last_seen_at
    `).run(listing.listingId, listing.canonicalUrl, payload, hash, now, now);
  }

  createSearch(input: { title: string; originalText: string; request: PropertySearchRequest }) {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO property_saved_searches
        (id, title, original_text, request_json, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?)
    `).run(id, input.title, input.originalText, JSON.stringify(input.request), now, now);
    return this.getSearch(id)!;
  }

  getSearch(id: string): SavedSearchRow | null {
    const row = this.db.prepare(`
      SELECT id,title,original_text,request_json,status,created_at,updated_at,last_run_at
      FROM property_saved_searches WHERE id = ?
    `).get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      originalText: row.original_text,
      request: JSON.parse(row.request_json),
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastRunAt: row.last_run_at,
    };
  }

  updateSearchRequest(id: string, originalText: string, request: PropertySearchRequest) {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE property_saved_searches
      SET original_text = ?, request_json = ?, updated_at = ?
      WHERE id = ?
    `).run(originalText, JSON.stringify(request), now, id);
    return this.getSearch(id);
  }

  listActiveSearches() {
    const ids = this.db.prepare(`SELECT id FROM property_saved_searches WHERE status = 'active' ORDER BY created_at`).all() as { id: string }[];
    return ids.map(r => this.getSearch(r.id)!).filter(Boolean);
  }

  setSearchStatus(id: string, status: SavedSearchRow['status']) {
    this.db.prepare(`UPDATE property_saved_searches SET status=?,updated_at=? WHERE id=?`)
      .run(status, new Date().toISOString(), id);
  }

  startRun(searchId: string) {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO property_search_runs(id,search_id,started_at,result)
      VALUES(?,?,?,'RUNNING')
    `).run(id, searchId, new Date().toISOString());
    return id;
  }

  finishRun(runId: string, data: {
    result: 'SUCCESS' | 'PARTIAL' | 'FAILED';
    pagesFetched?: number;
    listingsFound?: number;
    newListings?: number;
    changedListings?: number;
    errorCode?: string | null;
  }) {
    this.db.prepare(`
      UPDATE property_search_runs SET
        finished_at=?, result=?, pages_fetched=?, listings_found=?, new_listings=?, changed_listings=?, error_code=?
      WHERE id=?
    `).run(
      new Date().toISOString(), data.result, data.pagesFetched ?? 0, data.listingsFound ?? 0,
      data.newListings ?? 0, data.changedListings ?? 0, data.errorCode ?? null, runId
    );
  }

  reconcile(searchId: string, listings: PropertyListing[]) {
    const now = new Date().toISOString();
    const seen = new Set(listings.map(l => l.listingId));
    let newListings = 0;
    let changedListings = 0;

    const tx = this.db.transaction(() => {
      for (const listing of listings) {
        const payload = JSON.stringify(listing);
        const hash = listingSourceFingerprint(listing);
        const previous = this.db.prepare(`SELECT source_hash FROM property_listings WHERE source_listing_id=?`).get(listing.listingId) as { source_hash: string } | undefined;
        if (!previous) newListings++;
        else if (previous.source_hash !== hash) changedListings++;

        this.db.prepare(`
          INSERT INTO property_listings(source_listing_id,canonical_url,payload_json,source_hash,status,first_seen_at,last_seen_at)
          VALUES(?,?,?,?, 'active',?,?)
          ON CONFLICT(source_listing_id) DO UPDATE SET
            canonical_url=excluded.canonical_url,
            payload_json=excluded.payload_json,
            source_hash=excluded.source_hash,
            status='active',
            last_seen_at=excluded.last_seen_at
        `).run(listing.listingId, listing.canonicalUrl, payload, hash, now, now);

        const existing = this.db.prepare(`
          SELECT state FROM property_search_matches WHERE search_id=? AND source_listing_id=?
        `).get(searchId, listing.listingId) as { state: MatchState } | undefined;

        if (!existing) {
          this.db.prepare(`
            INSERT INTO property_search_matches(search_id,source_listing_id,state,first_matched_at,last_matched_at)
            VALUES(?,?,'NEW',?,?)
          `).run(searchId, listing.listingId, now, now);
        } else {
          const state = existing.state === 'INACTIVE' ? 'NEW' : existing.state;
          this.db.prepare(`
            UPDATE property_search_matches SET state=?,last_matched_at=?
            WHERE search_id=? AND source_listing_id=?
          `).run(state, now, searchId, listing.listingId);
        }
      }

      const oldMatches = this.db.prepare(`
        SELECT source_listing_id,state FROM property_search_matches
        WHERE search_id=? AND state != 'DISMISSED'
      `).all(searchId) as { source_listing_id: string; state: MatchState }[];
      for (const old of oldMatches) {
        if (!seen.has(old.source_listing_id)) {
          this.db.prepare(`
            UPDATE property_search_matches SET state='INACTIVE',last_matched_at=?
            WHERE search_id=? AND source_listing_id=?
          `).run(now, searchId, old.source_listing_id);
        }
      }

      this.db.prepare(`UPDATE property_saved_searches SET last_run_at=?,updated_at=? WHERE id=?`)
        .run(now, now, searchId);
    });
    tx();
    return { newListings, changedListings };
  }

  listResults(searchId: string, includeInactive = false) {
    const rows = this.db.prepare(`
      SELECT m.state,l.payload_json,m.first_matched_at,m.last_matched_at
      FROM property_search_matches m
      JOIN property_listings l ON l.source_listing_id=m.source_listing_id
      WHERE m.search_id=?
        AND m.state != 'DISMISSED'
        ${includeInactive ? '' : `AND m.state != 'INACTIVE'`}
      ORDER BY CASE m.state WHEN 'NEW' THEN 0 WHEN 'SAVED' THEN 1 WHEN 'SEEN' THEN 2 ELSE 3 END,
               m.first_matched_at DESC
    `).all(searchId) as any[];
    return rows.map(row => ({
      state: row.state as MatchState,
      firstMatchedAt: row.first_matched_at,
      lastMatchedAt: row.last_matched_at,
      listing: JSON.parse(row.payload_json) as PropertyListing,
    }));
  }

  setMatchState(searchId: string, listingId: string, state: MatchState) {
    this.db.prepare(`
      UPDATE property_search_matches SET state=?,last_matched_at=?
      WHERE search_id=? AND source_listing_id=?
    `).run(state, new Date().toISOString(), searchId, listingId);
  }
}
