// ============================================================
// DB.JS — Supabase istemcisi + tüm veritabanı yardımcıları
// ============================================================

// ⚠️  Buraya kendi Supabase proje bilgilerini gir:
export const SUPABASE_URL     = 'https://wnnzkzfphvytunexgivh.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_lS9b_m_m5XnIaZhoJ-2-iA_uNwPfgo_';

export const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─────────────────────────────────────────
// ROOMS
// ─────────────────────────────────────────

/** Oda kodu ile oda getir */
export async function getRoomByCode(code) {
  const { data, error } = await db
    .from('rooms')
    .select('*')
    .eq('code', code.toUpperCase())
    .single();
  if (error) return null;
  return data;
}

/** Oda oluştur */
export async function createRoomInDB({ code, hostId, categories, duration, letterPool }) {
  const { data, error } = await db.from('rooms').insert({
    code,
    host_id: hostId,
    status: 'lobby',
    categories,
    round_duration: duration,
    letter_pool: letterPool,
    current_round: 0,
  }).select().single();
  if (error) throw error;
  return data;
}

/** Oda güncelle */
export async function updateRoom(roomId, fields) {
  const { error } = await db.from('rooms').update(fields).eq('id', roomId);
  if (error) throw error;
}

// ─────────────────────────────────────────
// PLAYERS
// ─────────────────────────────────────────

/** Oyuncuları oda bazında getir */
export async function getPlayers(roomId) {
  const { data } = await db
    .from('players')
    .select('*')
    .eq('room_id', roomId)
    .eq('is_online', true)
    .order('joined_at');
  return data || [];
}

/** Oyuncuyu upsert et (join / rejoin) */
export async function upsertPlayer({ id, roomId, nickname, avatar }) {
  const { error } = await db.from('players').upsert({
    id,
    room_id: roomId,
    nickname,
    avatar,
    is_online: true,
  }, { onConflict: 'id' });
  if (error) throw error;
}

/** Oyuncuyu çevrimdışı yap */
export async function setPlayerOffline(playerId) {
  await db.from('players').update({ is_online: false }).eq('id', playerId);
}

/** Oyuncu skorlarını sıfırla (tekrar oyna) */
export async function resetPlayerScores(roomId) {
  await db.from('players')
    .update({ total_score: 0, last_round_score: 0, collision_count: 0 })
    .eq('room_id', roomId);
}

/** Tek oyuncuyu güncelle (puan vb.) */
export async function updatePlayer(playerId, fields) {
  await db.from('players').update(fields).eq('id', playerId);
}

/** Odadaki çevrimiçi oyuncu sayısını al */
export async function getOnlinePlayerCount(roomId) {
  const { count } = await db.from('players')
    .select('*', { count: 'exact', head: true })
    .eq('room_id', roomId)
    .eq('is_online', true);
  return count || 0;
}

// ─────────────────────────────────────────
// ANSWERS
// ─────────────────────────────────────────

/** Bu tura ait cevapları getir */
export async function getAnswers(roomId, roundNumber) {
  const { data } = await db.from('answers')
    .select('*')
    .eq('room_id', roomId)
    .eq('round_number', roundNumber);
  return data || [];
}

/** Cevapları kaydet (upsert) */
export async function saveAnswers(rows) {
  const { error } = await db.from('answers').upsert(rows, {
    onConflict: 'room_id,player_id,round_number,category'
  });
  if (error) throw error;
}

/** Bu tura gönderilen toplam cevap sayısı */
export async function getAnswerCount(roomId, roundNumber) {
  const { count } = await db.from('answers')
    .select('*', { count: 'exact', head: true })
    .eq('room_id', roomId)
    .eq('round_number', roundNumber);
  return count || 0;
}

/** Cevabı güncelle (skor, geçerlilik) */
export async function updateAnswer(answerId, fields) {
  await db.from('answers').update(fields).eq('id', answerId);
}

/** Odaya ait tüm cevapları sil (tekrar oyna) */
export async function deleteRoomAnswers(roomId) {
  await db.from('answers').delete().eq('room_id', roomId);
}

// ─────────────────────────────────────────
// VOTES
// ─────────────────────────────────────────

/** Oy kaydet (upsert) */
export async function saveVotes(rows) {
  const { error } = await db.from('votes').upsert(rows, {
    onConflict: 'voter_id,answer_id'
  });
  if (error) throw error;
}

/** Bu odaya ait tüm oyları getir */
export async function getVotes(roomId) {
  const { data } = await db.from('votes').select('*').eq('room_id', roomId);
  return data || [];
}

/** Odaya ait tüm oyları sil (tekrar oyna) */
export async function deleteRoomVotes(roomId) {
  await db.from('votes').delete().eq('room_id', roomId);
}

// ─────────────────────────────────────────
// MESSAGES (CHAT)
// ─────────────────────────────────────────

/** Son 60 mesajı getir */
export async function getMessages(roomId) {
  const { data } = await db.from('messages')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })
    .limit(60);
  return data || [];
}

/** Mesaj gönder */
export async function sendMessage({ roomId, playerId, nickname, avatar, content }) {
  const { error } = await db.from('messages').insert({
    room_id: roomId,
    player_id: playerId,
    nickname,
    avatar,
    content: content.slice(0, 200),
  });
  if (error) throw error;
}
