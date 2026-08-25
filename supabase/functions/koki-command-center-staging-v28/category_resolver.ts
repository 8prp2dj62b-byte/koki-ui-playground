export type TaxonomyCategory = {
  id: string | number;
  label?: string;
  path?: string;
  is_leaf?: boolean;
};

export type OlxSuggestion = {
  id: string | number;
  name?: string;
  path?: Array<{ id?: string | number; name?: string }>;
};

export function resolveOlxCategorySuggestion(
  suggestions: unknown,
  taxonomy: TaxonomyCategory[],
) {
  const rows = Array.isArray(suggestions) ? suggestions as OlxSuggestion[] : [];
  const byId = new Map(taxonomy.map((row) => [String(row.id), row]));
  const seen = new Set<string>();
  const validLeaves: TaxonomyCategory[] = [];

  for (const suggestion of rows) {
    const id = String(suggestion?.id ?? '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const category = byId.get(id);
    if (category?.is_leaf === true) validLeaves.push(category);
  }

  if (validLeaves.length === 1) {
    return {
      authority: 'OLX_CATEGORY_SUGGESTION_V1' as const,
      resolved: true,
      category: validLeaves[0],
      validLeaves,
      fallbackReason: null,
    };
  }

  return {
    authority: 'GEMINI_FULL_TAXONOMY_V1' as const,
    resolved: false,
    category: null,
    validLeaves,
    fallbackReason: validLeaves.length === 0
      ? 'OLX_SUGGESTION_NO_VALID_LEAF'
      : 'OLX_SUGGESTION_AMBIGUOUS',
  };
}
