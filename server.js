const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const tokenStore = new Map();

const CHECKS_PER_TOKEN = 5;

const AI_BOTS = ['gptbot', 'claudebot', 'anthropic-ai', 'googlebot', 'bingbot', 'perplexitybot', 'ccbot', 'omgili', 'youbot'];

app.get('/api/token', (req, res) => {
  const token = crypto.randomBytes(5).toString('hex');
  tokenStore.set(token, { checksRemaining: CHECKS_PER_TOKEN, createdAt: Date.now() });
  res.json({ token, checksRemaining: CHECKS_PER_TOKEN });
});

app.get('/api/token/:token', (req, res) => {
  const data = tokenStore.get(req.params.token);
  if (!data) return res.status(404).json({ error: 'Token not found' });
  res.json({ checksRemaining: data.checksRemaining });
});

function normalizeUrl(url) {
  if (!url) return null;
  url = url.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return null;
  }
}

async function fetchUrl(url, timeout = 8000) {
  try {
    const start = Date.now();
    const res = await axios.get(url, {
      timeout,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'HotelAgentChecker/1.0 (hotel readiness analysis)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      validateStatus: () => true,
    });
    const elapsed = Date.now() - start;
    return { data: res.data, status: res.status, elapsed, headers: res.headers };
  } catch (err) {
    return { error: err.message };
  }
}

async function runChecks(baseUrl) {
  const results = [];

  // 1. HTTPS
  const isHttps = baseUrl.startsWith('https://');
  results.push({
    id: 'https',
    name: 'HTTPS Enabled',
    category: 'Security',
    score: isHttps ? 5 : 0,
    maxScore: 5,
    status: isHttps ? 'pass' : 'fail',
    detail: isHttps ? 'Site uses secure HTTPS connection' : 'Site does not use HTTPS — agents prefer secure connections',
  });

  // Fetch main page
  const mainPage = await fetchUrl(baseUrl);

  // 2. Response time
  if (!mainPage.error) {
    const fast = mainPage.elapsed < 2000;
    const ok = mainPage.elapsed < 5000;
    results.push({
      id: 'speed',
      name: 'Response Speed',
      category: 'Performance',
      score: fast ? 5 : ok ? 3 : 0,
      maxScore: 5,
      status: fast ? 'pass' : ok ? 'warning' : 'fail',
      detail: `Page responded in ${mainPage.elapsed}ms${fast ? ' — excellent' : ok ? ' — acceptable' : ' — too slow for agents'}`,
    });
  } else {
    results.push({
      id: 'speed',
      name: 'Response Speed',
      category: 'Performance',
      score: 0,
      maxScore: 5,
      status: 'fail',
      detail: `Could not reach site: ${mainPage.error}`,
    });
  }

  // 3. robots.txt
  const robotsRes = await fetchUrl(baseUrl + '/robots.txt');
  let robotsText = '';
  let robotsExists = false;
  if (!robotsRes.error && robotsRes.status === 200 && typeof robotsRes.data === 'string') {
    robotsText = robotsRes.data.toLowerCase();
    robotsExists = true;
  }
  results.push({
    id: 'robots',
    name: 'robots.txt Present',
    category: 'Crawlability',
    score: robotsExists ? 5 : 2,
    maxScore: 5,
    status: robotsExists ? 'pass' : 'warning',
    detail: robotsExists ? 'robots.txt found' : 'No robots.txt — agents must assume defaults',
  });

  // 4. AI bots allowed
  if (robotsExists) {
    const disallowsAll = robotsText.includes('user-agent: *') && robotsText.includes('disallow: /');
    const explicitlyBlocksAI = AI_BOTS.some(bot =>
      robotsText.includes(`user-agent: ${bot}`) &&
      (robotsText.split(`user-agent: ${bot}`)[1] || '').includes('disallow: /')
    );
    const blocked = disallowsAll || explicitlyBlocksAI;
    results.push({
      id: 'ai-bots',
      name: 'AI Crawlers Allowed',
      category: 'Crawlability',
      score: blocked ? 0 : 15,
      maxScore: 15,
      status: blocked ? 'fail' : 'pass',
      detail: blocked
        ? 'robots.txt blocks AI crawlers — agents cannot index this site'
        : 'AI crawlers are permitted to access the site',
    });
  } else {
    results.push({
      id: 'ai-bots',
      name: 'AI Crawlers Allowed',
      category: 'Crawlability',
      score: 8,
      maxScore: 15,
      status: 'warning',
      detail: 'No robots.txt — crawler policy unclear',
    });
  }

  // 5. llms.txt
  const llmsRes = await fetchUrl(baseUrl + '/llms.txt');
  const hasLlms = !llmsRes.error && llmsRes.status === 200 && typeof llmsRes.data === 'string' && llmsRes.data.length > 20;
  results.push({
    id: 'llms-txt',
    name: 'llms.txt Present',
    category: 'AI Readiness',
    score: hasLlms ? 20 : 0,
    maxScore: 20,
    status: hasLlms ? 'pass' : 'fail',
    detail: hasLlms
      ? 'llms.txt found — site provides structured context for AI agents'
      : 'No llms.txt — add this file to give AI agents direct access to key info',
  });

  // 6. sitemap.xml
  const sitemapRes = await fetchUrl(baseUrl + '/sitemap.xml');
  const hasSitemap = !sitemapRes.error && sitemapRes.status === 200;
  results.push({
    id: 'sitemap',
    name: 'Sitemap Present',
    category: 'Discoverability',
    score: hasSitemap ? 5 : 0,
    maxScore: 5,
    status: hasSitemap ? 'pass' : 'fail',
    detail: hasSitemap ? 'sitemap.xml found — helps agents navigate site structure' : 'No sitemap.xml detected',
  });

  if (!mainPage.error && mainPage.data) {
    const $ = cheerio.load(mainPage.data);

    // 7. JSON-LD / Schema.org structured data
    const jsonLdScripts = $('script[type="application/ld+json"]');
    let hasHotelSchema = false;
    let hasAnySchema = false;
    jsonLdScripts.each((_, el) => {
      try {
        const json = JSON.parse($(el).html());
        const types = Array.isArray(json) ? json : [json];
        types.forEach(item => {
          if (item['@type']) {
            hasAnySchema = true;
            const t = item['@type'].toLowerCase();
            if (t.includes('hotel') || t.includes('lodging') || t.includes('accommodation')) {
              hasHotelSchema = true;
            }
          }
        });
      } catch {}
    });
    results.push({
      id: 'schema',
      name: 'Hotel Schema Markup',
      category: 'Structured Data',
      score: hasHotelSchema ? 15 : hasAnySchema ? 7 : 0,
      maxScore: 15,
      status: hasHotelSchema ? 'pass' : hasAnySchema ? 'warning' : 'fail',
      detail: hasHotelSchema
        ? 'Hotel/LodgingBusiness schema.org markup found — agents can read structured property data'
        : hasAnySchema
        ? 'Some structured data found but no Hotel/LodgingBusiness schema — add specific hotel markup'
        : 'No JSON-LD structured data found — agents cannot read property details',
    });

    // 8. Open Graph / meta tags
    const hasOG = $('meta[property^="og:"]').length > 0;
    const hasTitle = $('meta[name="description"]').length > 0 || $('title').text().trim().length > 0;
    results.push({
      id: 'meta',
      name: 'Rich Meta Tags',
      category: 'Structured Data',
      score: hasOG ? 5 : hasTitle ? 3 : 0,
      maxScore: 5,
      status: hasOG ? 'pass' : hasTitle ? 'warning' : 'fail',
      detail: hasOG
        ? 'Open Graph meta tags present — machine-readable social/agent metadata available'
        : hasTitle
        ? 'Basic meta tags present but no Open Graph markup'
        : 'Missing meta tags — agents cannot read property description',
    });

    // 9. Direct booking capability
    const html = mainPage.data.toLowerCase();
    const bookingKeywords = ['book now', 'check availability', 'reserve', 'book a room', 'book direct', 'best rate guarantee', 'check rates'];
    const otaKeywords = ['booking.com', 'expedia.com', 'hotels.com', 'agoda.com', 'priceline.com'];
    const hasDirectBooking = bookingKeywords.some(k => html.includes(k));
    const reliesOnOTA = otaKeywords.some(k => html.includes(k));
    results.push({
      id: 'booking',
      name: 'Direct Booking Engine',
      category: 'Bookability',
      score: hasDirectBooking && !reliesOnOTA ? 15 : hasDirectBooking ? 8 : 0,
      maxScore: 15,
      status: hasDirectBooking && !reliesOnOTA ? 'pass' : hasDirectBooking ? 'warning' : 'fail',
      detail: hasDirectBooking && !reliesOnOTA
        ? 'Direct booking engine detected — guests can book without OTA intermediaries'
        : hasDirectBooking
        ? 'Booking capability found but OTA links detected — direct booking competes with OTA commissions'
        : 'No direct booking engine detected — agents will route through OTAs (18–22% commission)',
    });

    // 10. Contact/address structured info
    const hasAddress = html.includes('streetaddress') || html.includes('schema.org') ||
      $('[itemprop="address"], [itemprop="telephone"], [class*="address"], [class*="contact"]').length > 0;
    results.push({
      id: 'contact',
      name: 'Structured Contact Info',
      category: 'Structured Data',
      score: hasAddress ? 10 : 0,
      maxScore: 10,
      status: hasAddress ? 'pass' : 'warning',
      detail: hasAddress
        ? 'Address and contact information found in machine-readable format'
        : 'No structured contact/address data detected — agents may struggle to identify the property',
    });
  } else {
    // Can't parse page
    ['schema', 'meta', 'booking', 'contact'].forEach(id => {
      results.push({
        id,
        name: id === 'schema' ? 'Hotel Schema Markup' : id === 'meta' ? 'Rich Meta Tags' : id === 'booking' ? 'Direct Booking Engine' : 'Structured Contact Info',
        category: 'Structured Data',
        score: 0,
        maxScore: id === 'schema' ? 15 : id === 'meta' ? 5 : id === 'booking' ? 15 : 10,
        status: 'fail',
        detail: 'Could not fetch page content',
      });
    });
  }

  const totalScore = results.reduce((sum, r) => sum + r.score, 0);
  const maxScore = results.reduce((sum, r) => sum + r.maxScore, 0);
  const percentage = Math.round((totalScore / maxScore) * 100);

  let grade, gradeLabel;
  if (percentage >= 80) { grade = 'A'; gradeLabel = 'Agent Ready'; }
  else if (percentage >= 60) { grade = 'B'; gradeLabel = 'Mostly Ready'; }
  else if (percentage >= 40) { grade = 'C'; gradeLabel = 'Needs Work'; }
  else { grade = 'D'; gradeLabel = 'Not Ready'; }

  return { results, totalScore, maxScore, percentage, grade, gradeLabel };
}

app.post('/api/check', async (req, res) => {
  const { url, token } = req.body;

  if (!token) return res.status(400).json({ error: 'Token required' });
  const tokenData = tokenStore.get(token);
  if (!tokenData) return res.status(403).json({ error: 'Invalid token. Generate a new link.' });
  if (tokenData.checksRemaining <= 0) return res.status(403).json({ error: 'No checks remaining on this link. Generate a new one.' });

  const baseUrl = normalizeUrl(url);
  if (!baseUrl) return res.status(400).json({ error: 'Invalid URL' });

  tokenData.checksRemaining--;

  try {
    const checkResults = await runChecks(baseUrl);
    res.json({
      url: baseUrl,
      checksRemaining: tokenData.checksRemaining,
      ...checkResults,
    });
  } catch (err) {
    tokenData.checksRemaining++;
    res.status(500).json({ error: 'Check failed: ' + err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Hotel Agent Checker running on http://localhost:${PORT}`));
