(() => {
  const API = window.KOKI_PROPERTY_SEARCH_API_BASE || '/api/property-search';
  let currentSearchId = null;

  function boot() {
    const buy = document.getElementById('buy');
    const workspace = buy?.parentElement;
    if (!buy || !workspace || document.getElementById('kokiPropertySearchEntry')) return false;

    installStyles();
    installBuyEntry(buy);
    installSearchScreen(workspace);
    return true;
  }

  function installBuyEntry(buy) {
    const hero = buy.querySelector('.hero');
    if (!hero) return;

    const entry = document.createElement('section');
    entry.id = 'kokiPropertySearchEntry';
    entry.className = 'surface kps-entry';

    const icon = document.createElement('div');
    icon.className = 'kps-entry-icon';
    icon.textContent = '⌂';

    const copy = document.createElement('div');
    copy.className = 'kps-entry-copy';
    const eyebrow = document.createElement('div');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = 'IMOT.BG SEARCH';
    const title = document.createElement('h2');
    title.textContent = 'Търси имот';
    const desc = document.createElement('p');
    desc.textContent = 'Опиши какво търсиш. Gemini превежда текста само до JSON заявка; обявите и контактите идват от imot.bg.';
    copy.append(eyebrow, title, desc);

    const button = document.createElement('button');
    button.className = 'primary';
    button.type = 'button';
    button.textContent = 'Търси в imot.bg';
    button.addEventListener('click', openPropertySearch);

    entry.append(icon, copy, button);
    hero.insertAdjacentElement('afterend', entry);
  }

  function installSearchScreen(workspace) {
    const screen = document.createElement('section');
    screen.id = 'property-search';
    screen.className = 'screen';
    screen.innerHTML = `
      <button class="back" type="button" data-kps-back>← Купува</button>
      <section class="hero kps-hero">
        <div>
          <div class="eyebrow">PROPERTY SEARCH · IMOT.BG</div>
          <h1>Търся имот</h1>
          <p>AI разбира критериите. Нашият ImotClient търси. Коки показва само реални source данни.</p>
        </div>
      </section>
      <section class="surface kps-create" data-kps-create>
        <div class="kps-block">
          <label class="kps-label" for="kpsQuery">Какво търсиш?</label>
          <textarea id="kpsQuery" class="kps-control kps-textarea" placeholder="Например: 3-стаен в Банско до 140 000 €, минимум 80 м², без първи етаж"></textarea>
          <div class="kps-help">Gemini не търси обяви и не генерира факти. Неговият JSON влиза 1:1 в ImotClient.</div>
        </div>
        <div class="kps-actions-row">
          <button class="primary" type="button" data-kps-search>Търси в imot.bg</button>
        </div>
        <div class="kps-status" role="status" aria-live="polite" data-kps-status></div>
      </section>
      <section class="kps-active kps-hidden" data-kps-active>
        <div class="kps-search-head">
          <div>
            <div class="eyebrow">АКТИВНО ТЪРСЕНЕ</div>
            <h2 data-kps-title>Търсене</h2>
          </div>
          <button class="secondary" type="button" data-kps-refresh>Обнови</button>
        </div>
        <div class="kps-criteria" data-kps-criteria></div>
        <div class="kps-add-row">
          <input class="kps-control" data-kps-criterion placeholder="+ Добави критерий, напр. задължително с гараж">
          <button class="secondary" type="button" data-kps-add>+ Добави</button>
        </div>
        <div class="kps-status" role="status" aria-live="polite" data-kps-active-status></div>
        <div class="kps-grid" data-kps-grid></div>
        <div class="kps-empty kps-hidden" data-kps-empty>Няма реални обяви, които отговарят на текущите критерии.</div>
      </section>`;

    workspace.appendChild(screen);
    bindScreen(screen);

    screen.querySelector('[data-kps-back]').addEventListener('click', () => {
      screen.classList.remove('on');
      if (typeof go === 'function') go('buy');
      else document.getElementById('buy')?.classList.add('on');
      markBuyNavigation();
    });

    // Existing navigation handlers were bound before this module loaded. Whenever the user
    // leaves through an existing KOKI navigation action, make sure our isolated screen closes.
    document.addEventListener('click', event => {
      const target = event.target.closest?.('[data-go]');
      if (target && target.dataset.go !== 'property-search') screen.classList.remove('on');
    }, true);
  }

  function openPropertySearch() {
    document.querySelectorAll('.screen.on').forEach(s => s.classList.remove('on'));
    document.getElementById('property-search')?.classList.add('on');
    markBuyNavigation();
    window.scrollTo(0, 0);
  }

  function markBuyNavigation() {
    document.querySelectorAll('.navbtn,.dockbtn').forEach(button => {
      button.classList.toggle('on', button.dataset.go === 'buy');
    });
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
      setStatus(createStatus, 'Gemini превежда критериите към JSON…');
      try {
        const data = await api('/searches', { method: 'POST', body: { text } });
        currentSearchId = data.search.id;
        create.classList.add('kps-hidden');
        active.classList.remove('kps-hidden');
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
      setStatus(activeStatus, 'Обновявам JSON критериите и търся отново…');
      try {
        const data = await api(`/searches/${encodeURIComponent(currentSearchId)}/criteria`, {
          method: 'POST', body: { text }
        });
        criterion.value = '';
        renderSearch(screen, data.search, data.results || []);
        setStatus(activeStatus, `Критерият е добавен · ${data.results?.length || 0} реални обяви`);
      } catch (error) {
        setStatus(activeStatus, friendlyError(error), true);
      } finally {
        toggleBusy(btn, false, '+ Добави');
      }
    });

    criterion.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        screen.querySelector('[data-kps-add]').click();
      }
    });

    screen.querySelector('[data-kps-refresh]').addEventListener('click', async event => {
      if (!currentSearchId) return;
      const btn = event.currentTarget;
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
    for (const value of request.requiredFeatures || []) criteria.push(`✓ ${value}`);
    for (const value of request.preferredFeatures || []) criteria.push(`предпочитам: ${value}`);
    for (const value of request.excludedFeatures || []) criteria.push(`без: ${value}`);
    for (const value of request.freeTextConstraints || []) criteria.push(value);

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
    empty.classList.toggle('kps-hidden', rows.length !== 0);
    for (const row of rows) grid.appendChild(listingCard(screen, row));
  }

  function listingCard(screen, row) {
    const listing = row.listing;
    const card = document.createElement('article');
    card.className = 'surface kps-card';

    const media = document.createElement('div');
    media.className = 'kps-media';
    if (listing.thumbnailUrl) {
      const img = document.createElement('img');
      img.src = listing.thumbnailUrl;
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
    price.textContent = listing.price != null ? eur(listing.price) : 'Цена не е посочена';

    const meta = document.createElement('div');
    meta.className = 'kps-meta';
    meta.textContent = [
      listing.areaM2 != null ? `${listing.areaM2} м²` : null,
      listing.pricePerM2 != null ? `${eur(listing.pricePerM2)}/м²` : null,
      listing.floor != null ? `ет. ${listing.floor}` : null,
    ].filter(Boolean).join(' · ') || 'Няма допълнителни структурирани данни';

    const title = document.createElement('h3');
    title.textContent = listing.title || 'Обява в imot.bg';

    const location = document.createElement('p');
    location.className = 'kps-location';
    location.textContent = listing.locationText || 'Локацията не е посочена';

    body.append(price, meta, title, location);

    const actions = document.createElement('div');
    actions.className = 'kps-actions';
    if (listing.contact?.phone) {
      actions.appendChild(linkButton(`tel:${safeTel(listing.contact.phone)}`, '☎ Обади се'));
    }
    if (listing.contact?.inquiryUrl) {
      actions.appendChild(linkButton(listing.contact.inquiryUrl, '✉ Контакт', true));
    }
    actions.appendChild(linkButton(listing.canonicalUrl, '↗ imot.bg', true));

    const save = document.createElement('button');
    save.className = 'secondary';
    save.type = 'button';
    save.textContent = row.state === 'SAVED' ? 'Запазено' : 'Запази';
    save.disabled = row.state === 'SAVED';
    save.addEventListener('click', () => changeState(screen, listing.listingId, 'SAVED'));

    const dismiss = document.createElement('button');
    dismiss.className = 'secondary';
    dismiss.type = 'button';
    dismiss.textContent = 'Не ме интересува';
    dismiss.addEventListener('click', () => changeState(screen, listing.listingId, 'DISMISSED'));

    actions.append(save, dismiss);
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
    const anchor = document.createElement('a');
    anchor.className = 'secondary kps-link-button';
    anchor.href = href;
    anchor.textContent = label;
    if (external) {
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
    }
    return anchor;
  }

  async function api(path, options = {}) {
    const authHeaders = typeof window.KOKI_PROPERTY_SEARCH_AUTH_HEADERS === 'function'
      ? await window.KOKI_PROPERTY_SEARCH_AUTH_HEADERS()
      : {};

    const response = await fetch(`${API}${path}`, {
      method: options.method || 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...authHeaders,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(60_000),
    });

    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP_${response.status}`);
    return data;
  }

  function setStatus(element, text, error = false) {
    element.textContent = text || '';
    element.classList.toggle('error', error);
  }

  function toggleBusy(button, busy, text) {
    button.disabled = busy;
    button.textContent = text;
  }

  function stateLabel(state) {
    return ({ NEW: 'Нова', SEEN: 'Видяна', SAVED: 'Запазена', INACTIVE: 'Неактивна' })[state] || state;
  }

  function eur(value) {
    return new Intl.NumberFormat('bg-BG', {
      style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
    }).format(value);
  }

  function safeTel(phone) {
    return String(phone).replace(/[^+0-9]/g, '');
  }

  function friendlyError(error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
    if (code.startsWith('IMOT_TAXONOMY_RESOLUTION_FAILED')) return 'Тази локация още не е налична в ImotClient taxonomy.';
    if (code === 'IMOT_RATE_LIMITED') return 'imot.bg временно ограничава заявките.';
    if (code.startsWith('GEMINI_') || code.startsWith('INTENT_')) return 'Не успях да преведа критериите към валиден JSON.';
    return `Търсенето не завърши: ${code}`;
  }

  function installStyles() {
    if (document.getElementById('kokiPropertySearchCss')) return;
    const style = document.createElement('style');
    style.id = 'kokiPropertySearchCss';
    style.textContent = `
      .kps-hidden{display:none!important}
      .kps-entry{display:grid;grid-template-columns:52px minmax(0,1fr) auto;gap:14px;align-items:center;padding:15px 17px;margin:-8px 0 16px}
      .kps-entry-icon{width:48px;height:48px;border-radius:15px;background:var(--strong);border:1px solid var(--line);display:grid;place-items:center;font-size:22px}
      .kps-entry-copy h2{margin:2px 0 0}.kps-entry-copy p{margin:5px 0 0;color:var(--muted);font-size:9px;line-height:1.5;max-width:760px}
      .kps-create{max-width:850px;padding:18px}.kps-block{display:grid;gap:7px}.kps-label{font-size:10px;font-weight:750}.kps-control{width:100%;border:1px solid var(--line);background:var(--strong);border-radius:13px;padding:11px 12px;outline:none}.kps-control:focus{border-color:color-mix(in srgb,var(--blue) 55%,var(--line));box-shadow:0 0 0 3px color-mix(in srgb,var(--blue) 12%,transparent)}
      .kps-textarea{min-height:120px;resize:vertical}.kps-help{color:var(--muted);font-size:8px;line-height:1.5}.kps-actions-row{display:flex;gap:8px;margin-top:12px}.kps-status{min-height:18px;margin-top:9px;color:var(--muted);font-size:9px}.kps-status.error{color:var(--red)}
      .kps-active{margin-top:5px}.kps-search-head{display:flex;align-items:end;gap:12px;margin-bottom:11px}.kps-search-head>div{flex:1}.kps-criteria{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}.kps-add-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;margin:10px 0 5px}
      .kps-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px;margin-top:15px}.kps-card{overflow:hidden;display:flex;flex-direction:column;min-width:0}.kps-media{height:190px;background:var(--strong);display:grid;place-items:center;position:relative;font-size:38px;color:var(--muted)}.kps-media img{width:100%;height:100%;object-fit:cover}.kps-state{position:absolute;left:9px;top:9px;padding:5px 7px;border-radius:999px;background:var(--strong);border:1px solid var(--line);font-size:7px;font-weight:800}.kps-state-new{color:var(--blue)}.kps-state-saved{color:var(--green)}
      .kps-card-body{padding:13px 13px 7px}.kps-price{font-size:20px;font-weight:800}.kps-meta{margin-top:4px;color:var(--muted);font-size:8px}.kps-card h3{font-size:11px;line-height:1.35;margin:10px 0 0}.kps-location{color:var(--muted);font-size:8px;margin:4px 0 0}.kps-actions{display:flex;gap:6px;flex-wrap:wrap;padding:9px 13px 13px;margin-top:auto}.kps-actions .secondary,.kps-link-button{font-size:8px;padding:8px 9px;text-decoration:none;display:inline-flex;align-items:center}.kps-empty{padding:24px 2px;color:var(--muted);font-size:10px}
      @media(max-width:1050px){.kps-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:900px){.kps-entry{grid-template-columns:44px minmax(0,1fr)}.kps-entry>.primary{grid-column:1/-1;width:100%}.kps-grid{grid-template-columns:1fr}.kps-add-row{grid-template-columns:1fr}.kps-add-row .secondary{width:100%}.kps-media{height:230px}}
    `;
    document.head.appendChild(style);
  }

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts++;
    if (boot() || attempts >= 40) window.clearInterval(timer);
  }, 250);
})();
