// Bandeau « Tes potes » commun à tous les jeux Full Gaz (sans dépendance). Copié tel quel dans chaque jeu :
// la source de vérité est Full Gaz/compte/fullgaz-potes.js. Il a besoin de fullgaz-account.js à côté de lui.
//
// Il montre, sur l'accueil (et l'écran de fin) d'un jeu : les potes en ligne, leur score, un bouton « Défier »
// par pote (notification + lien) et un gros bouton « Défier un pote » (lien de défi à partager).
// Le lien de défi est https://<jeu>/?defi=<pseudo>&s=<score>[&j=<jour>|&g=<graine>…] : le bandeau l'affiche en tête
// chez celui qui l'ouvre et, si le jeu fournit onChallenge, propose « Relever le défi » qui lance la même épreuve.
// Contrat commun : ?defi= ouvre la même épreuve que celle du score (défi du jour par défaut), jamais une autre.
//
//   import { mountPotes, readChallenge } from './fullgaz-potes.js';
//   const potes = mountPotes(document.getElementById('potes'), {
//     game: 'fouillis', name: 'Fouillis', url: 'https://fouillis.kernse.fr',
//     row: (data) => data?.day?.no === dayNo() ? { v: `${data.day.score} pts`, k: -data.day.score } : null,
//     rowLabel: 'du jour',                     // ce que représente le score affiché
//     onSignIn: () => openAccountDialog(),     // facultatif : ouvre la connexion du jeu
//     myScore: () => scoreDuJour,              // facultatif : score mis dans le lien (UNIQUEMENT celui de l'épreuve du défi)
//     challengeParams: () => ({ j: dayNo() }), // facultatif : de quoi rejouer la même épreuve (jour, graine, salle…)
//     onChallenge: (ch) => lancerLeDefiDuJour(ch), // facultatif : bouton « Relever le défi » sur le bandeau
//     theme: { accent: '#FFD21F', accentInk: '#140B2E', bg: '#211447', text: '#FFF7E0', ink: '#0B0618' },
//   });
//   potes.refresh();  // après une partie, pour remettre les scores à jour

import { whoAmI, social, friendsGameData, nudge } from './fullgaz-account.js';

const PORTAIL = 'https://fullgaz.kernse.fr';

// Défi reçu par lien : { from, score } ou null.
export function readChallenge() {
  const q = new URLSearchParams(location.search);
  const from = (q.get('defi') || '').trim().slice(0, 20);
  if (!from) return null;
  const params = {};
  for (const [k, v] of q) if (!['defi', 's', 'pseudo'].includes(k)) params[k] = v.slice(0, 40);
  return { from, score: (q.get('s') || '').slice(0, 24) || null, params };
}

// Lien de défi vers le jeu, avec le pseudo et le score à battre.
export function challengeLink(url, me, score, extra = {}) {
  const q = new URLSearchParams();
  if (me) q.set('defi', me);
  if (score) q.set('s', score);
  for (const [k, v] of Object.entries(extra || {})) if (v != null && v !== '') q.set(k, String(v));
  return `${url.replace(/\/$/, '')}/?${q}`;
}

// Partage du lien (feuille de partage du téléphone, sinon presse-papiers). Renvoie 'shared' | 'copied' | null.
export async function shareChallenge({ name, url, me, score, extra }) {
  const link = challengeLink(url, me || 'un pote', score, extra);
  const text = score ? `Je te défie sur ${name} : bats ${score} !` : `Viens me défier sur ${name} !`;
  try {
    if (navigator.share) { await navigator.share({ title: name, text, url: link }); return 'shared'; }
  } catch (e) { if (e?.name === 'AbortError') return null; }
  try { await navigator.clipboard.writeText(`${text} ${link}`); return 'copied'; } catch (e) { return null; }
}

const CSS = `
.fgp{--a:var(--fgp-accent,#FFD23F);--ai:var(--fgp-accent-ink,#1d1438);--b:var(--fgp-bg,#241a4a);--t:var(--fgp-text,#fff);--i:var(--fgp-ink,#0b0618);
  --r:var(--fgp-radius,14px);font-family:var(--fgp-font,inherit);color:var(--t);background:var(--b);border:2px solid var(--i);border-radius:var(--r);
  padding:10px 12px;display:flex;flex-direction:column;gap:8px;box-shadow:3px 3px 0 var(--i);text-align:left;box-sizing:border-box;width:100%;max-width:560px;margin:0 auto}
.fgp *{box-sizing:border-box}
.fgp-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.fgp-title{font-weight:900;font-size:16px;margin:0;display:flex;align-items:center;gap:6px;flex:1 1 auto;min-width:0;white-space:nowrap}
.fgp-title .fgp-on{overflow:hidden;text-overflow:ellipsis}
.fgp-on{font-size:12px;font-weight:700;opacity:.8;white-space:nowrap}
.fgp-btn{appearance:none;border:2px solid var(--i);border-radius:999px;background:var(--a);color:var(--ai);font:800 14px/1 inherit;
  min-height:40px;padding:0 14px;cursor:pointer;box-shadow:2px 2px 0 var(--i);white-space:nowrap;text-decoration:none;display:inline-flex;align-items:center;gap:6px}
.fgp-btn:active{transform:translate(1px,1px);box-shadow:1px 1px 0 var(--i)}
.fgp-btn.ghost{background:transparent;color:var(--t);border-color:currentColor;box-shadow:none}
.fgp-btn.small{min-height:30px;padding:0 10px;font-size:12px;box-shadow:none}
.fgp-list{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 4px;margin:0;list-style:none;scrollbar-width:thin}
.fgp-chip{flex:none;display:flex;align-items:center;gap:8px;padding:6px 6px 6px 10px;border-radius:999px;border:2px solid var(--i);background:rgb(255 255 255 / .1)}
.fgp-chip.me{background:rgb(255 255 255 / .2)}
.fgp-dot{width:9px;height:9px;border-radius:50%;background:#8a8a9a;flex:none}
.fgp-dot.on{background:#3ddc84;box-shadow:0 0 0 3px rgb(61 220 132 / .3)}
.fgp-who{display:flex;flex-direction:column;line-height:1.15;min-width:0}
.fgp-who b{font-size:13px;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fgp-who small{font-size:11px;opacity:.8}
.fgp-hint{margin:0;font-size:13px;opacity:.9}
.fgp-defi{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin:0;padding:8px 10px;border-radius:calc(var(--r) * .7);background:var(--a);color:var(--ai);font-weight:800;font-size:14px;border:2px solid var(--i)}
.fgp-defi .fgp-btn{background:var(--b);color:var(--t)}
.fgp-toast{font-size:13px;font-weight:700;margin:0;min-height:0}
.fgp-toast:empty{display:none}
`;

function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  for (const k of kids) if (k != null) e.append(k);
  return e;
}

export function mountPotes(host, opts) {
  if (!document.getElementById('fgp-css')) document.head.append(el('style', { id: 'fgp-css', textContent: CSS }));
  const t = opts.theme || {};
  const box = el('section', { className: 'fgp' });
  box.setAttribute('aria-label', 'Jouer avec tes potes');
  for (const [k, v] of Object.entries({ accent: t.accent, 'accent-ink': t.accentInk, bg: t.bg, text: t.text, ink: t.ink, radius: t.radius, font: t.font })) {
    if (v) box.style.setProperty(`--fgp-${k}`, v);
  }
  host.replaceChildren(box);
  const challenge = readChallenge();
  let me = null, rows = [], loaded = false, timer = 0, toastTimer = 0;
  const toast = el('p', { className: 'fgp-toast', role: 'status' });
  const say = (msg) => { toast.textContent = msg; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.textContent = ''; }, 3500); };
  // Si le jeu fournit myScore, il a le dernier mot (null = pas de score comparable) ; sinon, la ligne du joueur.
  const myScore = () => (opts.myScore ? opts.myScore() || null : rows.find((r) => r.me)?.v || null);

  async function defierTous() {
    const r = await shareChallenge({ name: opts.name, url: opts.url, me: me?.name, score: myScore(), extra: opts.challengeParams?.() });
    if (r === 'copied') say('Lien du défi copié : colle-le à tes potes.');
  }
  async function defier(name) {
    try { await nudge(name, opts.game, myScore()); say(`Défi envoyé à ${name} !`); } catch (e) { say(e.message); }
  }

  function render() {
    const kids = [];
    if (challenge) {
      const banner = el('p', { className: 'fgp-defi', textContent: challenge.score
        ? `🔥 ${challenge.from} te défie : bats ${challenge.score} !` : `🔥 ${challenge.from} te défie sur ${opts.name} !` });
      if (opts.onChallenge) {
        const take = el('button', { type: 'button', className: 'fgp-btn', textContent: 'Relever le défi' });
        take.addEventListener('click', () => opts.onChallenge(challenge));
        banner.append(' ', take);
      }
      kids.push(banner);
    }
    const online = rows.filter((r) => !r.me && r.online).length;
    const go = el('button', { type: 'button', className: 'fgp-btn', textContent: '⚔️ Défier un pote' });
    go.addEventListener('click', defierTous);
    kids.push(el('div', { className: 'fgp-head' },
      el('h2', { className: 'fgp-title', textContent: '👥 Tes potes' },
        me && loaded ? el('span', { className: 'fgp-on', textContent: online ? `· ${online} en ligne` : '' }) : null),
      go));
    if (!me) {
      const p = el('p', { className: 'fgp-hint', textContent: 'Connecte-toi pour voir les scores de tes potes et les défier en un clic.' });
      const b = opts.onSignIn ? el('button', { type: 'button', className: 'fgp-btn ghost small', textContent: 'Se connecter' })
        : el('a', { className: 'fgp-btn ghost small', href: PORTAIL, textContent: 'Se connecter' });
      if (opts.onSignIn) b.addEventListener('click', opts.onSignIn);
      kids.push(el('div', { className: 'fgp-head' }, p, b));
    } else if (!loaded) {
      kids.push(el('p', { className: 'fgp-hint', textContent: 'Chargement de tes potes…' }));
    } else if (rows.length <= 1) {
      kids.push(el('div', { className: 'fgp-head' },
        el('p', { className: 'fgp-hint', textContent: 'Pas encore de potes : ajoute-les sur Full Gaz, ou envoie-leur ton défi.' }),
        el('a', { className: 'fgp-btn ghost small', href: `${PORTAIL}/#amis`, textContent: 'Trouver des potes' })));
    } else {
      kids.push(el('ul', { className: 'fgp-list' }, ...rows.map((r) => {
        const sub = r.v ? `${r.v}${opts.rowLabel ? ` ${opts.rowLabel}` : ''}` : 'pas encore joué';
        const chip = el('li', { className: r.me ? 'fgp-chip me' : 'fgp-chip' },
          el('span', { className: r.online || r.me ? 'fgp-dot on' : 'fgp-dot' }),
          el('span', { className: 'fgp-who' }, el('b', { textContent: r.me ? 'Toi' : r.name }), el('small', { textContent: sub })));
        if (!r.me) {
          const b = el('button', { type: 'button', className: 'fgp-btn small', textContent: 'Défier' });
          b.setAttribute('aria-label', `Défier ${r.name}`);
          b.addEventListener('click', () => defier(r.name));
          chip.append(b);
        }
        return chip;
      })));
    }
    kids.push(toast);
    box.replaceChildren(...kids);
  }

  async function refresh() {
    try { me = await whoAmI(); } catch (e) { me = null; }
    if (!me) { loaded = false; rows = []; render(); return; }
    try {
      const [soc, data] = await Promise.all([social(), friendsGameData(opts.game).catch(() => [])]);
      const online = new Map(soc.friends.map((f) => [f.name, f.online]));
      const byName = new Map(data.map((p) => [p.me ? me.name : p.name, p.data]));
      const list = [{ name: me.name, me: true }, ...soc.friends.map((f) => ({ name: f.name, me: false }))];
      rows = list.map((r) => {
        const res = opts.row ? opts.row(byName.get(r.name)) : null;
        return { ...r, online: online.get(r.name) || false, v: res?.v || null, k: res?.k ?? Infinity };
      }).sort((a, b) => (b.online - a.online) || (a.k - b.k) || a.name.localeCompare(b.name));
      loaded = true;
    } catch (e) { loaded = true; }
    render();
  }

  render();
  refresh();
  // Présence et scores frais tant que la page est visible.
  const tick = () => { clearInterval(timer); if (!document.hidden) timer = setInterval(refresh, 45000); };
  document.addEventListener('visibilitychange', () => { tick(); if (!document.hidden) refresh(); });
  tick();
  return { refresh, share: defierTous, challenge };
}
