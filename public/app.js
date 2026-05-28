let currentToken = null;
let checksRemaining = 0;

const CHECKS_PER_TOKEN = 5;

async function init() {
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get('t');

  if (urlToken) {
    // Validate existing token
    try {
      const res = await fetch(`/api/token/${urlToken}`);
      if (res.ok) {
        const data = await res.json();
        currentToken = urlToken;
        checksRemaining = data.checksRemaining;
        updateTokenUI();
        return;
      }
    } catch {}
  }

  // Generate new token
  try {
    const res = await fetch('/api/token');
    const data = await res.json();
    currentToken = data.token;
    checksRemaining = data.checksRemaining;
    const newUrl = `${window.location.pathname}?t=${currentToken}`;
    window.history.replaceState({}, '', newUrl);
    updateTokenUI();
  } catch (err) {
    console.error('Failed to get token', err);
  }
}

function updateTokenUI(remaining) {
  if (remaining !== undefined) checksRemaining = remaining;
  const pct = (checksRemaining / CHECKS_PER_TOKEN) * 100;

  document.getElementById('tokenFill').style.width = pct + '%';
  document.getElementById('tokenFillResults').style.width = pct + '%';

  const label = `${checksRemaining} of ${CHECKS_PER_TOKEN} checks remaining on your link`;
  document.getElementById('tokenLabel').textContent = label;
  document.getElementById('tokenLabelResults').textContent = label;

  const btn = document.getElementById('checkBtn');
  if (checksRemaining <= 0) {
    btn.disabled = true;
    btn.textContent = 'No checks left';
  }
}

function setUrl(domain) {
  document.getElementById('urlInput').value = domain;
  document.getElementById('urlInput').focus();
}

function goBack() {
  document.getElementById('results').classList.add('hidden');
  document.getElementById('landing').classList.remove('hidden');
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.activeElement === document.getElementById('urlInput')) {
    runCheck();
  }
});

async function runCheck() {
  const urlInput = document.getElementById('urlInput');
  const url = urlInput.value.trim();
  if (!url) { urlInput.focus(); return; }
  if (!currentToken) { alert('Token not ready yet, please wait.'); return; }
  if (checksRemaining <= 0) { alert('No checks remaining on this link.'); return; }

  // Show loading
  document.getElementById('loadingUrl').textContent = url.replace(/^https?:\/\//, '');
  document.getElementById('loadingOverlay').classList.remove('hidden');
  document.getElementById('checkBtn').disabled = true;

  try {
    const res = await fetch('/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, token: currentToken }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || 'Check failed');
      return;
    }

    updateTokenUI(data.checksRemaining);
    renderResults(data);
  } catch (err) {
    alert('Network error: ' + err.message);
  } finally {
    document.getElementById('loadingOverlay').classList.add('hidden');
    document.getElementById('checkBtn').disabled = checksRemaining <= 0;
  }
}

function renderResults(data) {
  // Score circle
  document.getElementById('scorePct').textContent = data.percentage;
  document.getElementById('checkedUrl').textContent = data.url;

  const circle = document.getElementById('scoreCircle');
  const badge = document.getElementById('gradeBadge');
  badge.textContent = data.gradeLabel;
  badge.className = 'grade-badge';

  if (data.percentage >= 80) {
    circle.style.borderColor = 'var(--pass)';
    circle.style.boxShadow = '0 0 30px rgba(78,232,180,0.3)';
  } else if (data.percentage >= 60) {
    circle.style.borderColor = 'var(--warn)';
    circle.style.boxShadow = '0 0 30px rgba(245,200,66,0.2)';
    badge.classList.add('warn');
  } else {
    circle.style.borderColor = 'var(--fail)';
    circle.style.boxShadow = '0 0 30px rgba(232,91,78,0.2)';
    badge.classList.add('fail');
  }

  // Checks grid
  const grid = document.getElementById('checksGrid');
  grid.innerHTML = '';

  data.results.forEach((check, i) => {
    const scorePct = check.maxScore > 0 ? Math.round((check.score / check.maxScore) * 100) : 0;
    const icon = check.status === 'pass' ? '✓' : check.status === 'warning' ? '!' : '✗';

    const card = document.createElement('div');
    card.className = 'check-card';
    card.style.animationDelay = `${i * 0.05}s`;
    card.innerHTML = `
      <div class="check-top">
        <div>
          <div class="check-name">${check.name}</div>
          <div class="check-category">${check.category}</div>
        </div>
        <div class="check-status ${check.status}">${icon}</div>
      </div>
      <div class="check-detail">${check.detail}</div>
      <div class="check-score">
        <span>${check.score}/${check.maxScore}</span>
        <div class="score-bar">
          <div class="score-bar-fill ${check.status}" style="width: ${scorePct}%"></div>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });

  // Switch views
  document.getElementById('landing').classList.add('hidden');
  document.getElementById('results').classList.remove('hidden');
  window.scrollTo(0, 0);
}

init();
