import assert from 'node:assert/strict';

function resolveOlxCategorySuggestion(suggestions, taxonomy) {
  const rows = Array.isArray(suggestions) ? suggestions : [];
  const byId = new Map(taxonomy.map((row) => [String(row.id), row]));
  const seen = new Set();
  const validLeaves = [];
  for (const suggestion of rows) {
    const id = String(suggestion?.id ?? '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const category = byId.get(id);
    if (category?.is_leaf === true) validLeaves.push(category);
  }
  if (validLeaves.length === 1) return {authority:'OLX_CATEGORY_SUGGESTION_V1',resolved:true,category:validLeaves[0],validLeaves,fallbackReason:null};
  return {authority:'GEMINI_FULL_TAXONOMY_V1',resolved:false,category:null,validLeaves,fallbackReason:validLeaves.length===0?'OLX_SUGGESTION_NO_VALID_LEAF':'OLX_SUGGESTION_AMBIGUOUS'};
}

const taxonomy = [
  {id:632,label:'Електроника',path:'Електроника',is_leaf:false},
  {id:276,label:'Телефони и таблети',path:'Електроника > Телефони и таблети',is_leaf:false},
  {id:454,label:'iPhone',path:'Електроника > Телефони и таблети > iPhone',is_leaf:true},
  {id:455,label:'Други смартфони',path:'Електроника > Телефони и таблети > Други смартфони',is_leaf:true},
];

const exact = resolveOlxCategorySuggestion([{id:'454',name:'iPhone'}], taxonomy);
assert.equal(exact.resolved, true);
assert.equal(String(exact.category.id), '454');
assert.equal(exact.authority, 'OLX_CATEGORY_SUGGESTION_V1');

const parentOnly = resolveOlxCategorySuggestion([{id:'276',name:'Телефони и таблети'}], taxonomy);
assert.equal(parentOnly.resolved, false);
assert.equal(parentOnly.fallbackReason, 'OLX_SUGGESTION_NO_VALID_LEAF');

const ambiguous = resolveOlxCategorySuggestion([{id:'454'},{id:'455'}], taxonomy);
assert.equal(ambiguous.resolved, false);
assert.equal(ambiguous.fallbackReason, 'OLX_SUGGESTION_AMBIGUOUS');

const duplicate = resolveOlxCategorySuggestion([{id:'454'},{id:454}], taxonomy);
assert.equal(duplicate.resolved, true);
assert.equal(duplicate.validLeaves.length, 1);

const unknown = resolveOlxCategorySuggestion([{id:'999999'}], taxonomy);
assert.equal(unknown.resolved, false);

console.log('ANT-94 OLX category resolver: 5/5 PASS');
