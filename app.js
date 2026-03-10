/* ── STREAMOVA APP.JS ── */

let providers = [];
let answers = {};
let currentStep = 1;
const totalSteps = 4;

/* ── LOAD DATA ── */
async function loadProviders() {
  try {
    const res = await fetch('./data/providers.json');
    providers = await res.json();
  } catch (e) {
    console.error('Fehler beim Laden der Anbieter:', e);
  }
}

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', async () => {
  await loadProviders();
  initFAQ();
  initNav();
  updateProgress();
  renderPreview();
});

/* ── NAV ── */
function initNav() {
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      document.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth' });
    });
  });
}

/* ── SURVEY PROGRESS ── */
function updateProgress() {
  const pct = ((currentStep - 1) / totalSteps) * 100;
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('step-counter').textContent = `Schritt ${currentStep} von ${totalSteps}`;
}

/* ── OPTION SELECT ── */
function selectOption(btn, questionKey, value) {
  const group = btn.closest('.options');
  group.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  answers[questionKey] = value;

  // Update check marks
  group.querySelectorAll('.check').forEach(c => c.textContent = '');
  btn.querySelector('.check').textContent = '✓';

  renderPreview();
}

/* ── MULTI-SELECT ── */
function toggleOption(btn, questionKey, value) {
  if (!answers[questionKey]) answers[questionKey] = [];
  const idx = answers[questionKey].indexOf(value);
  if (idx > -1) {
    answers[questionKey].splice(idx, 1);
    btn.classList.remove('selected');
    btn.querySelector('.check').textContent = '';
  } else {
    answers[questionKey].push(value);
    btn.classList.add('selected');
    btn.querySelector('.check').textContent = '✓';
  }
  renderPreview();
}

/* ── NAVIGATION ── */
function nextStep() {
  if (currentStep < totalSteps) {
    document.getElementById(`step-${currentStep}`).classList.remove('active');
    currentStep++;
    document.getElementById(`step-${currentStep}`).classList.add('active');
    updateProgress();
  } else {
    showResults();
  }
}

function prevStep() {
  if (currentStep > 1) {
    document.getElementById(`step-${currentStep}`).classList.remove('active');
    currentStep--;
    document.getElementById(`step-${currentStep}`).classList.add('active');
    updateProgress();
  }
}

/* ── RECOMMENDATION ENGINE ── */
function getRecommendations() {
  const {
    budget = 'egal',
    content = [],
    contract = 'flex',
    household = 'solo'
  } = answers;

  const maxBudget = budget === 'unter20' ? 20 : budget === 'unter40' ? 40 : 999;
  const wantsLive = content.includes('live');
  const wantsSports = content.includes('sports');
  const wantsKids = content.includes('kids');
  const wantsMovies = content.includes('movies');
  const wantsSeries = content.includes('series');

  let scored = providers.map(p => {
    let score = 0;
    const price = p.monthlyPrice;

    // Budget filter
    if (price > maxBudget) return null;

    // Contract filter
    if (contract === 'flex' && p.contractMonths > 1) return null;

    // Content scoring
    if (wantsLive && p.hasLive) score += 30;
    if (wantsSports && p.hasSports) score += 25;
    if (wantsKids && p.hasKids) score += 20;
    if (wantsMovies && p.hasMovies) score += 20;
    if (wantsSeries && p.hasSeries) score += 20;

    // Value score (cheaper = higher)
    score += Math.max(0, 15 - price);

    // Household streams
    if (household === 'family' && p.maxStreams >= 4) score += 10;

    return { ...p, score };
  }).filter(Boolean);

  // Sort by score
  scored.sort((a, b) => b.score - a.score);

  // Deduplicate by content overlap – keep top unique picks
  const picks = [];
  const covered = { live: false, sports: false, movies: false, series: false, kids: false };

  for (const p of scored) {
    if (picks.length >= 3) break;
    const addsValue =
      (wantsLive && p.hasLive && !covered.live) ||
      (wantsSports && p.hasSports && !covered.sports) ||
      (wantsMovies && p.hasMovies && !covered.movies) ||
      (wantsSeries && p.hasSeries && !covered.series) ||
      (wantsKids && p.hasKids && !covered.kids) ||
      picks.length === 0;

    if (addsValue) {
      picks.push(p);
      if (p.hasLive) covered.live = true;
      if (p.hasSports) covered.sports = true;
      if (p.hasMovies) covered.movies = true;
      if (p.hasSeries) covered.series = true;
      if (p.hasKids) covered.kids = true;
    }
  }

  return picks.length ? picks : scored.slice(0, 3);
}

/* ── BUILD REASON TEXT ── */
function buildReason(p) {
  const parts = [];
  const { content = [] } = answers;
  if (content.includes('live') && p.hasLive) parts.push('Live-TV');
  if (content.includes('sports') && p.hasSports) parts.push('Sport');
  if (content.includes('movies') && p.hasMovies) parts.push('Filme');
  if (content.includes('series') && p.hasSeries) parts.push('Serien');
  if (content.includes('kids') && p.hasKids) parts.push('Kinderinhalte');
  if (!parts.length) return p.description;
  return `Passend für: ${parts.join(', ')} — ${p.description}`;
}

/* ── BUILD TAGS ── */
function buildTags(p) {
  const tags = [];
  if (p.hasLive) tags.push('Live-TV');
  if (p.hasSports) tags.push('Sport');
  if (p.hasMovies) tags.push('Filme');
  if (p.hasSeries) tags.push('Serien');
  if (p.hasKids) tags.push('Kids');
  if (p.quality === '4K') tags.push('4K');
  if (p.contractMonths === 1) tags.push('Monatlich kündbar');
  return tags;
}

/* ── LIVE PREVIEW ── */
function renderPreview() {
  const container = document.getElementById('preview-items');
  const totalEl = document.getElementById('preview-total-price');

  if (!providers.length || !Object.keys(answers).length) {
    container.innerHTML = '<p class="preview-empty">Beantworte die Fragen links,<br>um eine Vorschau zu sehen.</p>';
    totalEl.textContent = '–';
    return;
  }

  const picks = getRecommendations();
  if (!picks.length) {
    container.innerHTML = '<p class="preview-empty">Keine passenden Anbieter gefunden.</p>';
    totalEl.textContent = '–';
    return;
  }

  const total = picks.reduce((s, p) => s + p.monthlyPrice, 0);
  totalEl.textContent = `CHF ${total.toFixed(2)} / Mt.`;

  container.innerHTML = picks.map(p => `
    <div class="preview-item">
      <div class="provider-dot" style="background:${p.color}">${p.logo}</div>
      <div class="preview-info">
        <div class="preview-name">${p.name}</div>
        <div class="preview-price">CHF ${p.monthlyPrice.toFixed(2)} / Mt.</div>
        <div class="preview-reason">${buildReason(p).substring(0, 60)}…</div>
      </div>
    </div>
  `).join('');
}

/* ── SHOW RESULTS ── */
function showResults() {
  const picks = getRecommendations();
  const resultsSection = document.getElementById('results');
  const cardsEl = document.getElementById('result-cards');
  const summaryEl = document.getElementById('results-total');

  if (!picks.length) {
    cardsEl.innerHTML = '<p style="color:var(--text-2)">Keine Anbieter gefunden. Passe dein Budget oder deine Anforderungen an.</p>';
  } else {
    const total = picks.reduce((s, p) => s + p.monthlyPrice, 0);
    summaryEl.textContent = `CHF ${total.toFixed(2)} / Monat`;

    cardsEl.innerHTML = picks.map((p, i) => `
      <div class="result-card ${i === 0 ? 'top-pick' : ''}">
        ${i === 0 ? '<div class="top-badge">Beste Wahl</div>' : ''}
        <div class="card-header">
          <div class="card-logo" style="background:${p.color}">${p.logo}</div>
          <div>
            <div class="card-name">${p.name}</div>
            <div class="card-price">CHF ${p.monthlyPrice.toFixed(2)} / Monat</div>
          </div>
        </div>
        <p class="card-reason">${buildReason(p)}</p>
        <div class="card-tags">${buildTags(p).map(t => `<span class="tag">${t}</span>`).join('')}</div>
      </div>
    `).join('');
  }

  resultsSection.style.display = 'block';
  setTimeout(() => resultsSection.scrollIntoView({ behavior: 'smooth' }), 100);
}

/* ── RESTART ── */
function restartSurvey() {
  answers = {};
  currentStep = 1;
  document.querySelectorAll('.survey-step').forEach(s => s.classList.remove('active'));
  document.getElementById('step-1').classList.add('active');
  document.querySelectorAll('.option-btn').forEach(b => {
    b.classList.remove('selected');
    b.querySelector('.check').textContent = '';
  });
  document.getElementById('results').style.display = 'none';
  updateProgress();
  renderPreview();
  document.getElementById('survey').scrollIntoView({ behavior: 'smooth' });
}

/* ── FAQ ── */
function initFAQ() {
  document.querySelectorAll('.faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      item.classList.toggle('open');
    });
  });
}
