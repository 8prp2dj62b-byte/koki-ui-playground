(() => {
  const MENU_ID = 'kokiCreateMenu';

  function boot() {
    const plus = document.querySelector('.dock .plus');
    const buy = document.getElementById('buy');
    if (!plus || !buy || document.getElementById(MENU_ID)) return false;

    // Property search lives in the global + menu, not as a separate Buy card.
    removePropertySearchEntry();
    const observer = new MutationObserver(removePropertySearchEntry);
    observer.observe(buy, { childList: true, subtree: true });

    installStyles();
    const menu = buildMenu();
    document.body.appendChild(menu);

    plus.removeAttribute('data-go');
    plus.setAttribute('aria-haspopup', 'dialog');
    plus.setAttribute('aria-controls', MENU_ID);
    plus.setAttribute('aria-expanded', 'false');
    plus.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openMenu(menu, plus);
    });

    // Existing hero create buttons now use the same chooser, pre-focused by side.
    document.querySelectorAll('.new').forEach(button => {
      const text = (button.textContent || '').toLocaleLowerCase('bg-BG');
      if (!text.includes('нова покупка') && !text.includes('нова продажба')) return;
      button.removeAttribute('data-go');
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        openMenu(menu, plus, text.includes('покупка') ? 'buy' : 'sell');
      });
    });

    return true;
  }

  function removePropertySearchEntry() {
    document.getElementById('kokiPropertySearchEntry')?.remove();
  }

  function buildMenu() {
    const overlay = document.createElement('div');
    overlay.id = MENU_ID;
    overlay.className = 'kcm-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <section class="kcm-sheet" role="dialog" aria-modal="true" aria-labelledby="kcmTitle">
        <div class="kcm-grabber" aria-hidden="true"></div>
        <header class="kcm-head">
          <div>
            <div class="eyebrow">НОВО</div>
            <h2 id="kcmTitle">Какво искаш да направиш?</h2>
          </div>
          <button class="kcm-close" type="button" aria-label="Затвори">×</button>
        </header>

        <div class="kcm-section" data-kcm-section="buy">
          <div class="kcm-section-title">
            <span class="kcm-direction kcm-buy">↓</span>
            <div><strong>Купува</strong><small>Създай ново търсене или покупка</small></div>
          </div>
          <div class="kcm-grid">
            ${platformCard('olx-buy', 'olx', 'OLX', 'Нова покупка')}
            ${platformCard('ka-buy', 'ka', 'Kleinanzeigen', 'Нова покупка')}
            ${platformCard('imot-buy', 'imot', 'imot.bg', 'Нова покупка')}
          </div>
        </div>

        <div class="kcm-divider"></div>

        <div class="kcm-section" data-kcm-section="sell">
          <div class="kcm-section-title">
            <span class="kcm-direction kcm-sell">↑</span>
            <div><strong>Продава</strong><small>Публикувай нова обява</small></div>
          </div>
          <div class="kcm-grid kcm-grid-sell">
            ${platformCard('olx-sell', 'olx', 'OLX', 'Нова продажба')}
            ${platformCard('ka-sell', 'ka', 'Kleinanzeigen', 'Нова продажба')}
          </div>
        </div>
      </section>`;

    overlay.querySelector('.kcm-close').addEventListener('click', () => closeMenu(overlay));
    overlay.addEventListener('click', event => {
      if (event.target === overlay) closeMenu(overlay);
    });
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeMenu(overlay);
    });
    overlay.querySelectorAll('[data-kcm-action]').forEach(button => {
      button.addEventListener('click', () => {
        const action = button.dataset.kcmAction;
        closeMenu(overlay);
        runAction(action);
      });
    });
    return overlay;
  }

  function platformCard(action, brandClass, brand, label) {
    return `
      <button class="kcm-card" type="button" data-kcm-action="${action}">
        <span class="kcm-brand kcm-brand-${brandClass}" aria-hidden="true">${brandMarkup(brandClass)}</span>
        <span class="kcm-card-copy">
          <strong>${label}</strong>
          <small>${brand}</small>
        </span>
        <span class="kcm-chevron" aria-hidden="true">›</span>
      </button>`;
  }

  function brandMarkup(type) {
    if (type === 'olx') return '<span class="kcm-olx-o">O</span><span class="kcm-olx-l">L</span><span class="kcm-olx-x">X</span>';
    if (type === 'ka') return '<span class="kcm-ka-mark">K</span>';
    if (type === 'imot') return '<span class="kcm-imot-mark">imot<span>.bg</span></span>';
    return '';
  }

  function openMenu(menu, plus, focusSection) {
    removePropertySearchEntry();
    menu.classList.add('on');
    menu.setAttribute('aria-hidden', 'false');
    plus?.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('kcm-open');

    if (focusSection) {
      const section = menu.querySelector(`[data-kcm-section="${focusSection}"]`);
      requestAnimationFrame(() => section?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    }
    requestAnimationFrame(() => menu.querySelector('.kcm-close')?.focus());
  }

  function closeMenu(menu) {
    menu.classList.remove('on');
    menu.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('kcm-open');
    document.querySelector('.dock .plus')?.setAttribute('aria-expanded', 'false');
  }

  function runAction(action) {
    const custom = window.KOKI_CREATE_ACTIONS?.[action];
    if (typeof custom === 'function') {
      custom();
      return;
    }

    const routeCandidates = {
      'olx-buy': ['new-buy-olx', 'new-buy'],
      'ka-buy': ['new-buy-ka', 'new-buy-kleinanzeigen'],
      'imot-buy': ['property-search'],
      'olx-sell': ['new-sale-olx', 'new-sale'],
      'ka-sell': ['new-sale-ka', 'new-sale-kleinanzeigen'],
    }[action] || [];

    const route = routeCandidates.find(id => document.getElementById(id));
    if (route) {
      if (route === 'property-search') openScreen(route, 'buy');
      else if (typeof window.go === 'function') window.go(route);
      else openScreen(route, action.endsWith('buy') ? 'buy' : 'sell');
      return;
    }

    // Host adapter: lets the real KOKI OLX / KA flows handle the action without
    // coupling this visual menu to their current implementation details.
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
    document.querySelectorAll('.screen.on').forEach(screen => screen.classList.remove('on'));
    document.getElementById(id)?.classList.add('on');
    document.querySelectorAll('.navbtn,.dockbtn').forEach(button => {
      button.classList.toggle('on', button.dataset.go === nav);
    });
    window.scrollTo(0, 0);
  }

  function platformLabel(platform) {
    if (platform === 'kleinanzeigen') return 'Kleinanzeigen';
    if (platform === 'imot') return 'imot.bg';
    return 'OLX';
  }

  function installStyles() {
    if (document.getElementById('kokiCreateMenuCss')) return;
    const style = document.createElement('style');
    style.id = 'kokiCreateMenuCss';
    style.textContent = `
      html.kcm-open,html.kcm-open body{overflow:hidden}
      .kcm-overlay{position:fixed;inset:0;display:none;align-items:flex-end;justify-content:center;padding:18px;background:rgba(8,13,22,.34);backdrop-filter:blur(10px);z-index:120}
      .kcm-overlay.on{display:flex}
      .kcm-sheet{width:min(720px,100%);max-height:min(760px,calc(100vh - 36px));overflow:auto;padding:18px;border:1px solid var(--line);border-radius:28px;background:color-mix(in srgb,var(--solid) 94%,transparent);box-shadow:0 32px 90px rgba(10,17,29,.28);backdrop-filter:blur(32px) saturate(150%)}
      .kcm-grabber{display:none;width:38px;height:4px;border-radius:99px;background:color-mix(in srgb,var(--muted) 35%,transparent);margin:0 auto 12px}
      .kcm-head{display:flex;align-items:center;gap:12px;margin-bottom:18px}.kcm-head>div{flex:1}.kcm-head h2{margin-top:4px;font-size:22px}.kcm-close{width:38px;height:38px;border:1px solid var(--line);border-radius:13px;background:var(--strong);font-size:22px;line-height:1;cursor:pointer}
      .kcm-section{scroll-margin-top:10px}.kcm-section-title{display:flex;align-items:center;gap:10px;margin-bottom:10px}.kcm-section-title>div{display:grid;gap:2px}.kcm-section-title strong{font-size:13px}.kcm-section-title small{font-size:9px;color:var(--muted)}
      .kcm-direction{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;font-weight:900}.kcm-buy{background:rgba(89,105,232,.10);color:var(--blue)}.kcm-sell{background:rgba(19,135,98,.10);color:var(--green)}
      .kcm-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.kcm-grid-sell{grid-template-columns:repeat(2,minmax(0,1fr))}.kcm-divider{height:1px;background:var(--line);margin:18px 0}
      .kcm-card{min-width:0;display:grid;grid-template-columns:50px minmax(0,1fr) 16px;gap:10px;align-items:center;text-align:left;padding:12px;border:1px solid var(--line);border-radius:17px;background:var(--strong);cursor:pointer;transition:transform .14s ease,border-color .14s ease,background .14s ease}.kcm-card:active{transform:scale(.985)}.kcm-card:hover{border-color:color-mix(in srgb,var(--blue) 25%,var(--line))}
      .kcm-card-copy{min-width:0;display:grid;gap:3px}.kcm-card-copy strong{font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.kcm-card-copy small{font-size:8px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.kcm-chevron{font-size:20px;color:var(--muted)}
      .kcm-brand{width:50px;height:50px;border-radius:14px;display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid var(--line);background:#fff;font-weight:900}.kcm-brand-olx{gap:0;font-size:15px;letter-spacing:-.16em;padding-right:3px}.kcm-olx-o{color:#23e5db}.kcm-olx-l{color:#ffce32}.kcm-olx-x{color:#3a77ff}.kcm-brand-ka{background:#e8f7d8;color:#203b13}.kcm-ka-mark{width:30px;height:30px;border-radius:8px;background:#65b32e;color:#fff;display:grid;place-items:center;font-size:18px}.kcm-brand-imot{background:#fff}.kcm-imot-mark{font-size:11px;color:#e21f2f;letter-spacing:-.04em}.kcm-imot-mark span{color:#2d5ea8}
      @media(min-width:901px){.kcm-overlay{align-items:center}.kcm-sheet{padding:22px}.kcm-card{padding:14px}}
      @media(max-width:700px){.kcm-overlay{padding:0;align-items:flex-end}.kcm-sheet{width:100%;max-height:88vh;border-radius:27px 27px 0 0;border-bottom:0;padding:12px 13px max(18px,env(safe-area-inset-bottom))}.kcm-grabber{display:block}.kcm-head{margin-bottom:14px}.kcm-head h2{font-size:20px}.kcm-grid,.kcm-grid-sell{grid-template-columns:1fr}.kcm-card{grid-template-columns:46px minmax(0,1fr) 16px;padding:10px 11px}.kcm-brand{width:46px;height:46px}.kcm-divider{margin:14px 0}}
    `;
    document.head.appendChild(style);
  }

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts++;
    if (boot() || attempts >= 50) window.clearInterval(timer);
  }, 120);
})();
