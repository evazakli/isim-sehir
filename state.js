// ============================================================
// STATE.JS — Merkezi oyun durumu
// ============================================================

export const DEFAULT_LETTER_POOL = [
  'A','B','C','Ç','D','E','F','G','H','I','İ',
  'J','K','L','M','N','O','Ö','P','R','S','Ş',
  'T','U','Ü','V','Y','Z'
];

export const ALL_CATEGORIES = [
  'İsim','Şehir','Hayvan','Ünlü','Ülke','Bitki',
  'Yiyecek','Spor','Renk','Meslek','Film','Marka'
];

export const ALL_AVATARS = [
  '🦁','🐯','🦊','🐺','🐸','🦝','🐧','🦋',
  '🐙','🦄','🐉','🐻','🦩','🦀','🐬','🦜','🐝','🦖'
];

export const DURATIONS = [45, 60, 90, 120];

/**
 * Tek kaynak-doğru (single source of truth) state nesnesi.
 * Doğrudan mutate etmek yerine setState() kullan.
 */
export const state = {
  // Oyuncu
  playerId: null,
  nickname: '',
  avatar: '🎲',

  // Oda
  roomId: null,
  roomCode: null,
  isHost: false,
  roomData: null,

  // Oyuncular listesi (realtime'dan beslenir)
  players: [],

  // Bu tura ait cevaplar (tüm oyuncuların)
  answers: [],

  // Kendi cevaplarım  { category -> answer }
  myAnswers: {},

  // Oylama seçimlerim  { answerId -> boolean }
  myVotes: {},

  // Timer
  timerInterval: null,

  // Lobi ayarları (oda kurulurken)
  selectedDuration: 60,
  selectedCategories: ['İsim','Şehir','Hayvan','Ünlü','Ülke','Bitki'],

  // Cevap gönderildi mi?
  submitted: false,

  // Realtime subscription tutucuları
  subs: [],
};

/** Kısmi güncelleme (shallow merge) */
export function setState(partial) {
  Object.assign(state, partial);
}

/** State'i sıfırla (yeni oyun / oda ayrılma) */
export function resetState() {
  state.roomId = null;
  state.roomCode = null;
  state.isHost = false;
  state.roomData = null;
  state.players = [];
  state.answers = [];
  state.myAnswers = {};
  state.myVotes = {};
  state.submitted = false;
  clearInterval(state.timerInterval);
  state.timerInterval = null;
}
