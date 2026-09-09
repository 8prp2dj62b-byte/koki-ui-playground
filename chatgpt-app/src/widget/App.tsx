import { useApp } from '@modelcontextprotocol/ext-apps/react';
import type { App as McpApp } from '@modelcontextprotocol/ext-apps';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { KokiView, KokiWidgetPayload } from '../types.js';

type AnyRecord = Record<string, any>;
type PendingConfirm = { title: string; text: string; tool: string; args: AnyRecord } | null;

type NavItem = { view: KokiView; tool: string; label: string; icon: string };
const NAV: NavItem[] = [
  { view: 'dashboard', tool: 'get_dashboard', label: 'Начало', icon: '⌂' },
  { view: 'buy', tool: 'list_buy', label: 'Купува', icon: '⌕' },
  { view: 'sell-draft', tool: '', label: 'Ново', icon: '+' },
  { view: 'conversations', tool: 'get_conversations', label: 'Разговори', icon: '◌' },
  { view: 'profile', tool: 'get_profile', label: 'Профил', icon: '○' },
];

export default function App() {
  const [payload, setPayload] = useState<KokiWidgetPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [lastCall, setLastCall] = useState<{ tool: string; args: AnyRecord } | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [toolResultSeq, setToolResultSeq] = useState(0);

  const { app, error } = useApp({
    appInfo: { name: 'KOKI', version: '1.0.0' },
    capabilities: {},
    onAppCreated: (instance: McpApp) => {
      instance.ontoolresult = (result) => {
        const next = result.structuredContent as unknown as KokiWidgetPayload | undefined;
        if (next?.app === 'koki') {
          setPayload(next);
          setLocalError(next.view === 'error' ? String((next.data as AnyRecord)?.code || 'KOKI_ACTION_FAILED') : null);
          setToolResultSeq((n) => n + 1);
        }
      };
    },
  });

  const callTool = useCallback(async (tool: string, args: AnyRecord = {}) => {
    if (!app || !tool) return null;
    setBusy(true);
    setLocalError(null);
    setLastCall({ tool, args });
    try {
      const result = await app.callServerTool({ name: tool, arguments: args });
      const next = result.structuredContent as unknown as KokiWidgetPayload | undefined;
      if (next?.app === 'koki') {
        setPayload(next);
        setToolResultSeq((n) => n + 1);
      }
      if (result.isError) {
        const message = extractToolText(result) || String((next?.data as AnyRecord)?.code || 'KOKI_ACTION_FAILED');
        setLocalError(message);
      }
      return result;
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'KOKI_CALL_FAILED');
      return null;
    } finally {
      setBusy(false);
    }
  }, [app]);

  const requestConfirm = useCallback((title: string, text: string, tool: string, args: AnyRecord) => {
    setConfirm({ title, text, tool, args });
  }, []);

  const runConfirmed = useCallback(async () => {
    if (!confirm) return;
    const item = confirm;
    setConfirm(null);
    await callTool(item.tool, item.args);
  }, [confirm, callTool]);

  const navigate = useCallback((item: NavItem) => {
    if (!item.tool) { setCreateOpen(true); return; }
    void callTool(item.tool);
  }, [callTool]);

  const openLink = useCallback(async (url?: string | null) => {
    if (!app || !url) return;
    try { await app.openLink({ url }); } catch { setLocalError('LINK_OPEN_FAILED'); }
  }, [app]);

  if (error) return <ConnectionState title="Неуспешна връзка" text={error.message} />;
  if (!app) return <ConnectionState title="Свързване с Коки…" text="Подготвям интерактивния интерфейс." />;
  if (!payload) return <ConnectionState title="Коки е готов" text="Очаквам началното състояние от ChatGPT." />;

  return (
    <div className="app app-shell">
      <header className="header">
        <div className="mark">K</div>
        <div className="brand">
          <b>KOKI</b>
          <span><i className="dot" /> {payload.view === 'error' ? 'Нужда от внимание' : 'Свързан'}</span>
        </div>
        <div className="header-actions">
          <button className="icon-btn" aria-label="Известия" onClick={() => void callTool('get_notifications')}>♢</button>
          <button className="icon-btn" aria-label="За решение" onClick={() => void callTool('get_decisions')}>!</button>
        </div>
      </header>
      {busy && <div className="busy" aria-label="Зареждане" />}
      <main className="body">
        {localError && (
          <div className="notice error" style={{ marginBottom: 10 }}>
            <b>Не успях да изпълня действието.</b><br />{humanError(localError)}
            {lastCall && <div style={{ marginTop: 8 }}><button className="btn" onClick={() => void callTool(lastCall.tool, lastCall.args)}>Опитай отново</button></div>}
          </div>
        )}
        <View
          key={`${payload.action}:${toolResultSeq}`}
          payload={payload}
          callTool={callTool}
          requestConfirm={requestConfirm}
          openLink={openLink}
        />
      </main>
      <nav className="bottom-nav" aria-label="KOKI navigation">
        {NAV.map((item) => (
          <button key={item.label} className={`nav-btn ${payload.view === item.view ? 'on' : ''} ${item.tool ? '' : 'create'}`} onClick={() => navigate(item)}>
            {item.tool ? <span>{item.icon}</span> : <span className="nav-plus">+</span>}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      {createOpen && <CreateSheet onClose={() => setCreateOpen(false)} callTool={callTool} />}
      {confirm && (
        <div className="overlay" role="presentation" onClick={() => setConfirm(null)}>
          <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>{confirm.title}</h2><p>{confirm.text}</p>
            <div className="confirm-actions">
              <button className="btn" onClick={() => setConfirm(null)}>Отказ</button>
              <button className="btn primary" onClick={() => void runConfirmed()}>Потвърди</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function View(props: {
  payload: KokiWidgetPayload;
  callTool: (tool: string, args?: AnyRecord) => Promise<any>;
  requestConfirm: (title: string, text: string, tool: string, args: AnyRecord) => void;
  openLink: (url?: string | null) => Promise<void>;
}) {
  const { payload } = props;
  switch (payload.view) {
    case 'dashboard': return <Dashboard {...props} />;
    case 'buy': return <Listings {...props} direction="BUY" />;
    case 'sell': return <Listings {...props} direction="SELL" />;
    case 'listing': return <ListingDetail {...props} />;
    case 'conversations': return <Conversations {...props} />;
    case 'conversation': return <Conversation {...props} />;
    case 'decisions': return <Decisions {...props} />;
    case 'searches': return <Searches {...props} />;
    case 'search-results': return <SearchResults {...props} />;
    case 'sell-draft': return <SellDraft {...props} />;
    case 'notifications': return <Notifications {...props} />;
    case 'profile': return <Profile {...props} />;
    case 'settings': return <Settings {...props} />;
    case 'status': return <StatusView {...props} />;
    case 'error': return <ErrorView {...props} />;
    default: return <GenericView {...props} />;
  }
}

function Dashboard({ payload, callTool }: ViewProps) {
  const data = record(payload.data);
  const operations = arr(data.activeOperations || data.operations || data.items);
  const counts = record(data.counts);
  return <>
    <PageHead eyebrow="Какво има значение сега" title="Начало" subtitle="Едно състояние на Коки — същото като в PWA." />
    <div className="stats">
      <Stat value={num(counts.decisions)} label="За решение" onClick={() => void callTool('get_decisions')} />
      <Stat value={num(counts.unread)} label="Непрочетени" onClick={() => void callTool('get_notifications', { unreadOnly: true })} />
      <Stat value={num(counts.newSearchResults)} label="Нови имоти" onClick={() => void callTool('list_property_searches')} />
      <Stat value={num(counts.sleeping)} label="Без движение" />
    </div>
    <section className="section">
      <SectionHead title="Активни операции" count={operations.length} />
      <div className="panel">
        {operations.length ? operations.slice(0, 3).map((item: AnyRecord) => (
          <OperationRow key={idOf(item)} item={item} onClick={() => openOperation(item, callTool)} />
        )) : <Empty text="Няма активни операции." />}
      </div>
    </section>
    <section className="section">
      <div className="btns">
        <button className="btn" onClick={() => void callTool('list_sell')}>Продава</button>
        <button className="btn" onClick={() => void callTool('list_buy')}>Купува</button>
        <button className="btn" onClick={() => void callTool('list_property_searches')}>Търся</button>
        <button className="btn violet" onClick={() => void callTool('get_status')}>Статус</button>
      </div>
    </section>
  </>;
}

function Listings({ payload, callTool, direction }: ViewProps & { direction: 'BUY' | 'SELL' }) {
  const data = record(payload.data);
  const items = arr(data.items || data.listings || data.operations);
  const [tab, setTab] = useState('ALL');
  const visible = items.filter((x: AnyRecord) => tab === 'ALL' || String(x.status || '').toUpperCase().includes(tab));
  return <>
    <PageHead eyebrow={direction === 'BUY' ? 'Покупки и преговори' : 'Мои обяви'} title={direction === 'BUY' ? 'Купува' : 'Продава'} subtitle={`${items.length} операции`} />
    <div className="tabs">
      {['ALL', 'ACTIVE', 'WAITING', 'COMPLETED'].map((x) => <button key={x} className={`tab ${tab === x ? 'on' : ''}`} onClick={() => setTab(x)}>{tabLabel(x)}</button>)}
    </div>
    <div className="panel">
      {visible.length ? visible.map((item: AnyRecord) => <OperationRow key={idOf(item)} item={item} onClick={() => void callTool('get_listing', { listingId: idOf(item) })} />) : <Empty text="Няма резултати в този филтър." />}
    </div>
    <section className="section"><div className="btns">
      <button className="btn" onClick={() => void callTool('refresh_listings', { direction })}>Обнови</button>
      {direction === 'SELL' && <button className="btn primary" onClick={() => void callTool('create_sell_draft', { marketplace: 'OLX' })}>Нова обява</button>}
    </div></section>
  </>;
}

function ListingDetail({ payload, callTool, openLink }: ViewProps) {
  const data = record(payload.data);
  const listing = record(data.listing || data);
  const id = idOf(listing);
  return <>
    <PageHead eyebrow={`${listing.marketplace || 'KOKI'} · ${listing.direction || ''}`} title={String(listing.title || 'Обява')} subtitle={String(listing.status || '')} />
    {listing.imageUrl && <div className="detail-card" style={{ padding: 0, overflow: 'hidden' }}><img src={listing.imageUrl} alt="" style={{ width: '100%', maxHeight: 260, objectFit: 'cover', display: 'block' }} /></div>}
    <section className="section">
      <div className="detail-card">
        <div className="search-price">{money(listing.price, listing.currency)}</div>
        <div className="keyvals">
          <KV k="Платформа" v={listing.marketplace} /><KV k="Посока" v={listing.direction} /><KV k="Статус" v={listing.status} />
          <KV k="Цел" v={money(listing.targetPrice, listing.currency)} /><KV k="Непрочетени" v={listing.unreadCount} />
        </div>
      </div>
    </section>
    {data.priceAnalysis && <section className="section"><Intel title="Ценови анализ" text={summaryOf(data.priceAnalysis)} confidence={data.priceAnalysis.confidence} /></section>}
    <section className="section"><div className="btns">
      {listing.originalUrl && <button className="btn" onClick={() => void openLink(listing.originalUrl)}>Оригинална обява</button>}
      <button className="btn" onClick={() => void callTool('get_conversations', { listingId: id })}>Разговори</button>
      {listing.direction === 'SELL' && <button className="btn violet" onClick={() => void callTool('analyze_market', { listingId: id })}>Анализ на цена</button>}
    </div></section>
  </>;
}

function Conversations({ payload, callTool }: ViewProps) {
  const data = record(payload.data);
  const conversations = arr(data.conversations || data.items);
  const [filter, setFilter] = useState('ALL');
  const visible = conversations.filter((c: AnyRecord) => filter === 'ALL' || String(c.direction || '').toUpperCase() === filter || (filter === 'UNREAD' && num(c.unreadCount) > 0));
  return <>
    <PageHead eyebrow="Съобщения и автоматизация" title="Разговори" subtitle={`${conversations.reduce((n: number, x: AnyRecord) => n + num(x.unreadCount), 0)} непрочетени`} />
    <div className="tabs">
      {[['ALL','Всички'],['UNREAD','Нови'],['SELL','Продава'],['BUY','Купува']].map(([key,label]) => <button key={key} className={`tab ${filter === key ? 'on' : ''}`} onClick={() => setFilter(key)}>{label}</button>)}
    </div>
    <div className="panel">
      {visible.length ? visible.map((c: AnyRecord) => <button key={idOf(c)} className="row clickable" onClick={() => void callTool('get_conversation', { conversationId: idOf(c) })}>
        <div className="thumb">{c.direction === 'SELL' ? '↑' : '↓'}</div>
        <div><div className="row-title">{c.title || 'Разговор'}</div><div className="row-meta"><span>{c.marketplace}</span><span>·</span><span>{c.direction}</span>{num(c.unreadCount)>0 && <span className="badge primary">{c.unreadCount} нови</span>}</div><div className="muted" style={{ marginTop: 4 }}>{c.lastMessage || ''}</div></div>
        <div className="row-side"><div className="badge violet">{automationLabel(c.automationState)}</div><div className="time">{ago(c.lastInteractionAt)}</div></div>
      </button>) : <Empty text="Няма разговори." />}
    </div>
    <section className="section"><button className="btn" onClick={() => void callTool('get_conversations')}>Обнови списъка</button></section>
  </>;
}

function Conversation({ payload, callTool, requestConfirm }: ViewProps) {
  const data = record(payload.data);
  const conversation = record(data.conversation || data);
  const messages = arr(conversation.messages || data.messages);
  const strategy = record(conversation.strategy || data.strategy);
  const conversationId = String(conversation.id || data.id || '');
  const [text, setText] = useState('');
  const isHuman = String(conversation.automationState || '').toUpperCase().includes('HUMAN') || String(conversation.automationState || '').toUpperCase().includes('STOP');
  const send = async () => { const clean = text.trim(); if (!clean) return; setText(''); await callTool('send_message', { conversationId, text: clean }); };
  return <>
    <PageHead eyebrow={`${conversation.marketplace || 'KOKI'} · ${conversation.direction || ''}`} title={String(conversation.title || 'Разговор')} subtitle={automationLabel(conversation.automationState)} />
    <div className="btns" style={{ marginBottom: 10 }}>
      <button className="btn" onClick={() => void callTool('refresh_conversation', { conversationId })}>Обнови</button>
      <button className="btn" onClick={() => copyMessages(messages)}>Копирай всички</button>
    </div>
    <div className="chat">
      {messages.length ? messages.map((m: AnyRecord) => <MessageBubble key={idOf(m)} message={m} />) : <Empty text="Няма съобщения." />}
    </div>
    <div className="composer">
      <input className="input" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="Напиши съобщение…" />
      <button className="btn primary" disabled={!text.trim()} onClick={() => void send()}>Изпрати</button>
    </div>
    <section className="section">
      <Intel title="Стратегия и контрол" text={`Цел: ${money(strategy.targetPrice)} · Последна оферта: ${money(strategy.currentOffer)} · Температура: ${strategy.temperature ?? '—'}%`} confidence={strategy.temperature ? Math.min(100, Number(strategy.temperature)) : undefined} />
    </section>
    <section className="section"><div className="btns">
      {isHuman ? <button className="btn violet" onClick={() => void callTool('return_to_koki', { conversationId })}>Върни към Коки</button> : <button className="btn warning" onClick={() => void callTool('stop_negotiation', { conversationId })}>Спри Коки</button>}
      {!isHuman && <button className="btn" onClick={() => void callTool('take_over_conversation', { conversationId })}>Поеми разговора</button>}
      {isHuman && <button className="btn" onClick={() => void callTool('start_negotiation', { conversationId })}>Стартирай Коки</button>}
      <button className="btn danger" onClick={() => requestConfirm('Архивиране', 'Коки ще спре автоматизацията, но ще запази историята и audit контекста.', 'archive_conversation', { conversationId })}>Архивирай</button>
    </div></section>
  </>;
}

function Decisions({ payload, callTool, requestConfirm }: ViewProps) {
  const data = record(payload.data);
  const decisions = arr(data.decisions || data.items);
  const [counter, setCounter] = useState<Record<string,string>>({});
  return <>
    <PageHead eyebrow="Човешки контрол" title="За решение" subtitle={`${decisions.length} чакат теб`} />
    <div className="stack">
      {decisions.length ? decisions.map((d: AnyRecord) => {
        const id = idOf(d); return <div className="detail-card" key={id}>
          <div className="search-title">{d.title || 'Решение'}</div>
          <div className="keyvals"><KV k="Оферта" v={money(d.offer)} /><KV k="Твоята цел" v={money(d.targetPrice)} /><KV k="Коки" v={d.recommendation} /></div>
          {d.reason && <div className="muted" style={{ margin: '8px 0' }}>{d.reason}</div>}
          <div className="btns">
            <button className="btn primary" onClick={() => void callTool('resolve_decision', { decisionId: id, decision: 'ACCEPT' })}>Приеми</button>
            <input className="input" style={{ width: 94 }} inputMode="decimal" placeholder="€" value={counter[id] || ''} onChange={(e) => setCounter((x) => ({ ...x, [id]: e.target.value }))} />
            <button className="btn" disabled={!Number(counter[id])} onClick={() => void callTool('resolve_decision', { decisionId: id, decision: 'COUNTER', counterAmount: Number(counter[id]) })}>Контра</button>
            <button className="btn violet" onClick={() => void callTool('resolve_decision', { decisionId: id, decision: 'CONTINUE_KOKI' })}>Продължи Коки</button>
            <button className="btn danger" onClick={() => requestConfirm('Архивиране', 'Операцията ще бъде архивирана и автоматизацията ще спре.', 'resolve_decision', { decisionId: id, decision: 'ARCHIVE' })}>Архивирай</button>
          </div>
        </div>;
      }) : <div className="panel"><Empty text="Няма решения, които чакат теб." /></div>}
    </div>
  </>;
}

function Searches({ payload, callTool }: ViewProps) {
  const data = record(payload.data);
  const searches = arr(data.searches || data.items);
  const [text, setText] = useState('');
  return <>
    <PageHead eyebrow="AI-first · imot.bg" title="Търся" subtitle="Естествен език → строг request → реални обяви" />
    <div className="detail-card stack">
      <div className="field"><label>Какво търсиш?</label><textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder="Тристаен в Банско до 140 000 €, да не е първи етаж…" /></div>
      <button className="btn primary" disabled={!text.trim()} onClick={() => void callTool('create_property_search', { text: text.trim() })}>Търси</button>
    </div>
    <section className="section"><SectionHead title="Запазени търсения" count={searches.length} /><div className="panel">
      {searches.length ? searches.map((s: AnyRecord) => <button className="row clickable" key={idOf(s)} onClick={() => void callTool('get_property_results', { searchId: idOf(s) })}>
        <div className="thumb">⌕</div><div><div className="row-title">{s.title || 'Търсене'}</div><div className="row-meta"><span>{s.status}</span>{num(s.newCount)>0 && <span className="badge primary">{s.newCount} нови</span>}</div></div><div className="row-side">›</div>
      </button>) : <Empty text="Няма запазени търсения." />}
    </div></section>
  </>;
}

function SearchResults({ payload, callTool, openLink }: ViewProps) {
  const data = record(payload.data);
  const search = record(data.search || data.profile);
  const results = arr(data.results || data.items);
  const searchId = String(search.id || data.searchId || '');
  const [criterion, setCriterion] = useState('');
  return <>
    <PageHead eyebrow="Само source-backed резултати" title={String(search.title || payload.title || 'Резултати')} subtitle={`${results.length} намерени`} />
    {data.needsInput && <div className="notice">{String(data.error || arr(data.additions).map((x: AnyRecord) => x.question).join(' '))}</div>}
    <div className="btns" style={{ marginBottom: 10 }}>
      {searchId && <button className="btn" onClick={() => void callTool('refresh_property_search', { searchId })}>Обнови</button>}
      {searchId && search.status === 'active' && <button className="btn warning" onClick={() => void callTool('set_property_search_status', { searchId, status: 'paused' })}>Пауза</button>}
      {searchId && search.status === 'paused' && <button className="btn violet" onClick={() => void callTool('set_property_search_status', { searchId, status: 'active' })}>Продължи</button>}
    </div>
    <div className="stack">
      {results.length ? results.map((r: AnyRecord) => {
        const listingId = String(r.listingId || r.id || '');
        const item = record(r.listing || r);
        return <div className="search-card" key={listingId || JSON.stringify(r).slice(0,40)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><div><div className="search-title">{item.title || 'Обява'}</div><div className="row-meta"><span>{item.location || item.address || ''}</span>{r.state && <span className={`badge ${r.state === 'NEW' ? 'primary' : ''}`}>{r.state}</span>}</div></div>{r.score != null && <span className="badge good">KOKI {Number(r.score).toFixed(1)}</span>}</div>
          <div className="search-price">{money(item.price ?? r.price, item.currency ?? r.currency)}</div>
          <div className="row-meta"><span>{item.area ?? r.area ? `${item.area ?? r.area} m²` : ''}</span><span>{item.rooms ?? r.rooms ? `${item.rooms ?? r.rooms} стаи` : ''}</span></div>
          {(arr(r.pros).length || arr(r.cons).length) ? <div className="proscons"><div><b className="muted">Плюсове</b><ul>{arr(r.pros).map((x) => <li key={String(x)}>{String(x)}</li>)}</ul></div><div><b className="muted">Минуси</b><ul>{arr(r.cons).map((x) => <li key={String(x)}>{String(x)}</li>)}</ul></div></div> : null}
          <div className="btns" style={{ marginTop: 10 }}>
            {(item.url || r.url) && <button className="btn" onClick={() => void openLink(item.url || r.url)}>Оригинал</button>}
            {searchId && listingId && <button className="btn" onClick={() => void callTool('set_property_result_state', { searchId, listingId, state: 'SAVED' })}>Запази</button>}
            {searchId && listingId && <button className="btn" onClick={() => void callTool('set_property_result_state', { searchId, listingId, state: 'DISMISSED' })}>Скрий</button>}
          </div>
        </div>;
      }) : <div className="panel"><Empty text="Няма резултати по текущите критерии." /></div>}
    </div>
    {searchId && <section className="section"><div className="detail-card stack"><div className="field"><label>Добави критерий</label><input className="input" value={criterion} onChange={(e) => setCriterion(e.target.value)} placeholder="Напр. само с паркомясто" /></div><button className="btn primary" disabled={!criterion.trim()} onClick={() => { void callTool('add_property_criterion', { searchId, text: criterion.trim() }); setCriterion(''); }}>Добави</button></div></section>}
  </>;
}

function SellDraft({ payload, callTool, requestConfirm }: ViewProps) {
  const data = record(payload.data);
  const draft = record(data.draft || data);
  const draftId = String(draft.id || data.draftId || '');
  const [description, setDescription] = useState(String(draft.description || draft.text || ''));
  const [title, setTitle] = useState(String(draft.title || ''));
  const [price, setPrice] = useState(draft.price != null ? String(draft.price) : '');
  const [condition, setCondition] = useState(String(draft.condition || 'USED'));
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const stage = String(draft.stage || draft.status || 'DRAFT');

  const save = () => draftId && void callTool('update_sell_draft', { draftId, patch: { title, description, price: price ? Number(price) : null, condition } });
  const upload = async () => {
    if (!draftId || !files.length) return;
    setUploading(true);
    try {
      const prepared = await callTool('prepare_sell_upload', { draftId, files: files.map((f) => ({ name: f.name, type: f.type || 'application/octet-stream', size: f.size })) });
      const sc = prepared?.structuredContent as unknown as KokiWidgetPayload | undefined;
      const pd = record(sc?.data);
      const targets = arr(pd.uploadTargets || pd.targets);
      if (targets.length === files.length) {
        const uploaded: AnyRecord[] = [];
        for (let i = 0; i < targets.length; i++) {
          const t = record(targets[i]);
          const response = await fetch(String(t.uploadUrl || t.url), { method: String(t.method || 'PUT'), headers: record(t.headers), body: files[i] });
          if (!response.ok) throw new Error(`UPLOAD_${response.status}`);
          uploaded.push({ id: t.id || t.fileId || t.key, key: t.key, name: files[i].name });
        }
        await callTool('update_sell_draft', { draftId, patch: { uploadedImages: uploaded } });
      }
    } finally { setUploading(false); }
  };

  return <>
    <PageHead eyebrow="Нова продажба" title={String(draft.title || 'Подготви обявата')} subtitle={stage} />
    <div className="progress">{[0,1,2,3,4].map((n) => <span key={n} className={stageRank(stage) >= n ? 'on' : ''} />)}</div>
    <section className="section"><div className="detail-card stack">
      <div className="field"><label>Снимки · до 5</label><input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0,5))} /><div className="file-grid">{files.map((f, i) => <div className="file-cell" key={`${f.name}:${i}`}><span>{i+1}<br/>{f.name.slice(0,10)}</span></div>)}{files.length < 5 && <button className="file-cell" onClick={() => fileInput.current?.click()}>+ снимки</button>}</div></div>
      {files.length > 0 && <button className="btn" disabled={uploading || !draftId} onClick={() => void upload()}>{uploading ? 'Качване…' : 'Качи снимките'}</button>}
      <div className="form-grid"><div className="field"><label>Състояние</label><select className="select" value={condition} onChange={(e) => setCondition(e.target.value)}><option value="NEW">Ново</option><option value="USED">Използвано</option></select></div><div className="field"><label>Цена</label><input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="€" /></div></div>
      <div className="field"><label>Заглавие</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <div className="field"><label>Описание</label><textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      <button className="btn" disabled={!draftId} onClick={save}>Запази</button>
    </div></section>
    <section className="section"><SectionHead title="KOKI анализ" /><div className="btns">
      <button className="btn violet" disabled={!draftId} onClick={() => void callTool('analyze_sell_draft', { draftId })}>Продукт и категория</button>
      <button className="btn" disabled={!draftId} onClick={() => void callTool('analyze_market', { draftId })}>Пазарна цена</button>
      <button className="btn" disabled={!draftId} onClick={() => void callTool('optimize_sell_draft', { draftId, fields: ['TITLE','DESCRIPTION'] })}>Оптимизирай текста</button>
    </div></section>
    {data.marketAnalysis && <section className="section"><Intel title="Пазарна цена" text={summaryOf(data.marketAnalysis)} confidence={data.marketAnalysis.confidence} /></section>}
    {data.optimization && <section className="section"><Intel title="Предложения" text={summaryOf(data.optimization)} /></section>}
    <section className="section"><div className="btns">
      <button className="btn" disabled={!draftId} onClick={() => void callTool('validate_sell_draft', { draftId })}>Преглед и проверка</button>
      <button className="btn primary" disabled={!draftId} onClick={() => requestConfirm('Публикуване', 'Това ще публикува обявата във външната платформа чрез съществуващия KOKI publish flow.', 'publish_sell_draft', { draftId, reviewVersion: draft.reviewVersion })}>Публикувай</button>
      <button className="btn danger" disabled={!draftId} onClick={() => requestConfirm('Изтрий черновата', 'Черновата ще бъде изтрита окончателно.', 'delete_sell_draft', { draftId })}>Изтрий</button>
    </div></section>
  </>;
}

function Notifications({ payload, callTool }: ViewProps) {
  const data = record(payload.data); const items = arr(data.notifications || data.items);
  return <><PageHead eyebrow="Activity feed" title="Известия" subtitle={`${items.filter((x: AnyRecord) => x.unread).length} непрочетени`} />
    <div className="panel">{items.length ? items.map((n: AnyRecord) => <div className="row" key={idOf(n)}><div className="thumb">{n.unread ? '●' : '○'}</div><div><div className="row-title">{n.title}</div><div className="row-meta"><span>{n.subtitle}</span><span>{ago(n.createdAt)}</span></div></div><div>{n.unread && <button className="btn" onClick={() => void callTool('mark_notifications_read', { ids: [idOf(n)] })}>Прочетено</button>}</div></div>) : <Empty text="Няма известия." />}</div>
    {items.some((x: AnyRecord) => x.unread) && <section className="section"><button className="btn" onClick={() => void callTool('mark_notifications_read', { all: true })}>Маркирай всички</button></section>}
  </>;
}

function Profile({ payload, callTool, requestConfirm, openLink }: ViewProps) {
  const data = record(payload.data); const profile = record(data.profile || data); const connections = arr(profile.connections || data.connections);
  const connect = async (marketplace: string) => { const r = await callTool('connect_marketplace', { marketplace }); const sc = r?.structuredContent as unknown as KokiWidgetPayload | undefined; const d = record(sc?.data); const url = d.authorizationUrl || d.url; if (url) await openLink(String(url)); };
  return <><PageHead eyebrow="KOKI account" title={String(profile.name || 'Профил')} subtitle="Профилът и marketplace връзките остават в KOKI." />
    <section className="section"><SectionHead title="Свързани платформи" /><div className="panel">{connections.length ? connections.map((c: AnyRecord) => <div className="row" key={String(c.platform)}><div className="thumb">{String(c.platform).slice(0,2)}</div><div><div className="row-title">{c.platform}</div><div className="row-meta"><span className={`badge ${String(c.status).toLowerCase()==='connected'?'good':'warn'}`}>{c.status}</span></div></div><div>{String(c.status).toLowerCase()==='connected' ? <button className="btn danger" onClick={() => requestConfirm('Откачи платформа', `Ще прекъснем връзката с ${c.platform}, без да трием KOKI историята.`, 'disconnect_marketplace', { marketplace: c.platform })}>Откачи</button> : <button className="btn primary" onClick={() => void connect(String(c.platform))}>Свържи</button>}</div></div>) : <Empty text="Няма данни за връзки." />}</div></section>
    {profile.address && <section className="section"><SectionHead title="Адрес" /><div className="detail-card"><div className="keyvals">{Object.entries(record(profile.address)).map(([k,v]) => <KV key={k} k={k} v={v} />)}</div></div></section>}
    <section className="section"><div className="btns"><button className="btn" onClick={() => void callTool('get_settings')}>Настройки</button><button className="btn" onClick={() => void callTool('get_connections')}>Обнови връзките</button></div></section>
  </>;
}

function Settings({ payload, callTool }: ViewProps) {
  const data = record(payload.data); const settings = record(data.settings || data); const [local, setLocal] = useState<AnyRecord>({ ...settings });
  const toggles = [['automation','Автоматизации'],['push','Push известия'],['newMessages','Нови съобщения'],['decisions','За решение'],['searchResults','Нови search резултати']];
  const flip = (key: string) => { const next = { ...local, [key]: !local[key] }; setLocal(next); void callTool('update_settings', { patch: { [key]: next[key] } }); };
  return <><PageHead eyebrow="Поведение" title="Настройки" subtitle="Hard safety/risk правилата не могат да се изключват оттук." /><div className="detail-card">{toggles.map(([key,label]) => <div className="switch-row" key={key}><div className="switch-copy"><b>{label}</b><span>{local[key] ? 'Включено' : 'Изключено'}</span></div><button className={`switch ${local[key] ? 'on' : ''}`} aria-label={label} onClick={() => flip(key)}><i /></button></div>)}</div></>;
}

function StatusView({ payload }: ViewProps) {
  const data = record(payload.data);
  return <><PageHead eyebrow="System health" title="Статус" subtitle="Оперативното състояние е отделно от бизнес решенията." /><div className="detail-card"><div className="keyvals">{Object.entries(data).filter(([,v]) => typeof v !== 'object').map(([k,v]) => <KV key={k} k={k} v={v} />)}</div>{Object.keys(data).length===0 && <Empty text="Няма status данни." />}</div></>;
}

function ErrorView({ payload }: ViewProps) {
  const data = record(payload.data);
  return <><PageHead eyebrow="Грешка" title={payload.title || 'Коки не успя'} subtitle={String(data.code || '')} /><div className="notice error"><b>Какво се случи</b><br />{humanError(String(data.code || 'KOKI_ACTION_FAILED'))}<br /><br /><b>Какво остана запазено</b><br />Коки не приема неуспешен write за успех. Текущото състояние остава source of truth в backend-а.</div></>;
}

function GenericView({ payload }: ViewProps) {
  return <><PageHead eyebrow="KOKI" title={payload.title || payload.action} /><pre className="json">{JSON.stringify(payload.data, null, 2)}</pre></>;
}

function CreateSheet({ onClose, callTool }: { onClose: () => void; callTool: ViewProps['callTool'] }) {
  return <div className="overlay" onClick={onClose}><div className="sheet" onClick={(e) => e.stopPropagation()}><h2>Какво искаш да направиш?</h2><p>Същите KOKI flows, директно вътре в ChatGPT.</p><div className="create-grid"><button className="create-card" onClick={() => { onClose(); void callTool('list_property_searches'); }}><div className="create-icon">⌕</div><b>Търся</b><span>Намери имот чрез естествен език и реални source-backed резултати.</span></button><button className="create-card" onClick={() => { onClose(); void callTool('create_sell_draft', { marketplace: 'OLX' }); }}><div className="create-icon">＋</div><b>Продавам</b><span>Създай SELL draft, анализирай, оптимизирай и публикувай.</span></button></div><div className="confirm-actions" style={{ marginTop: 12 }}><button className="btn" onClick={onClose}>Затвори</button></div></div></div>;
}

interface ViewProps {
  payload: KokiWidgetPayload;
  callTool: (tool: string, args?: AnyRecord) => Promise<any>;
  requestConfirm: (title: string, text: string, tool: string, args: AnyRecord) => void;
  openLink: (url?: string | null) => Promise<void>;
}

function ConnectionState({ title, text }: { title: string; text: string }) { return <div className="app"><div className="header"><div className="mark">K</div><div className="brand"><b>KOKI</b><span>{title}</span></div></div><div className="body"><div className="skeleton" /><p className="muted">{text}</p></div></div>; }
function PageHead({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) { return <div className="page-head"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{subtitle && <div className="muted" style={{ marginTop: 4 }}>{subtitle}</div>}</div></div>; }
function SectionHead({ title, count }: { title: string; count?: number }) { return <div className="section-head"><b>{title}</b>{count != null && <span className="count">{count}</span>}</div>; }
function Stat({ value, label, onClick }: { value: number; label: string; onClick?: () => void }) { const el = <><strong>{value}</strong><span>{label}</span></>; return onClick ? <button className="stat" style={{ textAlign:'left' }} onClick={onClick}>{el}</button> : <div className="stat">{el}</div>; }
function Empty({ text }: { text: string }) { return <div className="empty">{text}</div>; }
function KV({ k, v }: { k: string; v: any }) { return <div className="kv"><span>{k}</span><span>{formatValue(v)}</span></div>; }
function Intel({ title, text, confidence }: { title: string; text: string; confidence?: number }) { const pct = confidence == null ? null : Math.max(0, Math.min(100, Number(confidence) <= 1 ? Number(confidence)*100 : Number(confidence))); return <div className="intel"><div className="intel-rail" /><div className="intel-body"><div className="intel-title">{title}</div><div className="intel-text">{text}</div>{pct != null && <><div className="meter"><span style={{ width: `${pct}%` }} /></div><div className="muted" style={{ marginTop:4 }}>Увереност {Math.round(pct)}%</div></>}</div></div>; }
function OperationRow({ item, onClick }: { item: AnyRecord; onClick: () => void }) { return <button className="row clickable" onClick={onClick}><div className="thumb">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : (item.direction === 'SELL' ? '↑' : item.direction === 'BUY' ? '↓' : '◇')}</div><div><div className="row-title">{item.title || 'Операция'}</div><div className="row-meta"><span>{item.marketplace}</span><span>{item.direction}</span>{item.status && <span className={`badge ${statusClass(item.status)}`}>{item.status}</span>}{num(item.unreadCount)>0 && <span className="badge primary">{item.unreadCount} нови</span>}</div></div><div className="row-side"><div className="price">{money(item.price, item.currency)}</div>{item.targetPrice!=null && <div className="time">цел {money(item.targetPrice, item.currency)}</div>}<div className="time">{ago(item.lastInteractionAt)}</div></div></button>; }
function MessageBubble({ message }: { message: AnyRecord }) { const sender = String(message.sender || '').toUpperCase(); const cls = sender === 'USER' ? 'me' : sender === 'KOKI' ? 'koki' : ''; return <div className={`bubble ${cls}`}><div>{message.text || (message.imageUrl ? 'Снимка' : '')}</div>{message.translatedText && <div className="translation"><b>Превод:</b> {message.translatedText}</div>}<div className="bubble-time">{sender || 'MESSAGE'} · {ago(message.createdAt)}</div></div>; }

function record(value: unknown): AnyRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : {}; }
function arr(value: unknown): any[] { return Array.isArray(value) ? value : []; }
function num(value: unknown): number { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function idOf(value: AnyRecord): string { return String(value.id || value.listingId || value.conversationId || value.draftId || value.searchId || value.notificationId || ''); }
function formatValue(value: any): string { if (value == null || value === '') return '—'; if (typeof value === 'boolean') return value ? 'Да' : 'Не'; if (typeof value === 'object') return JSON.stringify(value); return String(value); }
function money(value: unknown, currency = 'EUR'): string { const n = Number(value); if (!Number.isFinite(n)) return '—'; try { return new Intl.NumberFormat('bg-BG',{style:'currency',currency:String(currency || 'EUR'),maximumFractionDigits:0}).format(n); } catch { return `${n} ${currency || 'EUR'}`; } }
function ago(value: unknown): string { if (!value) return ''; const date = new Date(String(value)); if (Number.isNaN(date.getTime())) return String(value); const sec = Math.max(0, Math.round((Date.now()-date.getTime())/1000)); if (sec<60) return 'сега'; if (sec<3600) return `преди ${Math.floor(sec/60)} мин.`; if (sec<86400) return `преди ${Math.floor(sec/3600)} ч.`; return `преди ${Math.floor(sec/86400)} д.`; }
function tabLabel(value: string): string { return ({ALL:'Всички',ACTIVE:'Активни',WAITING:'Чакащи',COMPLETED:'Завършени'} as AnyRecord)[value] || value; }
function automationLabel(value: unknown): string { const s=String(value||'').toUpperCase(); if(!s) return 'Статус'; if(s.includes('HUMAN')) return 'Поет ръчно'; if(s.includes('STOP')) return 'Коки е спрян'; if(s.includes('PAUSE')) return 'Защитна пауза'; if(s.includes('ACTIVE')||s.includes('RUN')) return 'Коки работи'; return String(value); }
function statusClass(value: unknown): string { const s=String(value||'').toUpperCase(); if(s.includes('ACTIVE')||s.includes('COMPLETED')||s.includes('PUBLISHED')) return 'good'; if(s.includes('WAIT')||s.includes('PAUSE')||s.includes('ATTENTION')) return 'warn'; if(s.includes('ERROR')||s.includes('FAIL')) return 'danger'; return ''; }
function stageRank(value: string): number { const s=value.toUpperCase(); if(s.includes('PUBLISH')&& !s.includes('READY')) return 4; if(s.includes('REVIEW')||s.includes('READY')) return 3; if(s.includes('MARKET')||s.includes('ANALYZ')) return 2; if(s.includes('DETAIL')) return 1; return 0; }
function summaryOf(value: unknown): string { if (value == null) return '—'; if (typeof value === 'string') return value; const r=record(value); return String(r.summary || r.reason || r.recommendation || r.proposal || r.text || JSON.stringify(value)); }
function humanError(code: string): string { const map: AnyRecord={KOKI_API_NOT_CONFIGURED:'KOKI gateway още не е вързан към production backend.',KOKI_UPSTREAM_TIMEOUT:'KOKI backend не отговори навреме.',KOKI_UPSTREAM_FAILED:'Неуспешна връзка с KOKI backend.',SEARCH_NOT_FOUND:'Търсенето вече не съществува.',AUTHENTICATION_REQUIRED:'Нужна е повторна KOKI автентикация.',REVIEW_STALE:'Прегледът е променен. Обнови го преди публикуване.'}; return map[code] || code; }
function openOperation(item: AnyRecord, callTool: ViewProps['callTool']) { const id=idOf(item); if(item.conversationId) void callTool('get_conversation',{conversationId:String(item.conversationId)}); else if(id) void callTool('get_listing',{listingId:id}); }
function extractToolText(result: any): string { return arr(result?.content).filter((x: AnyRecord)=>x.type==='text').map((x:AnyRecord)=>x.text).join(' '); }
async function copyMessages(messages: any[]) { const text=messages.map((m:AnyRecord)=>`[${m.sender||'MESSAGE'}] ${m.text||''}${m.translatedText?`\nПревод: ${m.translatedText}`:''}`).join('\n\n'); try { await navigator.clipboard.writeText(text); } catch { /* clipboard may be unavailable in sandbox */ } }
