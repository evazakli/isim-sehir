// ============================================================
// APP.JS — Ana kontrolör: ekranlar arası akış
// ============================================================

import { state, setState, resetState, DEFAULT_LETTER_POOL } from './state.js';
import {
  createRoomInDB, getRoomByCode, updateRoom,
  upsertPlayer, setPlayerOffline, getPlayers,
  getOnlinePlayerCount, resetPlayerScores,
  saveAnswers, getAnswerCount, deleteRoomAnswers,
  saveVotes, getVotes, getAnswers, deleteRoomVotes,
  getMessages, sendMessage,
} from './db.js';
import {
  unsubAll, subscribeRoom, subscribePlayers,
  subscribeAnswers, subscribeMessages,
} from './realtime.js';
import { runScoring } from './scoring.js';
import {
  showScreen, showToast,
  renderAvatarGrid, renderCategoryToggles,
  renderPlayersList, renderAnswersGrid,
  collectMyAnswers, lockAnswerInputs,
  startTimer, stopTimer,
  renderMiniScores, renderLeaderboard,
  renderVotingCards,
  renderMessages, appendChatMessage,
} from './ui.js';

// ─────────────────────────────────────────
// BAŞLANGIÇ
// ─────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // Oyuncu kimliğini kalıcı olarak sakla
  const saved = localStorage.getItem('player_id') || crypto.randomUUID();
  localStorage.setItem('player_id', saved);
  setState({ playerId: saved });

  const nick = localStorage.getItem('player_nickname');
  if (nick) document.getElementById('nickname-input').value = nick;

  const av = localStorage.getItem('player_avatar') || '🎲';
  setState({ avatar: av });

  renderAvatarGrid(av => {
    setState({ avatar: av });
    localStorage.setItem('player_avatar', av);
  });

  renderCategoryToggles(toggleCategory);
  bindDurationButtons();

  // URL'den oda kodu varsa doldur
  const urlCode = new URLSearchParams(location.search).get('code');
  if (urlCode) {
    document.getElementById('join-code-input').value = urlCode.toUpperCase();
  }

  // Sayfa kapanırken çevrimdışı yap
  window.addEventListener('beforeunload', async () => {
    if (state.playerId && state.roomId) {
      await setPlayerOffline(state.playerId);
    }
  });
});

// ─────────────────────────────────────────
// AYAR KONTROLLERI
// ─────────────────────────────────────────

function bindDurationButtons() {
  document.querySelectorAll('#duration-group .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#duration-group .toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setState({ selectedDuration: parseInt(btn.dataset.val) });
    });
  });
}

function toggleCategory(btn, cat) {
  const cats = [...state.selectedCategories];
  if (cats.includes(cat)) {
    if (cats.length <= 4) { showToast('En az 4 kategori seçilmeli!'); return; }
    setState({ selectedCategories: cats.filter(c => c !== cat) });
    btn.classList.remove('active');
  } else {
    if (cats.length >= 8) { showToast('En fazla 8 kategori seçebilirsin!'); return; }
    setState({ selectedCategories: [...cats, cat] });
    btn.classList.add('active');
  }
}

// ─────────────────────────────────────────
// FORM YARDIMCILARI
// ─────────────────────────────────────────

function validateAndReadNickname() {
  const input = document.getElementById('nickname-input');
  const nick = (input?.value || '').trim();
  if (!nick) { showToast('Lütfen bir takma ad gir!'); return null; }
  if (nick.length > 16) { showToast('Takma ad en fazla 16 karakter olabilir!'); return null; }
  localStorage.setItem('player_nickname', nick);
  setState({ nickname: nick });
  return nick;
}

// ─────────────────────────────────────────
// ODA OLUŞTUR
// ─────────────────────────────────────────

window.showCreateRoom = function () {
  if (!validateAndReadNickname()) return;
  showScreen('screen-create');
};

window.createRoom = async function () {
  if (!validateAndReadNickname()) return;
  if (state.selectedCategories.length < 4) { showToast('En az 4 kategori seç!'); return; }

  const code = generateCode();

  let room;
  try {
    room = await createRoomInDB({
      code,
      hostId: state.playerId,
      categories: state.selectedCategories,
      duration: state.selectedDuration,
      letterPool: [...DEFAULT_LETTER_POOL],
    });
  } catch (e) {
    showToast('Oda oluşturulamadı: ' + e.message);
    return;
  }

  setState({ roomId: room.id, roomCode: room.code, isHost: true, roomData: room });
  await upsertPlayer({ id: state.playerId, roomId: room.id, nickname: state.nickname, avatar: state.avatar });

  history.pushState({}, '', '?code=' + code);
  await enterLobby();
};

// ─────────────────────────────────────────
// ODAYA KATIL
// ─────────────────────────────────────────

window.joinRoom = async function () {
  if (!validateAndReadNickname()) return;

  const raw = document.getElementById('join-code-input')?.value?.trim();
  if (!raw || raw.length < 4) { showToast('Geçerli bir oda kodu gir!'); return; }

  const room = await getRoomByCode(raw);
  if (!room) { showToast('Oda bulunamadı!'); return; }
  if (room.status === 'finished') { showToast('Bu oda kapanmış!'); return; }

  const count = await getOnlinePlayerCount(room.id);
  if (count >= 10) { showToast('Oda dolu! (Maks 10 kişi)'); return; }

  setState({
    roomId: room.id,
    roomCode: room.code,
    isHost: room.host_id === state.playerId,
    roomData: room,
  });

  await upsertPlayer({ id: state.playerId, roomId: room.id, nickname: state.nickname, avatar: state.avatar });

  history.pushState({}, '', '?code=' + room.code);

  if (room.status === 'lobby') {
    await enterLobby();
  } else if (room.status === 'playing') {
    await enterGame(room);
  } else if (room.status === 'voting') {
    await enterVoting(room);
  } else if (room.status === 'results') {
    await enterResults(room);
  }
};

window.leaveRoom = async function () {
  if (state.playerId && state.roomId) {
    await setPlayerOffline(state.playerId);
  }
  unsubAll();
  resetState();
  history.pushState({}, '', location.pathname);
  showScreen('screen-home');
};

// ─────────────────────────────────────────
// LOBİ
// ─────────────────────────────────────────

async function enterLobby() {
  unsubAll();
  showScreen('screen-lobby');

  document.getElementById('lobby-code').textContent = state.roomCode;
  document.getElementById('lobby-host-controls').style.display = state.isHost ? 'block' : 'none';
  document.getElementById('lobby-wait-msg').style.display     = state.isHost ? 'none'  : 'block';

  await refreshPlayers();
  subscribeRoom(handleRoomUpdate);
  subscribePlayers(refreshPlayers);
  subscribeMessages(msg => appendChatMessage('lobby', msg));
  renderMessages('lobby', await getMessages(state.roomId));
}

window.copyCode = function () {
  const shareData = {
    title: 'Kategoriler Oyunu',
    text: `Seninle oynamak istiyorum! Oda kodu: ${state.roomCode}`,
    url: location.href,
  };
  if (navigator.share) {
    navigator.share(shareData).catch(() => fallbackCopy());
  } else {
    fallbackCopy();
  }
};

function fallbackCopy() {
  navigator.clipboard.writeText(location.href)
    .then(() => showToast('Bağlantı kopyalandı! 📋'))
    .catch(() => showToast('Kod: ' + state.roomCode));
}

window.startGame = async function () {
  const players = await getPlayers(state.roomId);
  if (players.length < 2) { showToast('En az 2 oyuncu gerekli!'); return; }

  const pool = [...DEFAULT_LETTER_POOL];
  const letter = pickLetter(pool);
  const remaining = pool.filter(l => l !== letter);

  await updateRoom(state.roomId, {
    status: 'playing',
    current_round: 1,
    current_letter: letter,
    letter_pool: remaining,
    round_end_time: new Date(Date.now() + state.roomData.round_duration * 1000).toISOString(),
  });
};

// ─────────────────────────────────────────
// OYUN EKRANI
// ─────────────────────────────────────────

async function enterGame(room) {
  setState({ submitted: false, myAnswers: {}, roomData: room });
  unsubAll();
  showScreen('screen-game');

  document.getElementById('round-num').textContent   = room.current_round;
  document.getElementById('total-rounds').textContent = DEFAULT_LETTER_POOL.length;
  document.getElementById('current-letter').textContent = room.current_letter;
  document.getElementById('submit-btn').style.display = 'flex';
  document.getElementById('waiting-others').style.display = 'none';

  renderAnswersGrid(room.categories, room.current_letter);
  await refreshPlayers();
  renderMiniScores();
  subscribeAnswers(() => { if (state.isHost) checkAllSubmitted(); });
  subscribeRoom(handleRoomUpdate);
  subscribeMessages(msg => appendChatMessage('game', msg));
  renderMessages('game', await getMessages(state.roomId));

  startTimer(room.round_end_time, () => { if (!state.submitted) autoSubmit(); });
}

window.submitAnswers = async function () {
  if (state.submitted) return;
  const answers = collectMyAnswers();
  setState({ myAnswers: answers, submitted: true });
  lockAnswerInputs();
  document.getElementById('submit-btn').style.display = 'none';
  document.getElementById('waiting-others').style.display = 'block';
  await persistAnswers();
  showToast('Cevaplar gönderildi! ✅');
  if (state.isHost) await checkAllSubmitted();
};

async function autoSubmit() {
  if (state.submitted) return;
  const answers = collectMyAnswers();
  setState({ myAnswers: answers, submitted: true });
  lockAnswerInputs();
  document.getElementById('submit-btn').style.display = 'none';
  document.getElementById('waiting-others').style.display = 'block';
  await persistAnswers();
  if (state.isHost) await checkAllSubmitted();
}

async function persistAnswers() {
  const room = state.roomData;
  const rows = room.categories.map(cat => ({
    room_id:      state.roomId,
    player_id:    state.playerId,
    round_number: room.current_round,
    letter:       room.current_letter,
    category:     cat,
    answer:       state.myAnswers[cat] || '',
  }));
  await saveAnswers(rows);
}

async function checkAllSubmitted() {
  const onlinePlayers = await getPlayers(state.roomId);
  const expected = onlinePlayers.length * state.roomData.categories.length;
  const count = await getAnswerCount(state.roomId, state.roomData.current_round);
  if (count >= expected) {
    stopTimer();
    await updateRoom(state.roomId, { status: 'voting' });
  }
}

// ─────────────────────────────────────────
// OYLAMA
// ─────────────────────────────────────────

async function enterVoting(room) {
  setState({ roomData: room, myVotes: {} });
  unsubAll();
  showScreen('screen-voting');

  document.getElementById('vote-letter').textContent = room.current_letter;

  const answers = await getAnswers(state.roomId, room.current_round);
  setState({ answers });
  await refreshPlayers();

  renderVotingCards(room.categories, room.current_letter, () => {});
  subscribeRoom(handleRoomUpdate);
  subscribeMessages(msg => appendChatMessage('vote', msg));
  renderMessages('vote', await getMessages(state.roomId));
}

window.submitVotes = async function () {
  const rows = Object.entries(state.myVotes).map(([answerId, isValid]) => ({
    room_id:  state.roomId,
    voter_id: state.playerId,
    answer_id: answerId,
    is_valid: isValid,
  }));
  await saveVotes(rows);
  showToast('Oylar gönderildi! 🗳️');

  if (state.isHost) {
    await runScoring(state.roomData);
  }
};

// ─────────────────────────────────────────
// SONUÇLAR
// ─────────────────────────────────────────

async function enterResults(room) {
  setState({ roomData: room });
  unsubAll();
  showScreen('screen-results');

  document.getElementById('results-banner').textContent = `Tur ${room.current_round} Sonuçları`;
  document.getElementById('results-host-controls').style.display = state.isHost ? 'block' : 'none';
  document.getElementById('results-wait-msg').style.display     = state.isHost ? 'none'  : 'block';

  await refreshPlayers();
  renderLeaderboard('leaderboard');
  subscribeRoom(handleRoomUpdate);
}

window.nextRound = async function () {
  const room = state.roomData;
  const pool = room.letter_pool || [];
  if (pool.length === 0) {
    await updateRoom(state.roomId, { status: 'finished' });
    return;
  }
  const letter = pickLetter(pool);
  const remaining = pool.filter(l => l !== letter);

  await updateRoom(state.roomId, {
    status: 'playing',
    current_round: room.current_round + 1,
    current_letter: letter,
    letter_pool: remaining,
    round_end_time: new Date(Date.now() + room.round_duration * 1000).toISOString(),
  });
};

// ─────────────────────────────────────────
// OYUN BİTİŞİ
// ─────────────────────────────────────────

async function enterGameOver() {
  unsubAll();
  showScreen('screen-gameover');
  await refreshPlayers();
  renderLeaderboard('final-leaderboard');
}

window.playAgain = async function () {
  if (!state.isHost) { showToast('Sadece oda sahibi yeni oyun başlatabilir!'); return; }

  await Promise.all([
    resetPlayerScores(state.roomId),
    deleteRoomAnswers(state.roomId),
    deleteRoomVotes(state.roomId),
    updateRoom(state.roomId, {
      status: 'lobby',
      current_round: 0,
      current_letter: null,
      letter_pool: [...DEFAULT_LETTER_POOL],
      round_end_time: null,
    }),
  ]);

  await enterLobby();
};

// ─────────────────────────────────────────
// REALTIME YÖNLENDIRME
// ─────────────────────────────────────────

async function handleRoomUpdate(room) {
  setState({ roomData: room });
  const s = room.status;

  if (s === 'playing') {
    await enterGame(room);
  } else if (s === 'voting') {
    stopTimer();
    await enterVoting(room);
  } else if (s === 'results') {
    await enterResults(room);
  } else if (s === 'finished') {
    await enterGameOver();
  } else if (s === 'lobby') {
    await enterLobby();
  }
}

// ─────────────────────────────────────────
// CHAT
// ─────────────────────────────────────────

/**
 * context: 'lobby' | 'game' | 'vote'
 */
window.sendChat = async function (context) {
  const inputIds = { lobby: 'lobby-chat-input', game: 'game-chat-input', vote: 'vote-chat-input' };
  const input = document.getElementById(inputIds[context]);
  if (!input) return;
  const content = input.value.trim();
  if (!content) return;
  input.value = '';

  try {
    await sendMessage({
      roomId:   state.roomId,
      playerId: state.playerId,
      nickname: state.nickname,
      avatar:   state.avatar,
      content,
    });
  } catch (e) {
    showToast('Mesaj gönderilemedi!');
  }
};

// ─────────────────────────────────────────
// YARDIMCILAR
// ─────────────────────────────────────────

async function refreshPlayers() {
  const players = await getPlayers(state.roomId);
  setState({ players });
  renderPlayersList();
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function pickLetter(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}
