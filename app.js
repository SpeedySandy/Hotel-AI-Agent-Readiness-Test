const CORS_PROXY = 'https://api.allorigins.win/get?url=';
const CHECKS_PER_TOKEN = 5;

let currentToken = null;
let checksRemaining = 0;

const AI_BOTS = ['gptbot', 'claudebot', 'anthropic-ai', 'bingbot', 'perplexitybot', 'ccbot', 'youbot'];

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
      currentToken = Array.from(crypto.getRandomValues(new Uint8Array(5))).map(b => b.toString(16).padStart(2, '0')).join('');
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
  updateTokenUI();
  return true;
}

function updateTokenUI() {
  const pct = (checksRemaining / CHECKS_PER_TOKEN) * 100;
  document.getElementById('tokenFill').style.width = pct + '%';
  document.getElementById('tokenFillResults').style.width = pct + '%';
  const label = `${checksRemaining} of ${CHECKS_PER_TOKEN} checks remaining on your link`;
  document.getElementById('tokenLabel').textContent = label;
  document.getElementById('tokenLabelResults').textContent = label;
  const btn = document.getElementById('checkBtn');
  if (checksRemaining <= 0) { btn.disabled = true; btn.textContent = 'No checks left'; }
  else { btn.disabled = false; btn.textContent = 'Check →'; }
}

async function proxyFetch(url, timeoutMs = 12000) {
  const start = Date.now();
  try {
    const res = await Promise.race([
      fetch(CORS_PROXY + encodeURIComponent(url)),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
    ]);
    const elapsed = Date.now() - start;
    if (!res.ok) return { error: 'HTTP ' + res.status, elapsed };
    const json = await res.json();
    return { data: json.contents || '', status: json.status?.http_code ?? 200, elapsed };
  } catch (err) {
    return { error: err.message, elapsed: Date.now() - start };
  }
}

function normalizeUrl(raw) {
  raw = raw.trim();
  if (!raw.startsWith('http://') && !raw.startsWith('https://')) raw = 'https://' + raw;
  try { return new URL(raw).origin; } catch { return null; }
}

async function runChecks(baseUrl) {
  const results = [];
  const isHttps = baseUrl.startsWith('https://');
  results.push({ id: 'https', name: 'HTTPS Enabled', category: 'Security',
    score: isHttps ? 5 : 0, maxScore: 5, status: isHttps ? 'pass' : 'fail',
    detail: isHttps ? 'Site uses a secure HTTPS connection' : 'Site does not use HTTPS — agents prefer secure connections' });

  const [mainRes, robotsRes, llmsRes, sitemapRes] = await Promise.all([
    proxyFetch(baseUrl), proxyFetch(baseUrl + '/robots.txt'),
    proxyFetch(baseUrl + '/llms.txt'), proxyFetch(baseUrl + '/sitemap.xml'),
  ]);

  if (!mainRes.error) {
    const fast = mainRes.elapsed < 2000, ok = mainRes.elapsed < 5000;
    results.push({ id: 'speed', name: 'Response Speed', category: 'Performance',
      score: fast ? 5 : ok ? 3 : 0, maxScore: 5, status: fast ? 'pass' : ok ? 'warning' : 'fail',
      detail: `Page responded in ${mainRes.elapsed}ms${fast ? ' — excellent' : ok ? ' — acceptable' : ' — too slow for agents'}` });
  } else {
    results.push({ id: 'speed', name: 'Response Speed', category: 'Performance',
      score: 0, maxScore: 5, status: 'fail', detail: 'Could not reach site: ' + mainRes.error });
  }

  const robotsOk = !robotsRes.error && robotsRes.status === 200 && (robotsRes.data || '').length > 0;
  const robotsText = (robotsRes.data || '').toLowerCase();
  results.push({ id: 'robots', name: 'robots.txt Present', category: 'Crawlability',
    score: robotsOk ? 5 : 2, maxScore: 5, status: robotsOk ? 'pass' : 'warning',
    detail: robotsOk ? 'robots.txt found' : 'No robots.txt — agents must assume defaults' });

  if (robotsOk) {
    const blocksAll = robotsText.includes('user-agent: *') && /disallow:\s*\/\s*(\n|$)/.test(robotsText);
    const blocksAI = AI_BOTS.some(bot => { const idx = robotsText.indexOf('user-agent: ' + bot); if (idx === -1) return false; return /disallow:\s*\/\s*(\n|$)/.test(robotsText.slice(idx)); });
    results.push({ id: 'ai-bots', name: 'AI Crawlers Allowed', category: 'Crawlability',
      score: (blocksAll || blocksAI) ? 0 : 15, maxScore: 15, status: (blocksAll || blocksAI) ? 'fail' : 'pass',
      detail: (blocksAll || blocksAI) ? 'robots.txt blocks AI crawlers — agents cannot index this site' : 'AI crawlers are permitted to access the site' });
  } else {
    results.push({ id: 'ai-bots', name: 'AI Crawlers Allowed', category: 'Crawlability',
      score: 8, maxScore: 15, status: 'warning', detail: 'No robots.txt — crawler policy unclear' });
  }

  const hasLlms = !llmsRes.error && llmsRes.status === 200 && (llmsRes.data || '').length > 20;
  results.push({ id: 'llms-txt', name: 'llms.txt Present', category: 'AI Readiness',
    score: hasLlms ? 20 : 0, maxScore: 20, status: hasLlms ? 'pass' : 'fail',
    detail: hasLlms ? 'llms.txt found — site provides structured context for AI agents' : 'No llms.txt — add this file to give AI agents direct access to key info' });

  const hasSitemap = !sitemapRes.error && sitemapRes.status === 200;
  results.push({ id: 'sitemap', name: 'Sitemap Present', category: 'Discoverability',
    score: hasSitemap ? 5 : 0, maxScore: 5, status: hasSitemap ? 'pass' : 'fail',
    detail: hasSitemap ? 'sitemap.xml found — helps agents navigate site structure' : 'No sitemap.xml detected' });

  const html = (mainRes.data || '').toLowerCase();
  const rawHtml = mainRes.data || '';

  let hasHotelSchema = false, hasAnySchema = false;
  for (const m of rawHtml.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const items = [].concat(JSON.parse(m[1])); items.forEach(item => { if (item['@type']) { hasAnySchema = true; const t = ('' + item['@type']).toLowerCase(); if (t.includes('hotel') || t.includes('lodging') || t.includes('accommodation')) hasHotelSchema = true; } }); } catch {}
  }
  results.push({ id: 'schema', name: 'Hotel Schema Markup', category: 'Structured Data',
    score: hasHotelSchema ? 15 : hasAnySchema ? 7 : 0, maxScore: 15,
    status: hasHotelSchema ? 'pass' : hasAnySchema ? 'warning' : 'fail',
    detail: hasHotelSchema ? 'Hotel/LodgingBusiness schema.org markup found' : hasAnySchema ? 'Some structured data found but no Hotel schema — add LodgingBusiness markup' : 'No JSON-LD structured data — agents cannot read property details' });

  const hasOG = html.includes('property="og:') || html.includes("property='og:");
  const hasTitle = html.includes('<title') && html.includes('<meta name="description');
  results.push({ id: 'meta', name: 'Rich Meta Tags', category: 'Structured Data',
    score: hasOG ? 5 : hasTitle ? 3 : 0, maxScore: 5, status: hasOG ? 'pass' : hasTitle ? 'warning' : 'fail',
    detail: hasOG ? 'Open Graph meta tags present — machine-readable metadata available' : hasTitle ? 'Basic meta tags found but no Open Graph markup' : 'Missing meta tags — agents cannot read property description' });

  const bookingKws = ['book now', 'check availability', 'book direct', 'reserve', 'best rate guarantee', 'check rates', 'book a room'];
  const otaKws = ['booking.com', 'expedia.com', 'hotels.com', 'agoda.com', 'priceline.com'];
  const hasBooking = bookingKws.some(k => html.includes(k));
  const hasOTA = otaKws.some(k => html.includes(k));
  results.push({ id: 'booking', name: 'Direct Booking Engine', category: 'Bookability',
    score: hasBooking && !hasOTA ? 15 : hasBooking ? 8 : 0, maxScore: 15,
    status: hasBooking && !hasOTA ? 'pass' : hasBooking ? 'warning' : 'fail',
    detail: hasBooking && !hasOTA ? 'Direct booking engine detected — guests can book without OTA intermediaries' : hasBooking ? 'Booking capability found but OTA links detected' : 'No direct booking engine detected — agents will route through OTAs (18–22% commission)' });

  const hasAddress = html.includes('streetaddress') || html.includes('"address"') || html.includes('itemprop="address"') || html.includes('itemprop="telephone"');
  results.push({ id: 'contact', name: 'Structured Contact Info', category: 'Structured Data',
    score: hasAddress ? 10 : 0, maxScore: 10, status: hasAddress ? 'pass' : 'warning',
    detail: hasAddress ? 'Address and contact info found in machine-readable format' : 'No structured contact/address data detected' });

  const totalScore = results.reduce((s, r) => s + r.score, 0);
  const maxScore = results.reduce((s, r) => s + r.maxScore, 0);
  const percentage = Math.round((totalScore / maxScore) * 100);
  let grade, gradeLabel;
  if (percentage >= 80) { grade = 'A'; gradeLabel = 'Agent Ready'; }
  else if (percentage >= 60) { grade = 'B'; gradeLabel = 'Mostly Ready'; }
  else if (percentage >= 40) { grade = 'C'; gradeLabel = 'Needs Work'; }
  else { grade = 'D'; gradeLabel = 'Not Ready'; }
  return { results, totalScore, maxScore, percentage, grade, gradeLabel };
}

function setUrl(domain) { document.getElementById('urlInput').value = domain; document.getElementById('urlInput').focus(); }
function goBack() { document.getElementById('results').classList.add('hidden'); document.getElementById('landing').classList.remove('hidden'); }

document.addEventListener('DOMContentLoaded', () => {
  initToken();
  document.getElementById('urlInput').addEventListener('keydown', e => { if (e.key === 'Enter') runCheck(); });
});

async function runCheck() {
  const urlInput = document.getElementById('urlInput');
  const url = urlInput.value.trim();
  if (!url) { urlInput.focus(); return; }
  if (checksRemaining <= 0) { alert('No checks remaining on this link.'); return; }
  if (!consumeCheck()) { alert('No checks remaining on this link.'); return; }
  document.getElementById('loadingUrl').textContent = url.replace(/^https?:\/\//, '');
  document.getElementById('loadingOverlay').classList.remove('hidden');
  document.getElementById('checkBtn').disabled = true;
  try {
    const baseUrl = normalizeUrl(url);
    if (!baseUrl) { alert('Invalid URL'); return; }
    const data = await runChecks(baseUrl);
    renderResults({ url: baseUrl, ...data });
  } catch (err) {
    alert('Check failed: ' + err.message);
    checksRemaining++;
    localStorage.setItem('hac-' + currentToken, checksRemaining);
    updateTokenUI();
  } finally {
    document.getElementById('loadingOverlay').classList.add('hidden');
    updateTokenUI();
  }
}

function renderResults(data) {
  document.getElementById('scorePct').textContent = data.percentage;
  document.getElementById('checkedUrl').textContent = data.url;
  const circle = document.getElementById('scoreCircle');
  const badge = document.getElementById('gradeBadge');
  badge.textContent = data.gradeLabel;
  badge.className = 'grade-badge';
  if (data.percentage >= 80) { circle.style.borderColor = 'var(--pass)'; circle.style.boxShadow = '0 0 30px rgba(78,232,180,0.3)'; }
  else if (data.percentage >= 60) { circle.style.borderColor = 'var(--warn)'; circle.style.boxShadow = '0 0 30px rgba(245,200,66,0.2)'; badge.classList.add('warn'); }
  else { circle.style.borderColor = 'var(--fail)'; circle.style.boxShadow = '0 0 30px rgba(232,91,78,0.2)'; badge.classList.add('fail'); }
  const grid = document.getElementById('checksGrid');
  grid.innerHTML = '';
  data.results.forEach((check, i) => {
    const scorePct = check.maxScore > 0 ? Math.round((check.score / check.maxScore) * 100) : 0;
    const icon = check.status === 'pass' ? '✓' : check.status === 'warning' ? '!' : '✗';
    const card = document.createElement('div');
    card.className = 'check-card';
    card.style.animationDelay = `${i * 0.05}s`;
    card.innerHTML = `<div class="check-top"><div><div class="check-name">${check.name}</div><div class="check-category">${check.category}</div></div><div class="check-status ${check.status}">${icon}</div></div><div class="check-detail">${check.detail}</div><div class="check-score"><span>${check.score}/${check.maxScore}</span><div class="score-bar"><div class="score-bar-fill ${check.status}" style="width:${scorePct}%"></div></div></div>`;
    grid.appendChild(card);
  });
  document.getElementById('landing').classList.add('hidden');
  document.getElementById('results').classList.remove('hidden');
  window.scrollTo(0, 0);
}