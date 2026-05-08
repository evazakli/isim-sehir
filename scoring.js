// ============================================================
// SCORING.JS — Puanlama motoru
// ============================================================

import {
  getAnswers, getVotes,
  updateAnswer, updatePlayer, updateRoom,
} from './db.js';
import { state } from './state.js';

/**
 * Ana puanlama akışı — sadece oda sahibi çalıştırır.
 *
 * Adımlar:
 *  1. Oylar sayılır → cevap geçerliliği belirlenir (çoğunluk oylaması)
 *  2. Kategori bazında aynı cevaplar gruplandırılır → 10/n puan
 *  3. Oyuncu toplam puanları güncellenir
 *  4. Oyun bitişi / sonraki tur durumu ayarlanır
 */
export async function runScoring(room) {
  const { id: roomId, current_round, categories, letter_pool } = room;

  // ── 1. Oyları çek ve cevap geçerliliğini belirle ──────────
  const [allAnswers, allVotes] = await Promise.all([
    getAnswers(roomId, current_round),
    getVotes(roomId),
  ]);

  const answerUpdates = allAnswers.map(ans => {
    const votesFor = allVotes.filter(v => v.answer_id === ans.id);
    const validCount   = votesFor.filter(v => v.is_valid).length;
    const invalidCount = votesFor.filter(v => !v.is_valid).length;

    // Oy yoksa: boş cevap = geçersiz, dolu cevap = geçerli (varsayılan)
    let isValid;
    if (votesFor.length === 0) {
      isValid = isAutoValid(ans.answer, ans.letter);
    } else {
      isValid = validCount >= invalidCount; // beraberlikte geçerli kabul
    }

    return { ...ans, is_valid: isValid, vote_count: validCount, invalid_vote_count: invalidCount };
  });

  // DB'ye geçerlilik yaz
  await Promise.all(
    answerUpdates.map(a =>
      updateAnswer(a.id, { is_valid: a.is_valid, vote_count: a.vote_count, invalid_vote_count: a.invalid_vote_count })
    )
  );

  // ── 2. Puan hesapla (10 / n formülü) ──────────────────────
  const scoredAnswers = computeScores(answerUpdates, categories);

  // DB'ye puan yaz
  await Promise.all(
    scoredAnswers.map(a => updateAnswer(a.id, { score: a.score }))
  );

  // ── 3. Oyuncu toplam puanlarını güncelle ──────────────────
  const { data: playersSnap } = await window._db
    .from('players')
    .select('*')
    .eq('room_id', roomId);

  const players = playersSnap || [];

  await Promise.all(players.map(player => {
    const playerAnswers = scoredAnswers.filter(a => a.player_id === player.id);
    const roundScore = playerAnswers.reduce((sum, a) => sum + (a.score || 0), 0);

    // Çakışma sayısı: geçerli ama başkasıyla aynı cevap
    const collisions = playerAnswers.filter(a => {
      if (!a.is_valid || !a.answer.trim()) return false;
      const key = normalizeAnswer(a.answer);
      return scoredAnswers.some(
        b => b.id !== a.id &&
             b.category === a.category &&
             normalizeAnswer(b.answer) === key &&
             b.is_valid
      );
    }).length;

    return updatePlayer(player.id, {
      total_score:    round2(player.total_score + roundScore),
      last_round_score: round2(roundScore),
      collision_count: player.collision_count + collisions,
    });
  }));

  // ── 4. Durum geçişi ───────────────────────────────────────
  const remainingPool = letter_pool || [];
  if (remainingPool.length === 0) {
    await updateRoom(roomId, { status: 'finished' });
  } else {
    await updateRoom(roomId, { status: 'results' });
  }
}

// ─────────────────────────────────────────────────────────────
// Yardımcılar
// ─────────────────────────────────────────────────────────────

/**
 * Kategori bazında 10/n puanlaması.
 * Aynı normalleştirilmiş cevabı yazan n oyuncuya 10/n puan.
 * Geçersiz veya boş cevap → 0 puan.
 */
function computeScores(answers, categories) {
  const result = answers.map(a => ({ ...a, score: 0 }));

  categories.forEach(cat => {
    const valid = result.filter(a => a.category === cat && a.is_valid && a.answer.trim());

    // Grupla: normalize(cevap) → [answer objeleri]
    const groups = {};
    valid.forEach(a => {
      const key = normalizeAnswer(a.answer);
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    });

    Object.values(groups).forEach(group => {
      const n = group.length;
      const pts = round2(10 / n);
      group.forEach(a => { a.score = pts; });
    });
  });

  return result;
}

/**
 * Otomatik geçerlilik kontrolü (oy gelmemişse).
 * - Boş cevap → geçersiz
 * - Harfle başlamıyorsa → geçersiz
 * - Rakam/sembol içeriyorsa → geçersiz
 */
function isAutoValid(answer, letter) {
  if (!answer || !answer.trim()) return false;
  if (/[0-9!@#$%^&*()\-_=+\[\]{};':"\\|,.<>/?]/.test(answer)) return false;
  return normalizeAnswer(answer).startsWith(normalizeLetter(letter));
}

function normalizeAnswer(str) {
  return str.trim()
    .toLowerCase()
    .replace(/İ/g, 'i').replace(/I/g, 'ı')
    .replace(/Ğ/g, 'ğ').replace(/Ü/g, 'ü')
    .replace(/Ş/g, 'ş').replace(/Ö/g, 'ö')
    .replace(/Ç/g, 'ç');
}

function normalizeLetter(letter) {
  return normalizeAnswer(letter);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Scoring modülü dışarıdan doğrudan DB istemcisine ulaşabilmek için
// global referans — db.js'den import yerine window üzerinden alıyoruz
// (circular import sorununu önlemek için)
import { db as _db } from './db.js';
window._db = _db;
