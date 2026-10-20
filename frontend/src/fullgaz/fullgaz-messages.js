// Messagerie Full Gaz commune à tous les jeux : conversations privées entre amis (compte Full Gaz). Sans dépendance.
// La source de vérité est Full Gaz/compte/ ; copier ce fichier ET fullgaz-account.js dans chaque jeu.
//
//   import { mountMessagesButton, openMessages, setMessagesTheme } from './fullgaz-messages.js';
//   setMessagesTheme({ bg: '#111522', surface: '#1d2233', line: '#3a4160', shadow: '#000', accent: '#C8F03C',
//                      accentInk: '#111522', text: '#F4F1EA', muted: '#AEB4C8', font: '"Archivo", sans-serif' });
//   mountMessagesButton(document.querySelector('#accueil'));    // bulle flottante en bas à droite, avec pastille de non-lus
//   mountMessagesButton(barre, { className: 'btn small' });     // ou un bouton dans la page, stylé par le jeu
//   openMessages({ chatWith: 'bob' });                          // ou à la main
//
// Aux couleurs du jeu : setMessagesTheme() une fois au démarrage (panneau + bulle). Ne jamais monter le bouton
// dans un écran de partie : seulement sur l'accueil, la pause ou l'écran de fin.
//
// Le panneau vit dans un Shadow DOM : ses styles ne touchent pas le jeu, et ceux du jeu ne le touchent pas.
// Échap ferme le panneau (ou revient à la liste) sans atteindre le jeu.

import { whoAmI, social, conversations, messages, sendMessage, markMessagesRead } from './fullgaz-account.js';

const PORTAL = 'https://fullgaz.kernse.fr';

const CSS = `
:host { all: initial;
  --m-bg: #140b2e; --m-surface: #211447; --m-line: #4b3591; --m-shadow: #7b3cff; --m-accent: #ffd21f; --m-accent-ink: #140b2e;
  --m-text: #fbf7ff; --m-muted: #b8a9e6; --m-scrim: rgb(20 11 46 / .55); --m-radius: 14px;
  --m-font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
* { box-sizing: border-box; }
.scrim { position: fixed; inset: 0; z-index: 2147483000; background: var(--m-scrim); display: flex; justify-content: flex-end; font: 15px/1.45 var(--m-font); color: var(--m-text); }
.panel { width: min(440px, 100vw); height: 100%; background: var(--m-bg); border-left: 2px solid var(--m-line); display: flex; flex-direction: column; box-shadow: -6px 0 0 var(--m-shadow); }
@media (max-width: 480px) { .panel { border-left: 0; box-shadow: none; } }
.top { display: flex; align-items: center; gap: 10px; padding: max(10px, env(safe-area-inset-top)) 14px 10px; border-bottom: 2px solid var(--m-line); }
.brand { flex: 1; font: 800 22px/1 var(--m-font); letter-spacing: -.5px; }
.brand b { color: var(--m-accent); font-style: italic; }
button, input, textarea { font: inherit; color: inherit; }
button { cursor: pointer; }
.icon { min-width: 44px; min-height: 44px; border-radius: 999px; border: 2px solid var(--m-line); background: var(--m-surface); font-size: 18px; }
.body { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 12px; }
h2 { margin: 0; font: 800 20px/1.1 var(--m-font); }
p { margin: 0; color: var(--m-muted); }
.btn { min-height: 44px; padding: 0 16px; border-radius: 999px; border: 2px solid var(--m-line); background: var(--m-surface); font-weight: 700; }
.btn.primary { background: var(--m-accent); border-color: var(--m-accent); color: var(--m-accent-ink); box-shadow: 3px 3px 0 var(--m-shadow); }
.btn:disabled { opacity: .6; }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.row { display: flex; align-items: center; gap: 10px; min-height: 56px; padding: 8px 10px; border-radius: 14px; background: var(--m-surface); border: 2px solid transparent; text-decoration: none; color: inherit; width: 100%; text-align: left; }
button.row:hover, a.row:hover { border-color: var(--m-accent); }
.row .main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.row .main b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row .main span { color: var(--m-muted); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.av { flex: none; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; background: var(--m-accent); color: var(--m-accent-ink); font-weight: 800; position: relative; }
.av.on::after { content: ""; position: absolute; right: -1px; bottom: -1px; width: 11px; height: 11px; border-radius: 50%; background: #2fe08a; border: 2px solid var(--m-surface); }
.count { min-width: 22px; height: 22px; padding: 0 6px; border-radius: 999px; background: #ff5a5f; color: #fff; font: 800 12px/22px var(--m-font); text-align: center; }
.small { min-height: 40px; padding: 0 12px; font-size: 14px; }
form { display: flex; flex-direction: column; gap: 10px; }
label { display: flex; flex-direction: column; gap: 4px; font-weight: 700; font-size: 14px; }
/* 16 px minimum : en dessous, l'iPhone zoome la page quand on touche le champ et ne dézoome plus. */
input, textarea { font-size: 16px; min-height: 46px; padding: 10px 12px; border-radius: 12px; border: 2px solid var(--m-line); background: var(--m-surface); }
input:focus, textarea:focus, button:focus-visible, a:focus-visible { outline: 3px solid var(--m-accent); outline-offset: 2px; }
.err { color: #ff8a8a; font-weight: 700; font-size: 14px; }
.ok { color: #2fe08a; font-weight: 700; font-size: 14px; }
.err:empty, .ok:empty { display: none; }
.link { background: none; border: 0; padding: 0; min-height: 44px; text-decoration: underline; text-decoration-color: var(--m-accent); font-weight: 700; align-self: flex-start; }
.thread { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.bubble { max-width: 80%; padding: 8px 12px; border-radius: 16px; background: var(--m-surface); border: 2px solid var(--m-line); word-wrap: break-word; white-space: pre-wrap; }
.bubble.mine { align-self: flex-end; background: var(--m-accent); border-color: var(--m-accent); color: var(--m-accent-ink); }
.bubble small { display: block; font-size: 11px; opacity: .7; margin-top: 2px; }
.composer { display: flex; gap: 8px; padding: 10px 14px max(10px, env(safe-area-inset-bottom)); border-top: 2px solid var(--m-line); }
.composer input { flex: 1; min-width: 0; }
.empty { text-align: center; padding: 24px 8px; }
`;

const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.filter((k) => k != null && k !== false));
  return n;
};
const initial = (name) => (name || '?').slice(0, 1).toUpperCase();
function ago(t) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'à l\'instant';
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h` : new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

// ---------- Thème ----------
const THEME_VARS = { bg: '--m-bg', surface: '--m-surface', line: '--m-line', shadow: '--m-shadow', accent: '--m-accent',
  accentInk: '--m-accent-ink', text: '--m-text', muted: '--m-muted', scrim: '--m-scrim', font: '--m-font', radius: '--m-radius' };
let theme = {};
const bubbles = new Set();

/** Couleurs du jeu pour le panneau et la bulle : { bg, surface, line, shadow, accent, accentInk, text, muted, scrim, font, ink }.
 *  Les clés absentes gardent les couleurs Full Gaz. */
export function setMessagesTheme(t = {}) {
  theme = { ...t };
  if (host) applyTheme(host);
  bubbles.forEach(styleBubble);
}
function applyTheme(node) {
  for (const [k, v] of Object.entries(THEME_VARS)) {
    if (theme[k]) node.style.setProperty(v, theme[k]); else node.style.removeProperty(v);
  }
}
function styleBubble(btn) {
  const ink = theme.ink || theme.bg || '#140b2e'; // contour de la bulle (ink : foncé sur un jeu clair)
  btn.style.background = theme.accent || '#ffd21f';
  btn.style.color = theme.accentInk || '#140b2e';
  btn.style.borderColor = ink;
  btn.style.boxShadow = `4px 4px 0 ${theme.shadow || '#7b3cff'}`;
  btn.firstElementChild?.nextElementSibling?.style.setProperty('border-color', ink);
}

// ---------- État partagé ----------
const state = { me: undefined, soc: null, convs: [], unread: 0, onChange: new Set() };
let pollTimer = 0;
let lastSig = '';

async function refreshBadge() {
  clearTimeout(pollTimer);
  try {
    if (state.me === undefined) state.me = await whoAmI();
    if (state.me) {
      state.soc = await social();
      state.unread = state.soc.unreadMessages || 0;
    } else {
      state.unread = 0;
    }
  } catch (e) {
    if (e.code === 'not-signed-in') state.me = null;
  }
  state.onChange.forEach((f) => f());
  // Panneau ouvert sur la liste : on la redessine seulement si quelque chose a changé (identité, non-lus, amis),
  // jamais en pleine conversation (sinon les boutons bougeraient sous le doigt).
  const sig = JSON.stringify([state.me?.name ?? state.me, state.unread, state.soc?.friends]);
  if (host?.isConnected && !threadWith && sig !== lastSig) render();
  lastSig = sig;
  if (state.me && !document.hidden) pollTimer = setTimeout(refreshBadge, 30000);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.me) refreshBadge(); });

/** Bulle « Messages » flottante en bas à droite, avec pastille de non-lus.
 *  Elle n'apparaît que tant que `container` est affiché (accueil, pause…) : la monter dans chaque écran où on la veut.
 *  Plusieurs bulles visibles en même temps se superposent exactement au même endroit. */
export function mountMessagesButton(container, { label = 'Messages', className = '' } = {}) {
  const badge = el('span');
  badge.style.cssText = 'position:absolute;top:-4px;right:-4px;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:#ff5a5f;color:#fff;border:2px solid #140b2e;font:800 12px/18px system-ui,sans-serif;text-align:center;display:none';
  const btn = el('button', { type: 'button', title: label });
  btn.setAttribute('aria-haspopup', 'dialog');
  if (className) {
    // Bouton dans la page, stylé par le jeu (classe fournie) : libellé + pastille.
    btn.className = className;
    btn.style.position = 'relative';
    btn.append(el('span', { textContent: `💬 ${label}` }), badge);
  } else {
    btn.style.cssText = 'position:fixed;right:max(16px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));z-index:2147482000;width:56px;height:56px;padding:0;border-radius:50%;border:3px solid;cursor:pointer;display:grid;place-items:center;transition:transform .12s';
    btn.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm3 6.5a1.5 1.5 0 1 0 0 .01zm5 0a1.5 1.5 0 1 0 0 .01zm5 0a1.5 1.5 0 1 0 0 .01z"/></svg>';
    btn.append(badge);
    btn.addEventListener('pointerenter', () => { btn.style.transform = 'translate(-2px,-2px)'; });
    btn.addEventListener('pointerleave', () => { btn.style.transform = ''; });
    bubbles.add(btn);
    styleBubble(btn);
  }
  btn.addEventListener('click', () => openMessages());
  const show = () => {
    badge.style.display = state.unread ? 'block' : 'none';
    badge.textContent = state.unread > 9 ? '9+' : String(state.unread);
    btn.setAttribute('aria-label', state.unread ? `${label} : ${state.unread} non lu${state.unread > 1 ? 's' : ''}` : label);
  };
  state.onChange.add(show);
  show();
  if (state.me === undefined) refreshBadge();
  container.append(btn);
  return btn;
}

/** À appeler après une connexion ou une déconnexion faite ailleurs dans la page. */
export function refreshMessages() {
  state.me = undefined;
  state.soc = null;
  return refreshBadge();
}

/** Nombre de messages non lus, et abonnement aux changements. */
export function onUnreadChange(fn) {
  const f = () => fn(state.unread);
  state.onChange.add(f);
  f();
  if (state.me === undefined) refreshBadge();
  return () => state.onChange.delete(f);
}

// ---------- Panneau ----------
let host = null;
let root = null;
let threadWith = null;
let threadTimer = 0;
let lastFocus = null;

export function openMessages({ chatWith = null } = {}) {
  lastFocus = document.activeElement;
  if (!host) {
    host = el('div');
    host.setAttribute('data-fullgaz-messages', '');
    root = host.attachShadow({ mode: 'open' });
    root.append(el('style', { textContent: CSS }));
  }
  applyTheme(host);
  if (!host.isConnected) document.body.append(host);
  window.addEventListener('keydown', onKey, true);
  threadWith = chatWith;
  render();
  if (state.me === undefined || !state.soc) refreshBadge();
}

export function closeMessages() {
  clearTimeout(threadTimer);
  threadWith = null;
  window.removeEventListener('keydown', onKey, true);
  host?.remove();
  lastFocus?.focus?.();
}

function onKey(e) {
  if (e.key !== 'Escape') return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (threadWith) { threadWith = null; clearTimeout(threadTimer); render(); } else closeMessages();
}

function render() {
  const body = el('div', { className: 'body' });
  const panel = el('div', { className: 'panel', role: 'dialog' },
    el('div', { className: 'top' },
      el('div', { className: 'brand', innerHTML: 'Messages <b>Full Gaz</b>' }),
      el('button', { className: 'icon', type: 'button', textContent: '✕', ariaLabel: 'Fermer les messages', onclick: closeMessages })),
    body);
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Messages Full Gaz');
  const scrim = el('div', { className: 'scrim' }, panel);
  scrim.addEventListener('click', (e) => { if (e.target === scrim) closeMessages(); });
  [...root.querySelectorAll('.scrim')].forEach((n) => n.remove());
  root.append(scrim);

  if (state.me === undefined) body.append(el('p', { className: 'empty', textContent: 'Chargement…' }));
  else if (!state.me) renderSignedOut(body);
  else if (threadWith) renderThread(body, panel);
  else renderConversations(body);

  panel.querySelector('button')?.focus({ preventScroll: true });
}

function renderSignedOut(body) {
  body.append(el('div', { className: 'empty' },
    el('h2', { textContent: 'Connecte-toi' }),
    el('p', { textContent: 'La messagerie est commune à tous les jeux Full Gaz : il faut un compte (pseudo + mot de passe). Connecte-toi avec « Mon compte » ou sur le portail.', style: 'margin:8px 0 16px' }),
    el('a', { className: 'btn primary', href: PORTAL, textContent: 'Ouvrir Full Gaz', style: 'display:inline-flex;align-items:center;text-decoration:none' })));
}

async function renderConversations(body) {
  const friends = state.soc?.friends || [];
  body.append(el('h2', { textContent: 'Messages' }));
  const list = el('ul', { className: 'list' });
  const startBtn = friends.length
    ? el('button', { className: 'btn primary', type: 'button', textContent: 'Nouveau message', onclick: () => pickFriend(body) })
    : el('p', {}, 'Pas encore d\'amis : ajoute-les sur ', el('a', { href: PORTAL, textContent: 'Full Gaz', style: 'color:var(--m-accent)' }), '.');
  body.append(list, startBtn);
  try {
    const res = await conversations();
    state.convs = res.conversations;
  } catch (e) { list.replaceWith(el('p', { className: 'err', textContent: e.message })); return; }
  if (!state.convs.length) { list.append(el('li', { className: 'empty' }, el('p', { textContent: 'Aucune conversation pour l\'instant.' }))); return; }
  const online = new Set(friends.filter((f) => f.online).map((f) => f.name));
  list.append(...state.convs.map((c) => el('li', {},
    el('button', { className: 'row', type: 'button', onclick: () => { threadWith = c.with; render(); } },
      el('span', { className: 'av' + (online.has(c.with) ? ' on' : ''), textContent: initial(c.with) }),
      el('span', { className: 'main' }, el('b', { textContent: c.with }), el('span', { textContent: `${c.last.from === state.me.name ? 'Toi : ' : ''}${c.last.text}` })),
      c.unread ? el('span', { className: 'count', textContent: String(c.unread) }) : el('span', { className: 'main', style: 'flex:none', textContent: ago(c.last.at) })))));
}

function pickFriend(body) {
  body.replaceChildren(el('h2', { textContent: 'Écrire à…' }),
    el('ul', { className: 'list' }, ...(state.soc?.friends || []).map((f) => el('li', {},
      el('button', { className: 'row', type: 'button', onclick: () => { threadWith = f.name; render(); } },
        el('span', { className: 'av' + (f.online ? ' on' : ''), textContent: initial(f.name) }),
        el('span', { className: 'main' }, el('b', { textContent: f.name }), el('span', { textContent: f.online ? 'En ligne' : 'Hors ligne' })))))),
    el('button', { className: 'link', type: 'button', textContent: 'Retour', onclick: render }));
}

function renderThread(body, panel) {
  const name = threadWith;
  const thread = el('div', { className: 'thread', role: 'log', ariaLive: 'polite' });
  const err = el('p', { className: 'err', role: 'alert' });
  body.append(el('div', { style: 'display:flex;align-items:center;gap:10px' },
    el('button', { className: 'icon', type: 'button', textContent: '←', ariaLabel: 'Retour aux conversations', onclick: () => { threadWith = null; clearTimeout(threadTimer); render(); } }),
    el('h2', { textContent: name })), thread, err);
  const input = el('input', { maxLength: 500, placeholder: `Message à ${name}`, autocomplete: 'off', ariaLabel: `Message à ${name}` });
  const send = el('button', { className: 'btn primary', type: 'submit', textContent: 'Envoyer' });
  const composer = el('form', { className: 'composer' }, input, send);
  composer.style.flexDirection = 'row';
  panel.append(composer);
  let last = 0;
  let busy = false;
  const seen = new Set();
  const add = (m) => {
    if (seen.has(m.id)) return;
    seen.add(m.id);
    thread.append(el('div', { className: 'bubble' + (m.mine ? ' mine' : '') }, m.text, el('small', { textContent: ago(m.at) })));
    last = Math.max(last, m.at);
  };
  const load = async () => {
    clearTimeout(threadTimer);
    if (threadWith !== name) return;
    try {
      const res = await messages(name, last);
      const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 60;
      if (!res.messages.length && !seen.size) thread.replaceChildren(el('p', { className: 'empty', textContent: 'Dis bonjour !' }));
      else if (res.messages.length) { thread.querySelector('.empty')?.remove(); res.messages.forEach(add); }
      if (res.messages.some((m) => !m.mine) || !seen.size) { markMessagesRead(name).then(refreshBadge).catch(() => {}); }
      if (atBottom || res.messages.length) body.scrollTop = body.scrollHeight;
      if (!res.friend) { input.disabled = true; send.disabled = true; err.textContent = 'Vous n\'êtes plus amis : tu ne peux plus lui écrire.'; }
    } catch (e) { err.textContent = e.message; }
    if (threadWith === name && host?.isConnected) threadTimer = setTimeout(load, document.hidden ? 15000 : 4000);
  };
  composer.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || busy) return;
    busy = true;
    send.disabled = true;
    err.textContent = '';
    try {
      thread.querySelector('.empty')?.remove();
      add(await sendMessage(name, text));
      input.value = '';
      body.scrollTop = body.scrollHeight;
    } catch (e2) { err.textContent = e2.message; }
    busy = false;
    send.disabled = false;
    input.focus();
  });
  load();
  setTimeout(() => input.focus(), 0);
}
