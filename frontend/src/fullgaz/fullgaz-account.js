// Client du compte Full Gaz (sans dépendance). Copié tel quel dans chaque jeu :
// la source de vérité est Full Gaz/compte/fullgaz-account.js.
//
// La session vit dans un cookie HttpOnly posé sur .kernse.fr par le service de comptes
// (Base Farmer, décision D084) : une connexion sur un site vaut pour tous les autres.
// Ce module ne voit jamais le mot de passe stocké ni le cookie, il appelle simplement l'API.

const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
export const API = LOCAL ? `http://${location.hostname}:8140/api` : 'https://compte.kernse.fr/api';

const MESSAGES = {
  'bad-name': 'Pseudo : 3 à 14 lettres, chiffres, espaces, - ou _.',
  'bad-password': 'Mot de passe : au moins 6 caractères.',
  'name-taken': 'Ce pseudo est déjà pris.',
  'wrong-credentials': 'Pseudo ou mot de passe incorrect.',
  'too-many-attempts': 'Trop d\'essais, réessaie dans une minute.',
  'not-signed-in': 'Tu n\'es pas connecté.',
  offline: 'Serveur injoignable. Vérifie ta connexion.',
  'unknown-player': 'Aucun joueur avec ce pseudo.',
  yourself: 'C\'est toi, ça !',
  'already-friends': 'Vous êtes déjà amis.',
  'not-friends': 'Vous n\'êtes pas (encore) amis.',
  'too-many-nudges': 'Doucement : une notif toutes les 30 secondes par ami.',
  'empty-message': 'Message vide.',
  'too-many-messages': 'Tu écris trop vite, souffle un peu.',
  'bad-subscription': 'Notifications impossibles sur ce navigateur.',
  'not-unlocked': 'Pas encore débloqué : monte de niveau pour l\'avoir.',
};

export class FullGazError extends Error {
  constructor(code) {
    super(MESSAGES[code] || 'Erreur du serveur.');
    this.code = code;
  }
}

async function call(method, path, body) {
  let res;
  try {
    res = await fetch(`${API}/${path}`, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new FullGazError('offline');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new FullGazError(data.error || 'server');
  return data;
}

// Identité courante : { name, friends } ou null si personne n'est connecté.
export async function whoAmI() {
  try { return await call('GET', 'fullgaz/me'); } catch (e) {
    if (e.code === 'not-signed-in') return null;
    throw e;
  }
}

const REFERRER = 'fullgaz.parrain';

export async function signIn(name, password) {
  await call('POST', 'login', { name, password });
  try { localStorage.removeItem(REFERRER); } catch (e) { /* rien */ } // le parrainage ne vaut que pour un nouveau compte
  flushEvents();
  return whoAmI();
}

// Parrainage : un lien ?parrain=<pseudo> (portail ou jeu) est retenu sur l'appareil, puis envoyé à l'inscription.
try {
  const p = new URLSearchParams(location.search).get('parrain');
  if (p) localStorage.setItem(REFERRER, p.trim().slice(0, 20));
} catch (e) { /* pas de stockage : tant pis */ }
export function pendingReferrer() { try { return localStorage.getItem(REFERRER); } catch (e) { return null; } }
// Lien d'invitation d'un joueur (vers le portail par défaut).
export function inviteLink(name, url = 'https://fullgaz.kernse.fr') {
  return `${url.replace(/\/$/, '')}/?parrain=${encodeURIComponent(name)}`;
}

// consent (facultatif) : { notifs, data }, les cases du formulaire d'inscription du portail.
export async function signUp(name, password, consent) {
  const referrer = pendingReferrer();
  await call('POST', 'signup', { name, password, ...(consent ? { consent } : {}), ...(referrer ? { referrer } : {}) });
  try { localStorage.removeItem(REFERRER); } catch (e) { /* rien */ }
  flushEvents();
  return whoAmI();
}

export async function signOut() {
  await call('POST', 'logout').catch(() => undefined);
}

// Données propres à un jeu (objet JSON de 8 ko au plus).
export async function loadGameData(game) {
  return (await call('GET', `games/${game}`)).data;
}

export async function saveGameData(game, data) {
  return (await call('POST', `games/${game}`, { data })).data;
}

// Synchro « garder le meilleur des deux » entre cet appareil et le compte, à appeler au démarrage, après une
// connexion et après chaque partie. merge(remote, local) renvoie l'objet à garder (remote vaut null la première
// fois) ; il doit être idempotent. Les appels d'un même jeu passent l'un après l'autre (pas d'écrasement croisé).
// Renvoie { data, signedIn } : data est le résultat fusionné (à ranger en local), ou local si pas de compte/réseau.
const syncChains = {};
export function syncGameData(game, local, merge) {
  const run = async () => {
    let remote;
    try { remote = await loadGameData(game); } catch (e) {
      if (e.code === 'not-signed-in' || e.code === 'offline') return { data: local, signedIn: false };
      throw e;
    }
    const data = merge(remote ?? null, local);
    if (JSON.stringify(data) !== JSON.stringify(remote)) await saveGameData(game, data);
    return { data, signedIn: true };
  };
  const p = (syncChains[game] || Promise.resolve()).catch(() => {}).then(run);
  syncChains[game] = p;
  return p;
}

// Les données du jeu pour le joueur et ses amis : [{ name, me, data }].
export async function friendsGameData(game) {
  return (await call('GET', `games/${game}/friends`)).players;
}

// --- Amis et notifications (portail Full Gaz) ---

// Amis avec présence, demandes reçues/envoyées et boîte de réception : { name, friends: [{ name, online }],
// requestsIn, requestsOut, inbox: [{ id, from, game, text, at, read }] }. L'appeler compte comme présence.
export async function social() {
  return call('GET', 'fullgaz/social');
}

// Tous les joueurs (sauf soi) : [{ name, online, status: 'friend' | 'sent' | 'received' | 'none' }].
export async function players() {
  return (await call('GET', 'fullgaz/players')).players;
}

export async function requestFriend(name) {
  await call('POST', 'friends/request', { name });
}

export async function answerFriend(name, accept) {
  await call('POST', 'friends/answer', { name, accept });
}

export async function removeFriend(name) {
  await call('POST', 'friends/remove', { name });
}

// Notifie un ami (game : identifiant d'un jeu Full Gaz pour un défi, ou null pour un simple signe ;
// score : le score à battre, repris dans la notification et dans son lien).
export async function nudge(name, game = null, score = null) {
  await call('POST', 'fullgaz/nudge', { name, game, score: score ? String(score).slice(0, 24) : undefined });
}

export async function markInboxRead() {
  await call('POST', 'fullgaz/inbox/read');
}

// Notifications sur le téléphone : clé publique VAPID du service, puis abonnement du navigateur.
export async function pushKey() {
  return (await call('GET', 'push-key')).key;
}

export async function savePushSubscription(subscription) {
  await call('POST', 'push', { subscription });
}

// Consentements : { notifs, data } (whoAmI() renvoie consent, null tant que le joueur n'a pas répondu).
export async function saveConsent(consent) {
  return (await call('POST', 'fullgaz/consent', consent)).consent;
}

// --- Messagerie (commune à tous les jeux) ---

// Conversations : { conversations: [{ with, last: { from, text, at }, unread }], unread }.
export async function conversations() {
  return call('GET', 'fullgaz/conversations');
}

// Messages avec un ami : { with, friend, messages: [{ id, mine, text, at }] } (after : horodatage, pour les nouveaux).
export async function messages(name, after = 0) {
  return call('GET', `fullgaz/messages?with=${encodeURIComponent(name)}&after=${after}`);
}

export async function sendMessage(to, text) {
  return (await call('POST', 'fullgaz/messages', { to, text })).message;
}

export async function markMessagesRead(name) {
  await call('POST', 'fullgaz/messages/read', { with: name });
}

// --- Défis du jour (portail Full Gaz) ---

// Série : note le jour N° comme « au moins un défi du jour fini », tous jeux confondus (lu par le portail).
export async function recordDaily(no) {
  const d = (await loadGameData('fullgaz')) || {};
  const days = Array.isArray(d.days) ? d.days : [];
  if (days.includes(no)) return;
  d.days = [...days, no].sort((a, b) => a - b).slice(-60);
  await saveGameData('fullgaz', d);
}

// Après un défi du jour : prévient chaque ami que le joueur vient de dépasser.
// players : friendsGameData(game) après la sauvegarde ; key(data) : clé de tri du jour (plus petit = meilleur) ou null ;
// before : la clé du joueur avant cette partie (null s'il n'avait pas joué) ; label : le résultat affiché (« 1240 pts »).
export async function notifyBeaten(game, players, key, before, label) {
  const mine = players.find((p) => p.me);
  const now = mine ? key(mine.data) : null;
  if (now == null) return;
  for (const p of players) {
    if (p.me) continue;
    const k = key(p.data);
    if (k == null || now >= k || (before != null && before < k)) continue;
    try { await call('POST', 'fullgaz/nudge', { name: p.name, game, beat: String(label).slice(0, 24) }); } catch (e) { /* limite ou hors ligne */ }
  }
}

// --- Le Gaz : progression globale Full Gaz (serveur : Base Farmer/server/gaz.mjs) ---
// Le jeu signale des faits, le serveur applique le barème et les plafonds. Types :
//   game_completed            { duration (s), mode, result }       à chaque partie finie
//   daily_challenge_completed { no (numéro du défi du jour), result } quand le défi du jour est fini
//   personal_record_updated   { old, new, better: 'higher'|'lower', unit } quand le joueur bat son record
//   friend_challenge_completed { from (pseudo de l'ami), won }       quand une partie lancée par « Relever le défi » se termine
// Sans compte ou hors ligne, les faits attendent sur l'appareil (7 jours au plus) et partent à la connexion.
// Renvoie { gained, gaz } (Gaz gagnés par ce fait, profil à jour) ou null s'il attend.
const QUEUE = 'fullgaz.gaz.queue';
const readQueue = () => { try { return JSON.parse(localStorage.getItem(QUEUE)) || []; } catch (e) { return []; } };
const writeQueue = (q) => { try { localStorage.setItem(QUEUE, JSON.stringify(q.slice(-100))); } catch (e) { /* stockage plein */ } };
let flushing = null;
// Réponse du serveur pour chaque fait envoyé : plusieurs faits signalés d'affilée peuvent partir dans le même envoi.
const answered = new Map();
let lastGaz = null;

export async function reportEvent(game, type, payload = {}) {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  writeQueue([...readQueue(), { id, type, game, at: Date.now(), payload }]);
  await flushEvents();
  const mine = answered.get(id);
  if (!mine) return null; // pas connecté ou hors ligne : le fait attend sur l'appareil
  answered.delete(id);
  return { gained: mine.gains.reduce((n, g) => n + g.gain, 0), gains: mine.gains, gaz: lastGaz };
}

// Envoie les faits en attente (appelé tout seul après une connexion). Renvoie la réponse du serveur, ou null.
export function flushEvents() {
  if (flushing) return flushing.then(() => flushEvents());
  const week = Date.now() - 7 * 864e5;
  const queue = readQueue().filter((e) => e.at > week);
  if (!queue.length) return Promise.resolve(null);
  flushing = call('POST', 'fullgaz/events', { events: queue.slice(0, 50) })
    .then((res) => {
      const sent = new Set(queue.slice(0, 50).map((e) => e.id));
      writeQueue(readQueue().filter((e) => !sent.has(e.id)));
      for (const r of res.results || []) answered.set(r.id, r);
      lastGaz = res.gaz;
      return res;
    })
    .catch(() => null) // pas connecté ou hors ligne : on garde la file
    .finally(() => { flushing = null; });
  return flushing;
}

// Profil Gaz : { total, level, name, rank, next, floor, streak, today, quests, unlocked, equip, log }.
export async function gazProfile() {
  return (await call('GET', 'fullgaz/gaz')).gaz;
}

// Équipe un titre, un badge, un cadre ou un thème débloqué : { title?, badge?, frame?, theme? } (null pour retirer).
export async function equipGaz(choice) {
  return (await call('POST', 'fullgaz/gaz/equip', choice)).gaz;
}
