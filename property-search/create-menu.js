(() => {
  const SCREEN_ID = 'create-hub';

  function boot() {
    const originalPlus = document.querySelector('.dock .plus');
    const workspace = document.querySelector('.workspace');
    if (!originalPlus || !workspace || document.getElementById(SCREEN_ID)) return false;

    installStyles();
    const screen = buildScreen();
    workspace.appendChild(screen);

    // Replace the legacy + control so its old anonymous data-go listener cannot also fire.
    const plus = originalPlus.cloneNode(true);
    originalPlus.replaceWith(plus);
    plus.removeAttribute('data-go');
    plus.setAttribute('aria-label', 'Ново');
    plus.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openCreateHub();
    });

    // imot.bg is now entered only from +, not from a separate card in Buy.
    removePropertySearchEntry();
    const buy = document.getElementById('buy');
    if (buy) {
      new MutationObserver(removePropertySearchEntry).observe(buy, { childList: true, subtree: true });
    }

    return true;
  }

  function buildScreen() {
    const screen = document.createElement('section');
    screen.id = SCREEN_ID;
    screen.className = 'screen kch-screen';
    screen.innerHTML = `
      <div class="kch-head">
        <button class="kch-back" type="button" aria-label="Назад">‹</button>
        <div class="kch-head-copy">
          <h1>Ново</h1>
          <p>Избери какво и къде искаш да направиш</p>
        </div>
        <div class="kch-head-spacer" aria-hidden="true"></div>
      </div>

      <section class="kch-group" aria-labelledby="kchBuyTitle">
        <div class="kch-group-head">
          <span class="kch-direction kch-direction-buy" aria-hidden="true">↓</span>
          <div>
            <h2 id="kchBuyTitle">Купува</h2>
            <p>Създай нова покупка или търсене</p>
          </div>
        </div>
        <div class="kch-card">
          ${row('ka-buy', 'ka', 'KLEINANZEIGEN', 'Нова покупка в Kleinanzeigen', 'Коки ще подготви покупката с нужните данни за Kleinanzeigen.')}
          <div class="kch-separator"></div>
          ${row('imot-buy', 'imot', 'IMOT.BG', 'Нова покупка в imot.bg', 'Опиши имота на човешки език и Коки ще търси реалните обяви в imot.bg.')}
        </div>
      </section>

      <section class="kch-group" aria-labelledby="kchSellTitle">
        <div class="kch-group-head">
          <span class="kch-direction kch-direction-sell" aria-hidden="true">↑</span>
          <div>
            <h2 id="kchSellTitle">Продава</h2>
            <p>Публикувай нова обява</p>
          </div>
        </div>
        <div class="kch-card">
          ${row('olx-sell', 'olx', 'OLX', 'Продай в OLX', 'Коки ще подготви обявата и ще те преведе до публикуването.')}
          <div class="kch-separator"></div>
          ${row('ka-sell', 'ka', 'KLEINANZEIGEN', 'Продай в Kleinanzeigen', 'Коки ще подготви обявата с нужните данни за Kleinanzeigen.')}
        </div>
      </section>`;

    screen.querySelector('.kch-back').addEventListener('click', closeCreateHub);
    screen.querySelectorAll('[data-kch-action]').forEach(button => {
      button.addEventListener('click', () => runAction(button.dataset.kchAction));
    });
    return screen;
  }

  function row(action, platform, eyebrow, title, description) {
    return `
      <button class="kch-row" type="button" data-kch-action="${action}">
        <span class="kch-logo kch-logo-${platform}" aria-hidden="true">${logo(platform)}</span>
        <span class="kch-copy">
          <span class="kch-eyebrow">${eyebrow}</span>
          <strong>${title}</strong>
          <small>${description}</small>
        </span>
        <span class="kch-chevron" aria-hidden="true">›</span>
      </button>`;
  }

  function logo(platform) {
    if (platform === 'olx') {
      return `<svg viewBox="0 0 64 64" role="img" aria-label="OLX"><rect width="64" height="64" rx="18" fill="#23e5db"/><g fill="#002f34"><circle cx="18" cy="32" r="8"/><rect x="29" y="21" width="6" height="22" rx="3"/><path d="M40 22h7l4 7 4-7h7l-7.5 10L62 42h-7l-4-7-4 7h-7l7.5-10z"/></g><circle cx="18" cy="32" r="3.2" fill="#23e5db"/></svg>`;
    }
    if (platform === 'ka') {
      return `<svg viewBox="0 0 64 64" role="img" aria-label="Kleinanzeigen"><rect width="64" height="64" rx="18" fill="#f5f8fb"/><path d="M24 11c-6 0-10 4.6-10 10v22c0 5.4 4 10 10 10 4.8 0 8-2.6 10-6.5V17.5C32 13.6 28.8 11 24 11Z" fill="none" stroke="#65b32e" stroke-width="4" stroke-linejoin="round"/><path d="M34 26c2.1-4.1 5.5-6.3 10-6.3 6.2 0 10.5 4.3 10.5 10.1 0 4.9-2.9 8.2-7.5 9.7l8 9.8H48L38 37.3V52h-4Z" fill="none" stroke="#65b32e" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
    }
    if (platform === 'imot') {
      return `<svg viewBox="0 0 64 64" role="img" aria-label="imot.bg"><rect width="64" height="64" rx="18" fill="#ffffff"/><path d="M14 33 32 18l18 15v18H37V39H27v12H14Z" fill="#e5232e"/><rect x="27" y="39" width="10" height="12" fill="#2c5da8"/><text x="32" y="60" text-anchor="middle" font-size="8" font-family="Arial, sans-serif" font-weight="700" fill="#2c5da8">imot.bg</text></svg>`;
    }
    return '';
  }

  function openCreateHub() {
    removePropertySearchEntry();
    document.querySelectorAll('.screen.on').forEach(screen => screen.classList.remove('on'));
    document.getElementById(SCREEN_ID)?.classList.add('on');
    document.querySelectorAll('.navbtn,.dockbtn').forEach(button => button.classList.remove('on'));
    window.scrollTo(0, 0);
  }

  function closeCreateHub() {
    document.getElementById(SCREEN_ID)?.classList.remove('on');
    if (typeof window.go === 'function') window.go('home');
    else document.getElementById('home')?.classList.add('on');
  }

  function runAction(action) {
    if (action === 'imot-buy') {
      openScreen('property-search', 'buy');
      return;
    }

    const custom = window.KOKI_CREATE_ACTIONS?.[action];
    if (typeof custom === 'function') {
      custom();
      return;
    }

    const routeCandidates = {
      'ka-buy': ['new-buy-ka', 'new-buy-kleinanzeigen', 'new-buy'],
      'olx-sell': ['new-sale-olx', 'new-sale'],
      'ka-sell': ['new-sale-ka', 'new-sale-kleinanzeigen'],
    }[action] || [];

    const route = routeCandidates.find(id => document.getElementById(id));
    if (route) {
      if (typeof window.go === 'function') window.go(route);
      else openScreen(route, action.endsWith('buy') ? 'buy' : 'sell');
      return;
    }

    const [platformKey, side] = action.split('-');
    const platform = platformKey === 'ka' ? 'kleinanzeigen' : platformKey;
    const event = new CustomEvent('koki:create', {
      cancelable: true,
      detail: { platform, side },
    });
    const handled = !window.dispatchEvent(event);
    if (!handled && typeof window.toastIt === 'function') {
      window.toastIt(`${platformLabel(platform)} · ${side === 'buy' ? 'нова покупка' : 'нова продажба'}`);
    }
  }

  function openScreen(id, nav) {
    const target = document.getElementById(id);
    if (!target) {
      if (typeof window.toastIt === 'function') window.toastIt('Екранът още не е наличен');
      return;
    }
    document.querySelectorAll('.screen.on').forEach(screen => screen.classList.remove('on'));
    target.classList.add('on');
    document.querySelectorAll('.navbtn,.dockbtn').forEach(button => {
      button.classList.toggle('on', button.dataset.go === nav);
    });
    window.scrollTo(0, 0);
  }

  function removePropertySearchEntry() {
    document.getElementById('kokiPropertySearchEntry')?.remove();
  }

  function platformLabel(platform) {
    if (platform === 'kleinanzeigen') return 'Kleinanzeigen';
    if (platform === 'imot') return 'imot.bg';
    return 'OLX';
  }

  function installStyles() {
    if (document.getElementById('kokiCreateHubCss')) return;
    const style = document.createElement('style');
    style.id = 'kokiCreateHubCss';
    style.textContent = `
      .kch-screen{max-width:860px;margin:0 auto;padding:10px 0 30px}
      .kch-head{display:grid;grid-template-columns:64px minmax(0,1fr) 64px;align-items:center;margin:4px 0 24px;text-align:center}
      .kch-head-copy h1{font-size:32px;line-height:1.06;letter-spacing:-.045em;margin:0}
      .kch-head-copy p{font-size:12px;color:var(--muted);margin:7px 0 0}
      .kch-back{width:50px;height:50px;border:0;border-radius:17px;background:var(--strong);box-shadow:0 12px 30px rgba(25,33,50,.08);font-size:38px;line-height:38px;display:grid;place-items:center;cursor:pointer;padding:0 0 5px}
      .kch-group{margin-top:18px}.kch-group+.kch-group{margin-top:28px}
      .kch-group-head{display:flex;align-items:center;gap:10px;margin:0 10px 10px}
      .kch-group-head h2{font-size:16px;margin:0}.kch-group-head p{font-size:9px;color:var(--muted);margin:2px 0 0}
      .kch-direction{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;font-size:17px;font-weight:900}
      .kch-direction-buy{color:var(--blue);background:rgba(89,105,232,.09)}.kch-direction-sell{color:var(--green);background:rgba(19,135,98,.09)}
      .kch-card{border:1px solid var(--line);background:var(--strong);border-radius:26px;box-shadow:0 20px 50px rgba(26,35,52,.08);overflow:hidden;padding:0 18px}
      .kch-row{width:100%;min-height:128px;border:0;background:transparent;display:grid;grid-template-columns:82px minmax(0,1fr) 24px;gap:17px;align-items:center;text-align:left;padding:20px 8px;cursor:pointer}
      .kch-logo{width:72px;height:72px;border-radius:20px;display:grid;place-items:center;overflow:hidden;border:1px solid rgba(20,28,42,.09);background:#f5f8fb}.kch-logo svg{width:100%;height:100%;display:block}
      .kch-copy{min-width:0;display:block}.kch-eyebrow{display:block;font-size:10px;line-height:1;font-weight:800;letter-spacing:.11em;color:var(--muted);margin-bottom:7px}.kch-copy strong{display:block;font-size:19px;line-height:1.18;letter-spacing:-.025em}.kch-copy small{display:block;margin-top:6px;font-size:11px;line-height:1.38;color:var(--muted)}
      .kch-chevron{font-size:38px;line-height:1;color:var(--muted);font-weight:300}.kch-separator{height:1px;background:var(--line)}
      @media(max-width:900px){.kch-screen{padding:4px 14px 24px;max-width:100%}.kch-head{grid-template-columns:56px minmax(0,1fr) 56px;margin:1px 0 22px}.kch-head-copy h1{font-size:27px}.kch-head-copy p{font-size:10px}.kch-back{width:46px;height:46px;border-radius:16px;font-size:34px}.kch-group{margin-top:16px}.kch-group+.kch-group{margin-top:24px}.kch-card{padding:0 12px;border-radius:24px}.kch-row{min-height:112px;grid-template-columns:68px minmax(0,1fr) 20px;gap:13px;padding:17px 5px}.kch-logo{width:62px;height:62px;border-radius:18px}.kch-eyebrow{font-size:9px}.kch-copy strong{font-size:17px}.kch-copy small{font-size:10px}.kch-chevron{font-size:32px}}
      @media(max-width:420px){.kch-screen{padding-left:10px;padding-right:10px}.kch-row{grid-template-columns:64px minmax(0,1fr) 18px;gap:11px}.kch-logo{width:58px;height:58px;border-radius:17px}.kch-copy strong{font-size:16px}.kch-copy small{font-size:9.5px}}
    `;
    document.head.appendChild(style);
  }

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts++;
    if (boot() || attempts >= 50) window.clearInterval(timer);
  }, 120);
})();
