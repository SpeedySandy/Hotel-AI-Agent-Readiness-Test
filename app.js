const CORS_PROXY = 'https://api.allorigins.win/get?url=';
const CHECKS_PER_TOKEN = 5;

let currentToken = null;
let checksRemaining = 0;

const CATEGORIES = [
  { id: 'foundation',      name: 'Foundation',             icon: '◈', weight: 0.10,
    checkIds: ['robots','llms','sitemap','markdown'] },
  { id: 'structured-data', name: 'Hotel Structured Data',  icon: '⬡', weight: 0.30,
    checkIds: ['schema-hotel','schema-room','schema-amenity','schema-offer','schema-geo','schema-rating'] },
  { id: 'booking',         name: 'Booking & Transactions', icon: '◉', weight: 0.30,
    checkIds: ['ucp','availability-api','direct-booking','oauth','payment'] },
  { id: 'content',         name: 'Content & Discovery',    icon: '◎', weight: 0.15,
    checkIds: ['open-graph','faq-schema','images','mcp-server'] },
  { id: 'freshness',       name: 'Freshness & Realtime',   icon: '◷', weight: 0.10,
    checkIds: ['cache-signals','live-feed','cache-control'] },
  { id: 'trust',           name: 'Trust & Compliance',     icon: '◐', weight: 0.05,
    checkIds: ['https','privacy','accessibility'] },
];

// ── Token ─────────────────────────────────────────────────────────────────────

function initToken() {
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get('t');
  if (urlToken) {
    currentToken = urlToken;
    if (localStorage.getItem('hac-' + urlToken) === null)
      localStorage.setItem('hac-' + urlToken, CHECKS_PER_TOKEN);
  } else {
    const stored = localStorage.getItem('hac-token');
    if (stored && localStorage.getItem('hac-' + stored) !== null) {
      currentToken = stored;
    } else {
      currentToken = Array.from(crypto.getRandomValues(new Uint8Array(5))).map(b => b.toString(16).padStart(2,'0')).join('');
      localStorage.setItem('hac-token', currentToken);
      localStorage.setItem('hac-' + currentToken, CHECKS_PER_TOKEN);
    }
    window.history.replaceState({}, '', '?t=' + currentToken);
  }
  checksRemaining = parseInt(localStorage.getItem('hac-' + currentToken) || '0');
  updateTokenUI();
}

function consumeCheck() {
  if (checksRemaining <= 0) return false;
  checksRemaining--;
  localStorage.setItem('hac-' + currentToken, checksRemaining);
  return true;
}

function updateTokenUI() {
  const pct = (checksRemaining / CHECKS_PER_TOKEN) * 100;
  document.querySelectorAll('.token-fill').forEach(el => el.style.width = pct + '%');
  const label = `${checksRemaining} of ${CHECKS_PER_TOKEN} checks remaining on your link`;
  document.querySelectorAll('.token-label-text').forEach(el => el.textContent = label);
  const btn = document.getElementById('checkBtn');
  if (checksRemaining <= 0) { btn.disabled = true; btn.textContent = 'No checks left'; }
  else { btn.disabled = false; btn.textContent = 'Check →'; }
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function proxyFetch(url, ms = 12000) {
  const t0 = Date.now();
  try {
    const res = await Promise.race([
      fetch(CORS_PROXY + encodeURIComponent(url)),
      new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms)),
    ]);
    const elapsed = Date.now() - t0;
    if (!res.ok) return { error: 'HTTP ' + res.status, status: res.status, elapsed };
    const json = await res.json();
    return { data: json.contents || '', status: json.status?.http_code ?? 200, elapsed };
  } catch (e) {
    return { error: e.message, elapsed: Date.now() - t0 };
  }
}

function normalizeUrl(raw) {
  raw = raw.trim();
  if (!/^https?:\/\//.test(raw)) raw = 'https://' + raw;
  try { return new URL(raw).origin; } catch { return null; }
}

// ── Schema helpers ────────────────────────────────────────────────────────────

function extractSchemas(html) {
  const out = [];
  for (const m of (html||'').matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { out.push(...[].concat(JSON.parse(m[1]))); } catch {}
  }
  return out;
}

function hasType(schemas, ...types) {
  return schemas.some(s => types.some(t => ('' + (s['@type']||'')).toLowerCase().includes(t.toLowerCase())));
}

function findType(schemas, ...types) {
  return schemas.find(s => types.some(t => ('' + (s['@type']||'')).toLowerCase().includes(t.toLowerCase())));
}

// ── Checks ────────────────────────────────────────────────────────────────────

async function runChecks(baseUrl) {
  const updateRow = (key, statusText, ok) => {
    const el = document.getElementById('lc-' + key);
    if (!el) return;
    const s = el.querySelector('.lc-status');
    s.textContent = statusText;
    s.className = 'lc-status ' + (ok ? 'ok' : 'fail');
  };

  const fetchAndUpdate = async (key, url) => {
    const res = await proxyFetch(url);
    const ok = !res.error && res.status === 200;
    updateRow(key, ok ? res.status + ' OK' : (res.status === 404 ? '404 Not found' : (res.error || 'error')), ok);
    return res;
  };

  const [mainRes, robotsRes, llmsRes, sitemapRes, mcpRes] = await Promise.all([
    fetchAndUpdate('homepage', baseUrl),
    fetchAndUpdate('robots.txt', baseUrl + '/robots.txt'),
    fetchAndUpdate('llms.txt', baseUrl + '/llms.txt'),
    fetchAndUpdate('sitemap.xml', baseUrl + '/sitemap.xml'),
    fetchAndUpdate('.well-known/mcp/server-card.json', baseUrl + '/.well-known/mcp/server-card.json'),
  ]);

  const homepageOk = !mainRes.error && mainRes.status === 200;
  updateRow('homepage',
    homepageOk ? (baseUrl.startsWith('https') ? 'HTTPS OK · schema scanned' : 'HTTP · schema scanned') : (mainRes.error || 'error'),
    homepageOk);

  const html = mainRes.data || '';
  const low  = html.toLowerCase();
  const schemas = extractSchemas(html);
  const hotelSchema = findType(schemas, 'hotel', 'lodgingbusiness', 'accommodation');

  const robotsOk  = !robotsRes.error && robotsRes.status === 200 && (robotsRes.data||'').length > 10;
  const llmsOk    = !llmsRes.error   && llmsRes.status  === 200 && (llmsRes.data  ||'').length > 20;
  const sitemapOk = !sitemapRes.error && sitemapRes.status === 200;
  const mcpOk     = !mcpRes.error    && mcpRes.status   === 200 && (mcpRes.data   ||'').length > 10;
  const isHttps   = baseUrl.startsWith('https://');

  const hasHotel   = !!hotelSchema;
  const hasRoom    = hasType(schemas,'hotelroom');
  const hasAmenity = hasType(schemas,'locationfeaturespecification') || !!(hotelSchema?.amenityFeature?.length);
  const hasOffer   = hasType(schemas,'offer') || !!(hotelSchema?.priceRange);
  const hasGeo     = hasType(schemas,'geocoordinates') || !!(hotelSchema?.geo);
  const hasRating  = hasType(schemas,'aggregaterating') || !!(hotelSchema?.aggregateRating);
  const hasFaq     = hasType(schemas,'faqpage','question');
  const hasOG      = low.includes('property="og:') || low.includes("property='og:");
  const hasPrivacy = low.includes('privacy') || low.includes('datenschutz');

  const bookingKws = ['book now','check availability','book direct','reserve now','best rate','book a room','buchen','reservierung'];
  const hasBooking = bookingKws.some(k => low.includes(k));

  const apiKws = ['availab','booking-engine','reservation-api','bookassist','siteminder','cloudbeds','apaleo','mews','guestline','protel'];
  const hasApi = apiKws.some(k => low.includes(k));

  const payKws = ['visa','mastercard','amex','stripe','paypal','payment'];
  const hasPay = payKws.some(k => low.includes(k));

  const hasLive = ['websocket','socket.io','real-time','realtime'].some(k => low.includes(k));
  const hasA11y = html.includes('aria-') && low.includes('lang=') && low.includes('alt=');

  const mk = (id, cat, name, method, pass, statusText) => ({
    id, category: cat, name,
    verificationMethod: method,
    status: pass === null ? 'skip' : pass ? 'pass' : 'fail',
    statusText,
  });

  return [
    mk('robots',         'foundation',     'AI access rules (robots.txt)',    'live',      robotsOk,   robotsOk  ? '200 OK'                          : '404 not found'),
    mk('llms',           'foundation',     'AI summary page (llms.txt)',      'live',      llmsOk,     llmsOk    ? '200 OK'                          : '404 not found'),
    mk('sitemap',        'foundation',     'Content map (sitemap.xml)',       'live',      sitemapOk,  sitemapOk ? '200 OK'                          : 'not found'),
    mk('markdown',       'foundation',     'Markdown delivery',               'skipped',   null,       'needs header check'),

    mk('schema-hotel',   'structured-data','Hotel info (LodgingBusiness)',    'live',      hasHotel,   hasHotel  ? 'found'                           : 'not found'),
    mk('schema-room',    'structured-data','Room types (HotelRoom)',          'live',      hasRoom,    hasRoom   ? 'found'                           : 'HotelRoom schema missing'),
    mk('schema-amenity', 'structured-data','Spa & amenities',                 'live',      hasAmenity, hasAmenity? 'found'                           : 'Amenity schema not found'),
    mk('schema-offer',   'structured-data','Pricing / rates',                 'live',      hasOffer,   hasOffer  ? 'found'                           : 'Offer/pricing schema not found'),
    mk('schema-geo',     'structured-data','Location coordinates',            'live',      hasGeo,     hasGeo    ? 'found'                           : 'GeoCoordinates not found'),
    mk('schema-rating',  'structured-data','Reviews & ratings',               'live',      hasRating,  hasRating ? 'found'                           : 'AggregateRating not found'),

    mk('ucp',            'booking',        'Agentic booking (UCP)',           'skipped',   null,       'not verifiable'),
    mk('availability-api','booking',       'Live availability API',           'estimated', hasApi,     hasApi    ? 'API detected'                    : 'no API endpoints detected'),
    mk('direct-booking', 'booking',        'Direct booking engine',           'live',      hasBooking, hasBooking? 'booking functionality found'      : 'not detected'),
    mk('oauth',          'booking',        'Guest identity (OAuth)',          'skipped',   null,       'developer check required'),
    mk('payment',        'booking',        'Payment methods',                 'estimated', hasPay,     hasPay    ? 'payment options found'           : 'payment method schema not detected'),

    mk('open-graph',     'content',        'Social previews (Open Graph)',    'live',      hasOG,      hasOG     ? 'Open Graph tags found'           : 'Open Graph meta tags missing'),
    mk('faq-schema',     'content',        'Guest Q&A (FAQ schema)',         'live',      hasFaq,     hasFaq    ? 'FAQPage found'                    : 'FAQPage schema not found'),
    mk('images',         'content',        'Image descriptions',             'skipped',   null,       'needs inspection'),
    mk('mcp-server',     'content',        'AI agent entry point (MCP)',     'live',      mcpOk,      mcpOk     ? '200 OK'                          : '404 not found'),

    mk('cache-signals',  'freshness',      'HTTP cache signals',             'skipped',   null,       'run curl -I'),
    mk('live-feed',      'freshness',      'Live conditions feed',           'estimated', hasLive,    hasLive   ? 'real-time signals found'          : 'real-time data feeds not detected'),
    mk('cache-control',  'freshness',      'Cache-Control headers',          'skipped',   null,       'run curl -I'),

    mk('https',          'trust',          'Secure connection (HTTPS)',      'live',      isHttps,    isHttps   ? 'valid certificate'                : 'not using HTTPS'),
    mk('privacy',        'trust',          'Privacy policy',                 'live',      hasPrivacy, hasPrivacy? 'privacy policy linked'            : 'no privacy policy found'),
    mk('accessibility',  'trust',          'Accessibility basics',           'estimated', hasA11y || null, hasA11y ? 'accessibility features found' : 'basic accessibility features need verification'),
  ];
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function computeScore(checks) {
  const byId = Object.fromEntries(checks.map(c => [c.id, c]));
  let total = 0;
  const catResults = CATEGORIES.map(cat => {
    const catChecks = cat.checkIds.map(id => byId[id]).filter(Boolean);
    const counted   = catChecks.filter(c => c.status !== 'skip');
    const passed    = counted.filter(c => c.status === 'pass');
    const pct = counted.length ? passed.length / counted.length : 0;
    total += pct * cat.weight;
    return { ...cat, checks: catChecks, pct: Math.round(pct * 100) };
  });
  const percentage = Math.round(total * 100);
  const [grade, gradeLabel] =
    percentage >= 80 ? ['A','Agent Ready'] :
    percentage >= 60 ? ['B','Mostly Ready'] :
    percentage >= 40 ? ['C','Needs Work'] :
                       ['D','Not Ready'];
  return { percentage, grade, gradeLabel, catResults };
}

// ── Summary ───────────────────────────────────────────────────────────────────

function generateSummary(baseUrl, checks, pct) {
  const domain = new URL(baseUrl).hostname.replace(/^www\./,'');
  const byId   = Object.fromEntries(checks.map(c => [c.id, c]));

  const missNames = { llms:'llms.txt','schema-hotel':'Hotel schema','schema-room':'HotelRoom schema',
    'schema-geo':'GeoCoordinates','schema-rating':'AggregateRating','mcp-server':'MCP server card','schema-offer':'pricing schema' };
  const miss = Object.keys(missNames).filter(id => byId[id]?.status !== 'pass').map(id => missNames[id]);

  const strengthNames = { https:'HTTPS', robots:'robots.txt', 'direct-booking':'direct booking', privacy:'privacy policy' };
  const strengths = Object.keys(strengthNames).filter(id => byId[id]?.status === 'pass').map(id => strengthNames[id]);

  const st = strengths.length ? `The site has ${strengths.join(', ')} in place. ` : '';
  const mt = miss.slice(0,3).join(', ');

  if (pct >= 80) return `${domain} is well-prepared for AI agent discovery. ${st}Minor improvements could further optimise agent interactions.`;
  if (pct >= 60) return `${domain} has solid foundations but needs structured data to be fully agent-ready. ${st}Key gaps: ${mt}.`;
  if (pct >= 40) return `${domain} has basic infrastructure but lacks essential AI agent readiness features. ${st}Critical missing elements include ${mt} and modern AI integration features.`;
  return `${domain} has ${strengths.length ? 'basic technical infrastructure with ' + strengths.join(', ') : 'minimal AI agent readiness'}, but lacks essential features. Critical missing elements include ${mt}${byId['mcp-server']?.status !== 'pass' ? ' and MCP server support' : ''}.`;
}

// ── Recommendations ───────────────────────────────────────────────────────────

function generateRecs(baseUrl, checks) {
  const domain = new URL(baseUrl).hostname;
  const byId   = Object.fromEntries(checks.map(c => [c.id, c]));
  const fail   = id => byId[id]?.status !== 'pass';
  const weeks = [], quarters = [], years = [];

  if (fail('llms')) weeks.push({
    title: 'Create an AI summary page', subtitle: 'Confirmed missing',
    effort: 'Marketing · 1 hr',
    codeLabel: 'Save as `llms.txt` at your website root. Every AI assistant reads this first.',
    copyUrl: `${baseUrl}/llms.txt`,
    code: `# ${domain}\n\n> Your hotel description here\n\n## Key pages\n- Rooms: /rooms\n- Spa: /spa\n- Restaurant: /restaurant\n- Book: /booking`,
  });

  if (fail('schema-rating')) weeks.push({
    title: 'Add structured rating to homepage', effort: 'Webmaster · 1 hr',
    codeLabel: 'Paste into your homepage &lt;head&gt;',
    code: `<script type="application/ld+json">\n{"@context":"https://schema.org","@type":"Hotel",\n"name":"${domain}","aggregateRating":\n{"@type":"AggregateRating","ratingValue":"9.0",\n"reviewCount":"300","bestRating":"10"}}\n<\/script>`,
  });

  weeks.push({
    title: "Register for Google's agentic booking programme",
    effort: 'GM / Revenue · 15 min',
    note: 'Free, 15 minutes. developers.google.com/hotels/ucp',
  });

  if (fail('schema-hotel') || fail('schema-room')) quarters.push({
    title: 'Make rooms and rates readable for AI',
    subtitle: 'Add HotelRoom and Offer schema so AI agents can compare your offering.',
    effort: 'Developer · 1–2 days', impact: '~12 pts',
  });

  if (fail('faq-schema')) quarters.push({
    title: 'Expand FAQ to cover spa, dining, check-in',
    subtitle: 'Structured Q&A so agents can answer guest questions directly.',
    effort: 'Developer · Half day',
  });

  years.push({
    title: 'Make in-stay experiences bookable for AI',
    subtitle: 'Spa, activities, dining — structured and PMS-connected so agents can book in real time.',
    effort: 'GM + IT · 4–8 weeks',
  });
  years.push({
    title: 'Implement agentic direct booking (UCP)',
    subtitle: 'Saves 18–22% OTA commission on every booking agents route to you.',
    effort: 'Revenue + Tech · 2–3 months',
  });

  return { weeks, quarters, years };
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function setUrl(d) { document.getElementById('urlInput').value = d; document.getElementById('urlInput').focus(); }
function goBack() { document.getElementById('results').classList.add('hidden'); document.getElementById('landing').classList.remove('hidden'); }
function colorFor(p) { return p >= 70 ? 'var(--pass)' : p >= 40 ? 'var(--warn)' : 'var(--fail)'; }
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── Entry ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initToken();
  document.getElementById('urlInput').addEventListener('keydown', e => { if (e.key === 'Enter') runCheck(); });
});

async function runCheck() {
  const input = document.getElementById('urlInput');
  const raw   = input.value.trim();
  if (!raw) { input.focus(); return; }
  if (checksRemaining <= 0) { alert('No checks remaining on this link.'); return; }

  const baseUrl = normalizeUrl(raw);
  if (!baseUrl) { alert('Invalid URL'); return; }
  if (!consumeCheck()) return;

  document.getElementById('loadingUrl').textContent = baseUrl.replace(/^https?:\/\//,'');
  const LC = document.getElementById('loadingChecks');
  LC.innerHTML = '';
  [
    ['robots.txt',                      'robots.txt'],
    ['llms.txt',                        'llms.txt'],
    ['sitemap.xml',                     'sitemap.xml'],
    ['.well-known/mcp/server-card.json','.well-known/mcp/server-card.json'],
    ['homepage',                        'homepage (HTTPS + Schema.org)'],
  ].forEach(([key, label]) => {
    const row = document.createElement('div');
    row.className = 'lc-row';
    row.id = 'lc-' + key;
    row.innerHTML = `<span class="lc-name">${label}</span><span class="lc-status checking">checking…</span>`;
    LC.appendChild(row);
  });

  document.getElementById('loadingOverlay').classList.remove('hidden');
  document.getElementById('checkBtn').disabled = true;

  try {
    const checks = await runChecks(baseUrl);
    await new Promise(r => setTimeout(r, 400));

    const { percentage, grade, gradeLabel, catResults } = computeScore(checks);
    const summary = generateSummary(baseUrl, checks, percentage);
    const recs    = generateRecs(baseUrl, checks);

    renderResults({ url: baseUrl, checks, percentage, grade, gradeLabel, catResults, summary, recs });
  } catch (err) {
    alert('Check failed: ' + err.message);
    checksRemaining++;
    localStorage.setItem('hac-' + currentToken, checksRemaining);
  } finally {
    document.getElementById('loadingOverlay').classList.add('hidden');
    updateTokenUI();
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderResults({ url, checks, percentage, grade, gradeLabel, catResults, summary, recs }) {
  document.getElementById('scorePct').textContent = percentage;
  document.getElementById('checkedUrlText').textContent = url;
  document.getElementById('summaryText').textContent = summary;

  const col = colorFor(percentage);
  const circle = document.getElementById('scoreCircle');
  circle.style.borderColor = col;
  circle.style.boxShadow = `0 0 32px ${col}55`;

  const prefix = percentage >= 80 ? '★' : percentage >= 60 ? '◆' : '▲';
  const badge  = document.getElementById('gradeBadge');
  badge.textContent = `${prefix} ${gradeLabel} · ${percentage}/100`;
  badge.className = 'grade-badge ' + (percentage >= 80 ? 'gpass' : percentage >= 60 ? 'gwarn' : 'gfail');

  document.getElementById('liveCheckResults').innerHTML = document.getElementById('loadingChecks').innerHTML;

  const grid = document.getElementById('categoryGrid');
  grid.innerHTML = '';
  catResults.forEach(cat => {
    const c = colorFor(cat.pct);
    const div = document.createElement('div');
    div.className = 'cat-card';
    div.innerHTML = `
      <div class="cat-header"><span class="cat-icon">${cat.icon}</span><span class="cat-name">${cat.name}</span></div>
      <div class="cat-pct" style="color:${c}">${cat.pct}%</div>
      <div class="cat-weight">${Math.round(cat.weight*100)}% weight</div>
      <div class="cat-bar"><div class="cat-bar-fill" style="width:${cat.pct}%;background:${c}"></div></div>`;
    grid.appendChild(div);
  });

  const detail = document.getElementById('checksDetail');
  detail.innerHTML = '';
  catResults.forEach(cat => {
    const sec = document.createElement('div');
    sec.className = 'detail-section';
    sec.innerHTML = `<div class="detail-cat-head">${cat.icon} ${cat.name}</div>`;
    cat.checks.forEach(c => {
      const icon  = c.status === 'pass' ? '✓' : c.status === 'skip' ? '—' : '✗';
      const cls   = c.status === 'pass' ? 'pass' : c.status === 'skip' ? 'skip' : 'fail';
      const mlabel = { live:'✓ Live', estimated:'~ Estimated', skipped:'— Skipped' }[c.verificationMethod];
      const mcls   = { live:'ml', estimated:'me', skipped:'ms' }[c.verificationMethod];
      const row = document.createElement('div');
      row.className = 'detail-row';
      row.innerHTML = `
        <span class="dicon ${cls}">${icon}</span>
        <span class="dname">${c.name}</span>
        <span class="dmethod ${mcls}">${mlabel}</span>
        <span class="dstatus">${c.statusText}</span>`;
      sec.appendChild(row);
    });
    detail.appendChild(sec);
  });

  renderRecs(recs);

  const gap = Math.max(0, 80 - percentage);
  document.getElementById('revenueSection').innerHTML = `
    <h3 class="rev-title">⚡ What this means for your revenue</h3>
    <p class="rev-text">Google expanded UCP to hotel booking in May 2026. Without structured data and booking integrations, agent-referred guests default to OTA checkout — costing 18–22% commission on your highest-intent bookings.</p>
    <div class="rev-metrics">
      <div class="metric"><div class="metric-val">18%</div><div class="metric-label">avg. OTA commission per booking</div></div>
      <div class="metric"><div class="metric-val">${percentage}/100</div><div class="metric-label">your current score</div></div>
      <div class="metric"><div class="metric-val">${gap} pts</div><div class="metric-label">gap to Agent-Ready</div></div>
    </div>`;

  document.getElementById('landing').classList.add('hidden');
  document.getElementById('results').classList.remove('hidden');
  window.scrollTo(0,0);
}

function renderRecs({ weeks, quarters, years }) {
  const el = document.getElementById('recommendations');
  el.innerHTML = '';

  const addSection = (label, sub, items) => {
    if (!items.length) return;
    const sec = document.createElement('div');
    sec.innerHTML = `<div class="rec-horizon">${label} <span class="rec-horizon-sub">${sub}</span></div>`;
    items.forEach((rec, i) => {
      const card = document.createElement('div');
      card.className = 'rec-card';
      let extra = '';
      if (rec.note) extra += `<div class="rec-note">${rec.note}</div>`;
      if (rec.subtitle && !rec.code) extra += `<div class="rec-sub">${rec.subtitle}</div>`;
      if (rec.code) {
        extra += `<div class="rec-code-label">${rec.codeLabel||''}</div><pre class="rec-code">${escHtml(rec.code)}</pre>`;
        if (rec.copyUrl) extra += `<div class="rec-copy-url">Copy → upload to <span>${rec.copyUrl}</span></div>`;
      }
      card.innerHTML = `
        <div class="rec-num">0${i+1}</div>
        <div class="rec-body">
          <div class="rec-title">${rec.title}${rec.subtitle&&rec.code?` <span class="rec-conf">${rec.subtitle}</span>`:''}${rec.impact?` <span class="rec-impact">${rec.impact}</span>`:''}</div>
          <div class="rec-effort">${rec.effort||''}</div>
          ${extra}
        </div>`;
      sec.appendChild(card);
    });
    el.appendChild(sec);
  };

  addSection('This week',     'No developer needed',                  weeks);
  addSection('This quarter',  'Needs your developer · 1–3 days',      quarters);
  addSection('This year',     'Strategic decisions · Highest impact',  years);
}
