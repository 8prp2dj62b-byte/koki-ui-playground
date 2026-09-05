(() => {
  const API = window.KOKI_PROPERTY_SEARCH_API_BASE || '/api/property-search';
  let currentSearchId = null;

  function boot() {
    const buy = document.getElementById('buy');
    if (!buy || typeof go !== 'function' || !Array.isArray(screens) || !screenMap) return false;
    if (document.getElementById('kokiPropertySearchEntry')) return true;

    installStyles();
    installBuyEntry(buy);
    installSearchScreen(buy);
    return true;
  }

  function installBuyEntry(buy) {
    const workspace = buy.querySelector('.workspace');
    const hero = workspace?.querySelector('.hero');
    if (!workspace || !hero) return;
    const entry = document.createElement('section');
    entry.id = 'kokiPropertySearchEntry';
    entry.className = 'panel kps-entry';
    entry.innerHTML = `
      <div class="kps-entry-icon" aria-hidden="true">⌂</div>
      <div class="kps-entry-copy">
        <h3>Търси имот в imot.bg</h3>
        <p>Опиши какво търсиш. Gemini превежда текста само до JSON заявка; резултатите са директно от imot.bg.</p>
      </div>
      <button class="btn primary" type="button" data-kps-open>Търси имот</button>`;
    hero.insertAdjacentElement('afterend', entry);
    entry.querySelector('[data-kps-open]').addEventListener('click', () => go('property-search'));
  }

  function installSearchScreen(buy) {
    const screen = buy.cloneNode(true);
    screen.id = 'property-search';
    screen.classList.remove('on');
    screen.querySelectorAll('#kokiPropertySearchEntry').forEach(x => x.remove());
    const workspace = screen.querySelector('.workspace');
    workspace.innerHTML = `
      <button class="back" type="button" data-go="buy">← Купува</button>
      <section class="hero kps-hero">
        <div>
          <div class="eyebrow">Property search</div>
          <h1>Търся имот</h1>
          <p>AI разбира критериите. ImotClient търси. Коки показва само реални обяви.</p>
        </div>
      </section>
      <section class="panel kps-create" data-kps-create>
        <div class="field">
          <label for="kpsQuery">Какво търсиш?</label>
          <textarea id="kpsQuery" class="control textarea" placeholder="Например: 3-стаен в Банско до 140 000 €, минимум 80 м², без първи етаж"></textarea>
          <span class="help">Gemini не търси обяви и не генерира данни. Изходът му е JSON input към ImotClient 1:1.</span>
        </div>
        <div class="actions" style="margin-top:16px">
          <button class="btn primary" type="button" data-kps-search>Търси в imot.bg</button>
        </div>
        <div class="kps-status" role="status" aria-live="polite" data-kps-status></div>
      </section>
      <section class="hidden" data-kps-active>
        <div class="kps-search-head">
          <div>
            <div class="eyebrow">Активно търсене</div>
            <h2 data-kps-title>Търсене</h2>
          </div>
          <div class="actions">
            <button class="btn" type="button" data-kps-refresh>Обнови</button>
          </div>
        </div>
        <div class="chips kps-criteria" data-kps-criteria></div>
        <div class="kps-add-row">
          <input class="control" data-kps-criterion placeholder="+ Добави критерий, напр. задължително с гараж">
          <button class="btn" type="button" data-kps-add>+ Добави</button>
        </div>
        <div class="kps-status" role="status" aria-live="polite" data-kps-active-status></div>
        <div class="kps-grid" data-kps-grid></div>
        <div class="kps-empty hidden" data-kps-empty>Няма реални обяви, които отговарят на текущите критерии.</div>
      </section>`;

    document.querySelector('.app')?.appendChild(screen);
    screens.push(screen);
    screenMap['property-search'] = 'buy';
    bindScreen(screen);
  }

  function bindScreen(screen) {
    const query = screen.querySelector('#kpsQuery');
    const createBtn = screen.querySelector('[data-kps-search]');
    const createStatus = screen.querySelector('[data-kps-status]');
    const active = screen.querySelector('[data-kps-active]');
    const create = screen.querySelector('[data-kps-create]');
    const activeStatus = screen.querySelector('[data-kps-active-status]');
    const criterion = screen.querySelector('[data-kps-criterion]');

    createBtn.addEventListener('click', async () => {
      const text = query.value.trim();
      if (!text) return setStatus(createStatus, 'Опиши какво търсиш.', true);
      toggleBusy(createBtn, true, 'Търся…');
      setStatus(createStatus, 'Gemini компилира критериите към JSON…');
      try {
        const data = await api('/searches', { method: 'POST', body: { text } });
        currentSearchId = data.search.id;
        create.classList.add('hidden');
        active.classList.remove('hidden');
        renderSearch(screen, data.search, data.results || []);
        setStatus(activeStatus, `Обновено от imot.bg · ${data.results?.length || 0} реални обяви`);
      } catch (error) {
        setStatus(createStatus, friendlyError(error), true);
      } finally {
        toggleBusy(createBtn, false, 'Търси в imot.bg');
      }
    });

    screen.querySelector('[data-kps-add]').addEventListener('click', async () => {
      if (!currentSearchId) return;
      const text = criterion.value.trim();
      if (!text) return;
      const btn = screen.querySelector('[data-kps-add]');
      toggleBusy(btn, true, 'Добавям…');
      setStatus(activeStatus, 'Обновявам JSON критериите и търся наново…');
      try {
        const data = await api(`/searches/${encodeURIComponent(currentSearchId)}/criteria`, { method: 'POST', body: { text } });
        criterion.value = '';
        renderSearch(screen, data.search, data.results || []);
        setStatus(activeStatus, `Критерият е добавен · ${data.results?.length || 0} реални обяви`);
      } catch (error) {
        setStatus(activeStatus, friendlyError(error), true);
      } finally {
        toggleBusy(btn, false, '+ Добави');
      }
    });

    criterion.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        screen.querySelector('[data-kps-add]').click();
      }
    });

    screen.querySelector('[data-kps-refresh]').addEventListener('click', async e => {
      if (!currentSearchId) return;
      const btn = e.currentTarget;
      toggleBusy(btn, true, 'Обновявам…');
      try {
        const data = await api(`/searches/${encodeURIComponent(currentSearchId)}/refresh`, { method: 'POST' });
        renderResults(screen, data.results || []);
        setStatus(activeStatus, `Обновено от imot.bg · ${data.delta?.newListings || 0} нови`);
      } catch (error) {
        setStatus(activeStatus, friendlyError(error), true);
      } finally {
        toggleBusy(btn, false, 'Обнови');
      }
    });
  }

  function renderSearch(screen, search, results) {
    screen.querySelector('[data-kps-title]').textContent = search.title || 'Търсене';
    renderCriteria(screen.querySelector('[data-kps-criteria]'), search.request);
    renderResults(screen, results);
  }

  function renderCriteria(host, request) {
    host.replaceChildren();
    const criteria = [];
    if (request.transaction) criteria.push(request.transaction === 'sale' ? 'Продажба' : 'Наем');
    for (const type of request.propertyTypes || []) criteria.push(type);
    if (request.location?.city) criteria.push(request.location.city);
    if (request.price?.min != null) criteria.push(`≥ ${eur(request.price.min)}`);
    if (request.price?.max != null) criteria.push(`≤ ${eur(request.price.max)}`);
    if (request.area?.min != null) criteria.push(`≥ ${request.area.min} м²`);
    if (request.area?.max != null) criteria.push(`≤ ${request.area.max} м²`);
    for (const floor of request.floor?.exclude || []) criteria.push(`без ет. ${floor}`);
    for (const x of request.requiredFeatures || []) criteria.push(`✓ ${x}`);
    for (const x of request.preferredFeatures || []) criteria.push(`предпочитам: ${x}`);
    for (const x of request.excludedFeatures || []) criteria.push(`без: ${x}`);
    for (const x of request.freeTextConstraints || []) criteria.push(x);
    for (const text of criteria) {
      const chip = document.createElement('span');
      chip.className = 'chip on';
      chip.textContent = text;
      host.appendChild(chip);
    }
  }

  function renderResults(screen, rows) {
    const grid = screen.querySelector('[data-kps-grid]');
    const empty = screen.querySelector('[data-kps-empty]');
    grid.replaceChildren();
    empty.classList.toggle('hidden', rows.length !== 0);
    for (const row of rows) grid.appendChild(listingCard(screen, row));
  }

  function listingCard(screen, row) {
    const l = row.listing;
    const card = document.createElement('article');
    card.className = 'kps-card';

    const media = document.createElement('div');
    media.className = 'kps-media';
    if (l.thumbnailUrl) {
      const img = document.createElement('img');
      img.src = l.thumbnailUrl;
      img.alt = '';
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      media.appendChild(img);
    } else {
      const fallback = document.createElement('span');
      fallback.textContent = '⌂';
      media.appendChild(fallback);
    }
    const state = document.createElement('span');
    state.className = `kps-state kps-state-${String(row.state).toLowerCase()}`;
    state.textContent = stateLabel(row.state);
    media.appendChild(state);

    const body = document.createElement('div');
    body.className = 'kps-card-body';
    const price = document.createElement('div');
    price.className = 'kps-price';
    price.textContent = l.price != null ? eur(l.price) : 'Цена не е посочена';
    const meta = document.createElement('div');
    meta.className = 'kps-meta';
    meta.textContent = [
      l.areaM2 != null ? `${l.areaM2} м²` : null,
      l.pricePerM2 != null ? `${eur(l.pricePerM2)}/м²` : null,
      l.floor != null ? `ет. ${l.floor}` : null,
    ].filter(Boolean).join(' · ') || 'Няма допълнителни структурирани данни';
    const title = document.createElement('h3');
    title.textContent = l.title || 'Обява в imot.bg';
    const loc = document.createElement('p');
    loc.className = 'kps-location';
    loc.textContent = l.locationText || 'Локацията не е посочена';
    body.append(price, meta, title, loc);

    const actions = document.createElement('div');
    actions.className = 'kps-actions';
    if (l.contact?.phone) actions.appendChild(linkButton(`tel:${safeTel(l.contact.phone)}`, '☎ Обади се'));
    if (l.contact?.inquiryUrl) actions.appendChild(linkButton(l.contact.inquiryUrl, '✉ Контакт', true));
    actions.appendChild(linkButton(l.canonicalUrl, '↗ imot.bg', true));

    const save = document.createElement('button');
    save.className = 'btn';
    save.type = 'button';
    save.textContent = row.state === 'SAVED' ? 'Запазено' : 'Запази';
    save.disabled = row.state === 'SAVED';
    save.addEventListener('click', () => changeState(screen, l.listingId, 'SAVED'));
    actions.appendChild(save);

    const dismiss = document.createElement('button');
    dismiss.className = 'btn';
    dismiss.type = 'button';
    dismiss.textContent = 'Не ме интересува';
    dismiss.addEventListener('click', () => changeState(screen, l.listingId, 'DISMISSED'));
    actions.appendChild(dismiss);

    card.append(media, body, actions);
    return card;
  }

  async function changeState(screen, listingId, state) {
    if (!currentSearchId) return;
    try {
      const data = await api(`/searches/${encodeURIComponent(currentSearchId)}/results/${encodeURIComponent(listingId)}`, {
        method: 'PATCH', body: { state }
      });
      renderResults(screen, data.results || []);
    } catch (error) {
      setStatus(screen.querySelector('[data-kps-active-status]'), friendlyError(error), true);
    }
  }

  function linkButton(href, label, external = false) {
    const a = document.createElement('a');
    a.className = 'btn';
    a.href = href;
    a.textContent = label;
    if (external) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    return a;
  }

  async function api(path, options = {}) {
    const hostHeaders = typeof window.KOKI_PROPERTY_SEARCH_AUTH_HEADERS === 'function'
      ? await window.KOKI_PROPERTY_SEARCH_AUTH_HEADERS()
      : {};
    const response = await fetch(`${API}${path}`, {
      method: options.method || 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...hostHeaders,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(60_000),
    });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP_${response.status}`);
    return data;
  }

  function setStatus(el, text, isError = false) {
    el.textContent = text || '';
    el.classList.toggle('error', isError);
  }

  function toggleBusy(btn, busy, text) {
    btn.disabled = busy;
    btn.textContent = text;
  }

  function stateLabel(state) {
    return ({ NEW: 'Нова', SEEN: 'Видяна', SAVED: 'Запазена', INACTIVE: 'Неактивна' })[state] || state;
  }

  function eur(value) {
    return new Intl.NumberFormat('bg-BG', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
  }

  function safeTel(phone) {
    return String(phone).replace(/[^+0-9]/g, '');
  }

  function friendlyError(error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
    if (code.startsWith('IMOT_TAXONOMY_RESOLUTION_FAILED')) return 'Тази локация още не е налична в ImotClient taxonomy.';
    if (code === 'IMOT_RATE_LIMITED') return 'imot.bg временно ограничава заявките. Опитай по-късно.';
    if (code.startsWith('GEMINI_') || code.startsWith('INTENT_')) return 'Не успях да преведа критериите към валиден JSON.';
    return `Търсенето не завърши: ${code}`;
  }

  function installStyles() {
    if (document.getElementById('kokiPropertySearchCss')) return;
    const style = document.createElement('style');
    style.id = 'kokiPropertySearchCss';
    style.textContent = `
      .kps-entry{display:grid;grid-template-columns:52px minmax(0,1fr) auto;gap:16px;align-items:center;margin:-12px 0 24px}
      .kps-entry-icon{width:52px;height:52px;border-radius:12px;background:color-mix(in srgb,var(--primary) 10%,var(--surface));display:grid;place-items:center;font-size:24px;color:var(--primary)}
      .kps-entry-copy p{margin:4px 0 0;color:var(--ink3);font-size:12px;line-height:17px}
      .kps-create{max-width:820px}.kps-status{min-height:20px;margin-top:10px;color:var(--ink3);font-size:12px}.kps-status.error{color:var(--critical)}
      .kps-search-head{display:flex;align-items:end;gap:16px;margin-bottom:14px}.kps-search-head>div:first-child{flex:1}.kps-criteria{margin-bottom:12px}
      .kps-add-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin:12px 0 6px}
      .kps-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:18px}.kps-card{min-width:0;background:var(--surface);border:1px solid var(--border);border-radius:var(--r3);overflow:hidden;display:flex;flex-direction:column}
      .kps-media{height:190px;background:var(--subtle);display:grid;place-items:center;position:relative;font-size:40px;color:var(--ink3)}.kps-media img{width:100%;height:100%;object-fit:cover}
      .kps-state{position:absolute;top:10px;left:10px;padding:5px 8px;border-radius:999px;background:var(--surface);box-shadow:var(--shadow-floating);font-size:10px;font-weight:800;text-transform:uppercase}.kps-state-new{color:var(--primary)}.kps-state-saved{color:var(--positive)}
      .kps-card-body{padding:14px 14px 8px}.kps-price{font-size:22px;line-height:28px;font-weight:760}.kps-meta{margin-top:3px;color:var(--ink3);font-size:11px}.kps-card h3{font-size:14px;line-height:19px;margin:12px 0 0}.kps-location{font-size:12px;color:var(--ink3);margin:5px 0 0}
      .kps-actions{display:flex;gap:7px;flex-wrap:wrap;padding:10px 14px 14px;margin-top:auto}.kps-actions .btn{min-height:38px;padding-inline:10px;font-size:11px}.kps-empty{padding:28px 0;color:var(--ink3);font-size:14px}
      @media(max-width:1000px){.kps-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:720px){.kps-entry{grid-template-columns:44px minmax(0,1fr);margin-top:-8px}.kps-entry>.btn{grid-column:1/-1;width:100%}.kps-grid{grid-template-columns:1fr}.kps-add-row{grid-template-columns:1fr}.kps-add-row .btn{width:100%}.kps-search-head{align-items:start}.kps-media{height:220px}}
    `;
    document.head.appendChild(style);
  }

  let attempts = 0;
  const timer = setInterval(() => {
    attempts++;
    if (boot() || attempts > 60) clearInterval(timer);
  }, 250);
})();
