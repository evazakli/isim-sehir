// ============================================================
// REALTIME.JS — Supabase Realtime abonelik yöneticisi
// ============================================================

import { db } from './db.js';
import { state } from './state.js';

/**
 * Tüm aktif abonelikleri temizle.
 * Ekran geçişlerinde veya oda ayrılmada çağır.
 */
export function unsubAll() {
  state.subs.forEach(ch => {
    try { db.removeChannel(ch); } catch (_) {}
  });
  state.subs = [];
}

/**
 * Oda kaydındaki değişiklikleri dinle.
 * @param {Function} onUpdate  (newRoom) => void
 */
export function subscribeRoom(onUpdate) {
  const ch = db.channel('room:' + state.roomId)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${state.roomId}` },
      payload => onUpdate(payload.new)
    )
    .subscribe();
  state.subs.push(ch);
}

/**
 * Oyuncu listesi değişikliklerini dinle.
 * @param {Function} onAny  () => void
 */
export function subscribePlayers(onAny) {
  const ch = db.channel('players:' + state.roomId)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${state.roomId}` },
      () => onAny()
    )
    .subscribe();
  state.subs.push(ch);
}

/**
 * Cevap tablosundaki değişiklikleri dinle (kaç kişi tamamladı takibi).
 * @param {Function} onAny  () => void
 */
export function subscribeAnswers(onAny) {
  const ch = db.channel('answers:' + state.roomId)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'answers', filter: `room_id=eq.${state.roomId}` },
      () => onAny()
    )
    .subscribe();
  state.subs.push(ch);
}

/**
 * Oy tablosundaki değişiklikleri dinle.
 * @param {Function} onAny  () => void
 */
export function subscribeVotes(onAny) {
  const ch = db.channel('votes:' + state.roomId)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'votes', filter: `room_id=eq.${state.roomId}` },
      () => onAny()
    )
    .subscribe();
  state.subs.push(ch);
}

/**
 * Chat mesajlarını dinle.
 * @param {Function} onInsert  (message) => void
 */
export function subscribeMessages(onInsert) {
  const ch = db.channel('messages:' + state.roomId)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${state.roomId}` },
      payload => onInsert(payload.new)
    )
    .subscribe();
  state.subs.push(ch);
}

/**
 * Broadcast kanalı — hafif anlık sinyaller için (örn: "tur bitti").
 * Supabase'deki DB polling yerine daha hızlı bildirim için kullanılabilir.
 * @param {string} event
 * @param {Function} handler  (payload) => void
 */
export function subscribeBroadcast(event, handler) {
  const ch = db.channel('broadcast:' + state.roomId)
    .on('broadcast', { event }, payload => handler(payload))
    .subscribe();
  state.subs.push(ch);
  return ch; // gönderici de aynı kanalı kullanır
}

export async function broadcastEvent(event, payload = {}) {
  await db.channel('broadcast:' + state.roomId).send({
    type: 'broadcast',
    event,
    payload,
  });
}
