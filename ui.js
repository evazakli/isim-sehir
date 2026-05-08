// ============================================================
// UI.JS — DOM render yardımcıları
// ============================================================

import { state, ALL_AVATARS, ALL_CATEGORIES } from './state.js';

// ─────────────────────────────────────────
// SCREEN YÖNETİMİ
// ─────────────────────────────────────────

export function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─────────────────────────────────────────
// TOAST BİLDİRİMİ
// ─────────────────────────────────────────

let _toastTimer;
export function showToast(msg, duration = 2800) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), duration);
}

// ─────────────────────────────────────────
// AVATAR & KATEGORİ SEÇİCİLER
// ─────────────────────────────────────────

export function renderAvatarGrid(onSelect) {
  const grid = document.getElementById('avatar-grid');
  if (!grid) return;
  grid.innerHTML = '';
  ALL_AVATARS.forEach(av => {
    const btn = document.createElement('button');
    btn.className = 'avatar-btn' + (av === state.avatar ? ' selected' : '');
    btn.textContent = av;
    btn.setAttribute('aria-label', av);
    btn.addEventListener('click', () => {
      document.querySelectorAll('.avatar-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      onSelect(av);
    });
    grid.appendChild(btn);
  });
}

export function renderCategoryToggles(onToggle) {
  const group = document.getElementById('category-group');
  if (!group) return;
  group.innerHTML = '';
  ALL_CATEGORIES.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'toggle-btn' + (state.selectedCategories.includes(cat) ? ' active' : '');
    btn.textContent = cat;
    btn.addEventListener('click', () => onToggle(btn, cat));
    group.appendChild(btn);
  });
}

// ─────────────────────────────────────────
// LOBİ
// ─────────────────────────────────────────

export function renderPlayersList() {
  const list  = document.getElementById('players-list');
  const count = document.getElementById('player-count');
  if (!list) return;
  list.innerHTML = '';
  if (count) count.textContent = state.players.length;

  state.players.forEach(p => {
    const chip = document.createElement('div');
    chip.className = 'player-chip';
    const isHost = state.roomData && p.id === state.roomData.host_id;
    chip.innerHTML = `
      <span class="player-avatar">${p.avatar}</span>
      <span class="player-name">${escHtml(p.nickname)}</span>
      ${isHost ? '<span class="crown" title="Oda sahibi">👑</span>' : ''}
      ${p.id === state.playerId ? '<span class="you-tag">(sen)</span>' : ''}
    `;
    list.appendChild(chip);
  });
}

// ─────────────────────────────────────────
// OYUN EKRANI
// ─────────────────────────────────────────

export function renderAnswersGrid(categories, letter) {
  const grid = document.getElementById('answers-grid');
  if (!grid) return;
  grid.innerHTML = '';
  categories.forEach(cat => {
    const row = document.createElement('div');
    row.className = 'answer-row';
    row.innerHTML = `
      <span class="answer-label" title="${cat}">${cat}</span>
      <input
        class="answer-input"
        data-cat="${cat}"
        placeholder="${escHtml(letter)} ile başlayan…"
        maxlength="30"
        autocomplete="off"
        autocorrect="off"
        spellcheck="false"
      />
    `;
    grid.appendChild(row);
  });
  // İlk inputa odaklan (masaüstünde)
  if (window.innerWidth > 640) {
    const first = grid.querySelector('.answer-input');
    if (first) first.focus();
  }
}

export function collectMyAnswers() {
  const result = {};
  document.querySelectorAll('.answer-input').forEach(inp => {
    result[inp.dataset.cat] = inp.value.trim();
  });
  return result;
}

export function lockAnswerInputs() {
  document.querySelectorAll('.answer-input').forEach(inp => {
    inp.disabled = true;
    inp.style.opacity = '0.6';
  });
}

// ─────────────────────────────────────────
// TIMER
// ─────────────────────────────────────────

/**
 * @param {string} endTimeISO   ISO zaman damgası
 * @param {Function} onExpire   Süre dolunca çağrılır
 */
export function startTimer(endTimeISO, onExpire) {
  clearInterval(state.timerInterval);
  const el = document.getElementById('timer');

  function tick() {
    const left = Math.max(0, Math.round((new Date(endTimeISO) - Date.now()) / 1000));
    if (el) {
      el.textContent = left;
      el.className = 'timer-display' + (left <= 10 ? ' urgent' : '');
    }
    if (left <= 0) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
      onExpire();
    }
  }

  tick();
  state.timerInterval = setInterval(tick, 500);
}

export function stopTimer() {
  clearInterval(state.timerInterval);
  state.timerInterval = null;
}

// ─────────────────────────────────────────
// PUANLAMA / LİDERLİK TABLOSU
// ─────────────────────────────────────────

export function renderMiniScores() {
  const container = document.getElementById('mini-scores');
  if (!container) return;
  const sorted = sortedPlayers();
  container.innerHTML = sorted.map(p => `
    <div class="mini-score-row">
      <span class="ms-avatar">${p.avatar}</span>
      <span class="ms-name">${escHtml(p.nickname)}${p.id === state.playerId ? ' <em>(sen)</em>' : ''}</span>
      <span class="score-badge">${p.total_score}</span>
    </div>
  `).join('');
}

export function renderLeaderboard(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const sorted = sortedPlayers();
  const medals = ['🥇','🥈','🥉'];
  container.innerHTML = sorted.map((p, i) => `
    <div class="lb-row${i === 0 ? ' first' : ''}">
      <div class="lb-rank">${medals[i] || (i + 1)}</div>
      <div class="lb-avatar">${p.avatar}</div>
      <div class="lb-name">
        ${escHtml(p.nickname)}
        ${p.id === state.playerId ? '<span class="you-tag">(sen)</span>' : ''}
      </div>
      <div class="lb-score-col">
        <div class="lb-score">${p.total_score}</div>
        <div class="lb-round-score">+${p.last_round_score} bu tur</div>
      </div>
    </div>
  `).join('');
}

/** Sıralama: toplam puan → son tur puanı → daha az çakışma */
function sortedPlayers() {
  return [...state.players].sort((a, b) => {
    if (b.total_score !== a.total_score) return b.total_score - a.total_score;
    if (b.last_round_score !== a.last_round_score) return b.last_round_score - a.last_round_score;
    return a.collision_count - b.collision_count;
  });
}

// ─────────────────────────────────────────
// OYLAMA EKRANI
// ─────────────────────────────────────────

/**
 * @param {string[]} categories
 * @param {string}   letter
 * @param {Function} onVote  (answerId, isValid) => void
 */
export function renderVotingCards(categories, letter, onVote) {
  const container = document.getElementById('vote-categories-container');
  if (!container) return;
  container.innerHTML = '';

  categories.forEach(cat => {
    const catAnswers = state.answers.filter(a => a.category === cat);
    if (catAnswers.length === 0) return;

    const section = document.createElement('div');
    section.className = 'vote-category-section';

    let html = `<div class="vote-category-title">${cat}</div>`;

    catAnswers.forEach(ans => {
      const player    = state.players.find(p => p.id === ans.player_id);
      const isMe      = ans.player_id === state.playerId;
      const txt       = (ans.answer || '').trim();
      const autoInvalid = isAutoInvalid(txt, letter);

      // Ön doldur
      if (autoInvalid && state.myVotes[ans.id] === undefined) {
        state.myVotes[ans.id] = false;
      } else if (isMe && state.myVotes[ans.id] === undefined) {
        state.myVotes[ans.id] = true;
      }

      html += `
        <div class="vote-answer-row" data-id="${ans.id}">
          <div class="vote-player-info">
            <span class="vp-avatar">${player ? player.avatar : '❓'}</span>
            <div class="vp-details">
              <div class="vp-name">${player ? escHtml(player.nickname) : '?'}${isMe ? ' <em>(sen)</em>' : ''}</div>
              ${txt
                ? `<div class="vote-answer-text">${escHtml(txt)}</div>`
                : `<div class="vote-answer-empty">— boş —</div>`}
            </div>
          </div>
          <div class="vote-verdict">
            ${isMe
              ? `<span class="verdict-tag valid">SEN</span>`
              : autoInvalid
                ? `<span class="verdict-tag invalid">GEÇERSİZ</span>`
                : `<div class="vote-btns">
                    <button class="vote-yes-btn${state.myVotes[ans.id] === true ? ' selected' : ''}"
                            id="yes-${ans.id}" onclick="window._castVote('${ans.id}',true)">✓ Evet</button>
                    <button class="vote-no-btn${state.myVotes[ans.id] === false ? ' selected' : ''}"
                            id="no-${ans.id}" onclick="window._castVote('${ans.id}',false)">✗ Hayır</button>
                   </div>`
            }
          </div>
        </div>`;
    });

    section.innerHTML = html;
    container.appendChild(section);
  });

  // Global bridge (inline onclick için)
  window._castVote = (answerId, isValid) => {
    state.myVotes[answerId] = isValid;
    const yBtn = document.getElementById('yes-' + answerId);
    const nBtn = document.getElementById('no-' + answerId);
    if (yBtn) yBtn.classList.toggle('selected', isValid);
    if (nBtn) nBtn.classList.toggle('selected', !isValid);
    onVote(answerId, isValid);
  };
}

function isAutoInvalid(answer, letter) {
  if (!answer) return true;
  if (/[0-9!@#$%^&*()\-_=+\[\]{};':"\\|,.<>/?]/.test(answer)) return true;
  return !normStr(answer).startsWith(normStr(letter));
}

function normStr(s) {
  return s.toLowerCase()
    .replace(/İ/g,'i').replace(/I/g,'ı')
    .replace(/Ğ/g,'ğ').replace(/Ü/g,'ü')
    .replace(/Ş/g,'ş').replace(/Ö/g,'ö')
    .replace(/Ç/g,'ç');
}

// ─────────────────────────────────────────
// CHAT
// ─────────────────────────────────────────

const CHAT_ELS = {
  lobby: 'lobby-chat-messages',
  game:  'game-chat-messages',
  vote:  'vote-chat-messages',
};

export function renderMessages(context, messages) {
  const el = document.getElementById(CHAT_ELS[context]);
  if (!el) return;
  el.innerHTML = '';
  messages.forEach(m => appendChatMessage(context, m, false));
  el.scrollTop = el.scrollHeight;
}

export function appendChatMessage(context, msg, scroll = true) {
  const el = document.getElementById(CHAT_ELS[context]);
  if (!el) return;

  const div = document.createElement('div');
  const isSystem = msg.player_id === '__system__';
  div.className = 'chat-msg' + (isSystem ? ' system' : '');
  if (isSystem) {
    div.innerHTML = `<em>🔔 ${escHtml(msg.content)}</em>`;
  } else {
    div.innerHTML = `<span class="sender">${msg.avatar} ${escHtml(msg.nickname)}:</span> ${escHtml(msg.content)}`;
  }
  el.appendChild(div);
  if (scroll) el.scrollTop = el.scrollHeight;
}

// ─────────────────────────────────────────
// YARDIMCI
// ─────────────────────────────────────────

export function escHtml(str = '') {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}
