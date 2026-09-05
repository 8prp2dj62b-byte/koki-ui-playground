(() => {
  const API = window.KOKI_PROPERTY_SEARCH_API_BASE || '/api/property-search';
  let currentSearchId = null;
  let pendingCreateText = '';
  let pendingCriterionText = '';

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
    desc.textContent = 'Опиши какво търсиш. Gemini получава актуалната номенклатура на imot.bg и връща уточнения, ако не може да определи еднозначно критериите.';
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
          <p>AI разбира критериите спрямо текущата номенклатура. Ако нещо е неясно, Коки първо иска уточнение.</p>
        </div>
      </section>
      <section class="surface kps-create" data-kps-create>
        <div class="kps-block">
          <label class="kps-label" for="kpsQuery">Какво търсиш?</label>
          <textarea id="kpsQuery" class="kps-control kps-textarea" placeholder="Например: 3-стаен в Банско до 140 000 €, минимум 80 м², без първи етаж"></textarea>
          <div class="kps-help">Към Gemini се подава цялата актуална imot.bg номенклатура. Търсене стартира само при еднозначна READY заявка.</div>
        </div>
        <div class="kps-actions-row">
          <button class="primary" type="button" data-kps-search>Търси в imot.bg</button>
        </div>
        <div class="kps-status" role="status" aria-live="polite" data-kps-status></div>
        <div class="kps-additions kps-hidden" data-kps-create-additions></div>
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
        <div class="kps-additions kps-hidden" data-kps-active-additions></div>
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
    const createAdditions = screen.querySelector('[data-kps-create-additions]');
    const active = screen.querySelector('[data-kps-active]');
    const create = screen.querySelector('[data-kps-create]');
    const activeStatus = screen.querySelector('[data-kps-active-status]');
    const activeAdditions = screen.querySelector('[data-kps-active-additions]');
    const criterion = screen.querySelector('[data-kps-criterion]');
    const addBtn = screen.querySelector('[data-kps-add]');

    async function submitCreate(text) {
      toggleBusy(createBtn, true, 'Проверявам…');
      setStatus(createStatus, 'Gemini сравнява заявката с актуалната номенклатура…');
      try {
        const data = await api('/searches', { method: 'POST', body: { text } });
        if (data.needsInput) {
          pendingCreateText = text;
          setStatus(createStatus, 'Трябва още едно уточнение, преди да търся.');
          renderAdditions(createAdditions, data.additions || [], async answers => {
            await submitCreate(`${pendingCreateText}\nУТОЧНЕНИЯ:\n${answers.join('\n')}`);
          });
          return;
        }

        hideAdditions(createAdditions);
        pendingCreateText = '';
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
    }

    createBtn.addEventListener('click', async () => {
      const text = query.value.trim();
      if (!text) return setStatus(createStatus, 'Опиши какво търсиш.', true);
      pendingCreateText = text;
      await submitCreate(text);
    });

    async function submitCriterion(text) {
      if (!currentSearchId) return;
      toggleBusy(addBtn, true, 'Проверявам…');
      setStatus(activeStatus, 'Gemini сравнява допълнението с актуалната номенклатура…');
      try {
        const data = await api(`/searches/${encodeURIComponent(currentSearchId)}/criteria`, {
          method: 'POST', body: { text }
        });
        if (data.needsInput) {
          pendingCriterionText = text;
          setStatus(activeStatus, 'Трябва уточнение за новия критерий.');
          renderAdditions(activeAdditions, data.additions || [], async answers => {
            await submitCriterion(`${pendingCriterionText}\nУТОЧНЕНИЯ:\n${answers.join('\n')}`);
          });
          return;
        }

        hideAdditions(activeAdditions);
        pendingCriterionText = '';
        criterion.value = '';
        renderSearch(screen, data.search, data.results || []);
        setStatus(activeStatus, `Критерият е добавен · ${data.results?.length || 0} реални обяви`);
      } catch (error) {
        setStatus(activeStatus, friendlyError(error), true);
      } finally {
        toggleBusy(addBtn, false, '+ Добави');
      }
    }

    addBtn.addEventListener('click', async () => {
      const text = criterion.value.trim();
      if (!text) return;
      pendingCriterionText = text;
      await submitCriterion(text);
    });

    criterion.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addBtn.click();
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

  function renderAdditions(host, additions, onContinue) {
    host.replaceChildren();
    host.classList.remove('kps-hidden');

    const title = document.createElement('div');
    title.className = 'kps-additions-title';
    title.textContent = 'Допълни търсенето';
    host.appendChild(title);

    const rows = [];
    for (const addition of additions) {
      const row = document.createElement('div');
      row.className = 'kps-addition';
      const question = document.createElement('div');
      question.className = 'kps-addition-question';
      question.textContent = addition.question || 'Уточни критерия';
      row.appendChild(question);

      const state = { field: addition.field || 'criterion', value: '' };
      rows.push(state);

      if (Array.isArray(addition.options) && addition.options.length) {
        const options = document.createElement('div');
        options.className = 'kps-addition-options';
        for (const option of addition.options) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'secondary kps-addition-option';
          button.textContent = option.label;
          button.addEventListener('click', () => {
            options.querySelectorAll('.kps-addition-option').forEach(x => x.classList.remove('on'));
            button.classList.add('on');
            state.value = option.value;
          });
          options.appendChild(button);
        }
        row.appendChild(options);
      } else {
        const input = document.createElement('input');
        input.className = 'kps-control';
        input.placeholder = 'Напиши уточнението';
        input.addEventListener('input', () => { state.value = input.value.trim(); });
        row.appendChild(input);
      }
      host.appendChild(row);
    }

    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'primary kps-additions-continue';
    action.textContent = 'Продължи';
    action.addEventListener('click', async () => {
      const missing = rows.some(row => !row.value);
      if (missing) {
        action.classList.add('error');
        return;
      }
      action.disabled = true;
      try {
        await onContinue(rows.map(row => `${row.field} = ${row.value}`));
      } finally {
        action.disabled = false;
      }
    });
    host.appendChild(action);
  }

  function hideAdditions(host) {
    host.replaceChildren();
    host.classList.add('kps-hidden');
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
    if (request.location?.district) criteria.push(`обл. ${request.location.district}`);
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
    if (code.startsWith('IMOT_TAXONOMY_RESOLUTION_FAILED')) return 'Тази локация не е намерена в текущата номенклатура на imot.bg.';
    if (code === 'IMOT_NOMENCLATURE_UNAVAILABLE') return 'Не успях да заредя актуалната номенклатура на imot.bg.';
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
      .kps-additions{margin-top:10px;padding:12px;border:1px solid var(--line);border-radius:14px;background:var(--strong)}.kps-additions-title{font-size:11px;font-weight:800;margin-bottom:9px}.kps-addition{padding:9px 0;border-top:1px solid var(--line)}.kps-addition:first-of-type{border-top:0}.kps-addition-question{font-size:9px;font-weight:700;margin-bottom:7px}.kps-addition-options{display:flex;gap:6px;flex-wrap:wrap}.kps-addition-option.on{border-color:var(--blue);box-shadow:0 0 0 2px color-mix(in srgb,var(--blue) 14%,transparent)}.kps-additions-continue{margin-top:10px;width:100%}.kps-additions-continue.error{outline:2px solid var(--red)}
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