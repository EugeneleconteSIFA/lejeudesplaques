import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CHASLES_PORTRAIT } from './chasles.js';
import {
  verifyCelebrities as apiVerify,
  askClaudeForAnswer as apiAskClaude,
  rooms as roomsAPI,
  challenges as challengesAPI,
} from './api.js';


// ============================================================
// CONSTANTES & UTILITAIRES
// ============================================================

const LETTERS = "ABCDEFGHJKLMNPQRSTVWXYZ"; // SIV exclut I, O, U

// Poids par difficulté : chill = ultra favorable, normal = équilibré, hardcore = uniforme
const DIFFICULTY_WEIGHTS = {
  chill: {
    A: 8, B: 4, C: 8, D: 8, E: 6, F: 4, G: 4, H: 3,
    J: 8, K: 1, L: 8, M: 8, N: 4, P: 8, Q: 0.5, R: 8,
    S: 8, T: 5, V: 3, W: 1, X: 0.5, Y: 1, Z: 1,
  },
  normal: {
    A: 6, B: 4, C: 6, D: 6, E: 5, F: 4, G: 4, H: 3,
    J: 6, K: 2, L: 6, M: 6, N: 4, P: 6, Q: 1, R: 6,
    S: 6, T: 4, V: 3, W: 2, X: 1, Y: 2, Z: 2,
  },
  hardcore: Object.fromEntries(LETTERS.split("").map(l => [l, 1])),
};

const DIFFICULTIES = [
  { id: "chill", label: "Chill", emoji: "🌴" },
  { id: "normal", label: "Normal", emoji: "🎯" },
  { id: "hardcore", label: "Hardcore", emoji: "🔥" },
];

const weightedRandomLetter = (rng = Math.random, difficulty = "normal") => {
  const weights = DIFFICULTY_WEIGHTS[difficulty] || DIFFICULTY_WEIGHTS.normal;
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (const [letter, weight] of Object.entries(weights)) {
    r -= weight;
    if (r <= 0) return letter;
  }
  return "A";
};

// PRNG déterministe pour les défis partagés (mulberry32)
const mulberry32 = (seed) => {
  let s = seed;
  return () => {
    s |= 0;
    s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
};
const PARTICLES = new Set([
  "de", "du", "des", "le", "la", "les", "di", "da", "dos", "del",
  "von", "van", "der", "den", "el", "al", "bin", "ben", "ibn",
  "mc", "mac", "st", "saint", "sainte", "ter", "ten", "und", "y"
]);

const THEMES = [
  { id: "free", label: "Libre", emoji: "🎲", hint: "Tout est permis" },
  { id: "cinema", label: "Cinéma", emoji: "🎬", hint: "Acteurs, actrices, réalisateurs" },
  { id: "sport", label: "Sport", emoji: "⚽", hint: "Athlètes, tous sports" },
  { id: "musique", label: "Musique", emoji: "🎵", hint: "Chanteurs, musiciens, rappeurs" },
  { id: "politique", label: "Politique", emoji: "🏛️", hint: "Hommes/femmes politiques, présidents" },
  { id: "litterature", label: "Littérature", emoji: "📚", hint: "Écrivains, poètes" },
];

const removeAccents = (s) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const randomPlate = (difficulty = "normal", rng = Math.random) => {
  const r = (n) => Array.from({ length: n }, () => weightedRandomLetter(rng, difficulty)).join("");
  const digits = String(Math.floor(rng() * 999) + 1).padStart(3, "0");
  return `${r(2)}-${digits}-${r(2)}`;
};

// Multiplicateur de streak : x1 (0-2), x1.5 (3-5), x2 (6-9), x3 (10+)
const streakMultiplier = (streak) => {
  if (streak < 3) return 1;
  if (streak < 6) return 1.5;
  if (streak < 10) return 2;
  return 3;
};

const getPlateLetters = (plate) => {
  const clean = plate.replace(/[^A-Z]/g, "");
  return [clean[0], clean[1], clean[2], clean[3]];
};

// Parse "Daniel Auteuil et Paul Young" en [{first:"D", last:"A"}, {first:"P", last:"Y"}]
const parseNames = (input) => {
  const normalized = removeAccents(input.trim().toLowerCase())
    .replace(/[.,;]/g, " ")
    .replace(/\s+/g, " ");

  // Split par "et", "&", "puis", "+"
  const parts = normalized.split(/\s+(?:et|puis|and|&|\+)\s+/);

  return parts.map((part) => {
    const words = part.trim().split(" ").filter(Boolean);
    if (words.length < 2) return null;

    const first = words[0];
    // Trouve le vrai nom de famille en sautant les particules
    let lastIdx = words.length - 1;
    while (lastIdx > 0 && PARTICLES.has(words[lastIdx])) lastIdx--;
    // Si le mot précédant est aussi une particule on a trouvé le bon
    // Mais si le mot actuel est une particule on remonte
    let nameIdx = words.length - 1;
    while (nameIdx > 0 && (PARTICLES.has(words[nameIdx - 1]) || PARTICLES.has(words[nameIdx]))) {
      if (PARTICLES.has(words[nameIdx])) {
        nameIdx--;
      } else {
        break;
      }
    }
    // Plus simple : on part de la fin, on saute les particules, on prend le premier mot non-particule
    let i = words.length - 1;
    while (i > 0 && PARTICLES.has(words[i])) i--;
    const last = words[i];

    if (!first || !last) return null;
    return {
      first: first[0].toUpperCase(),
      last: last[0].toUpperCase(),
      raw: part.trim(),
    };
  }).filter(Boolean);
};

const canChain = (plate) => {
  const [, L2, L3] = getPlateLetters(plate);
  return L2 === L3;
};

const validateAnswer = (answer, plate) => {
  const [L1, L2, L3, L4] = getPlateLetters(plate);
  const names = parseNames(answer);
  const chainAllowed = L2 === L3;

  if (names.length === 0) {
    return { valid: false, reason: "Aucun nom ne parvient à mes oreilles. Ex : 'Daniel Auteuil et Paul Young'." };
  }

  // Mode 2 célébrités (direct)
  if (names.length >= 2) {
    const [p1, p2] = names;
    if (p1.first === L1 && p1.last === L2 && p2.first === L3 && p2.last === L4) {
      return { valid: true, mode: "direct", names: [p1.raw, p2.raw] };
    }
    // Check inverse au cas où le joueur les met dans l'autre sens
    if (p1.first === L3 && p1.last === L4 && p2.first === L1 && p2.last === L2) {
      return { valid: false, reason: `Ordre inversé. La plaque est ${L1}${L2} puis ${L3}${L4}.` };
    }
    return {
      valid: false,
      reason: `Attendu : ${L1}${p1.first === L1 ? "✓" : "✗"} ${L2}${p1.last === L2 ? "✓" : "✗"} ${L3}${p2.first === L3 ? "✓" : "✗"} ${L4}${p2.last === L4 ? "✓" : "✗"}`,
    };
  }

  // Mode chaîne (Chasles) — UNIQUEMENT si lettre du milieu commune (L2 === L3)
  if (names.length === 1) {
    if (!chainAllowed) {
      return {
        valid: false,
        reason: `Pas de chaîne possible ici : ${L2} ≠ ${L3}. Il faut 2 célébrités.`,
      };
    }
    const p = names[0];
    if (p.first === L1 && p.last === L4) {
      return { valid: true, mode: "chasles", names: [p.raw] };
    }
    return {
      valid: false,
      reason: `Par Chasles ${L1}${L2}+${L3}${L4}=${L1}${L4}. Attendu prénom-${L1}, nom-${L4}. Ta personne : ${p.first}${p.last}.`,
    };
  }

  return { valid: false, reason: "Réponse indéchiffrable. Reformule, aventurier." };
};

const computePoints = (result, themeRespected, streak = 0) => {
  if (!result.valid) return 0;
  let pts = 10;
  if (result.mode === "chasles") pts += 5;
  if (themeRespected) pts += 5;
  return Math.round(pts * streakMultiplier(streak));
};

// Cache global : nom normalisé -> { exists, description }
const celebrityCache = new Map();
const cacheKey = (name) => removeAccents(name.trim().toLowerCase()).replace(/\s+/g, " ");

// Vérifie via le backend (qui proxifie Claude)
const verifyCelebrities = async (plate, names, mode, theme) => {
  const themeActive = theme && theme.id !== "free";

  // Check cache d'abord (sauf si un thème est actif)
  if (!themeActive) {
    const allCached = names.every(n => celebrityCache.has(cacheKey(n)));
    if (allCached) {
      const people = names.map(n => {
        const cached = celebrityCache.get(cacheKey(n));
        return { name: n, exists: cached.exists, matches_theme: true, description: cached.description };
      });
      return {
        valid: people.every(p => p.exists),
        people,
        reason: people.filter(p => !p.exists).map(p => p.name).join(", ") || "",
        comment: "",
        _cached: true,
      };
    }
  }

  const parsed = await apiVerify(plate, names, mode, theme);

  // Mise en cache
  for (const p of parsed.people || []) {
    const key = cacheKey(p.name);
    if (!celebrityCache.has(key)) {
      celebrityCache.set(key, { exists: p.exists, description: p.description || "" });
    }
  }

  return parsed;
};

// Demande à Claude une réponse valide (langue au chat)
// Le backend appelle Claude, on valide les initiales côté client avec retry.
const askClaudeForAnswer = async (plate, theme) => {
  try {
    let parsed = await apiAskClaude(plate, theme, false);
    if (parsed.answer && parsed.answer !== "Claude n'a rien trouvé") {
      const check = validateAnswer(parsed.answer, plate);
      if (check.valid) {
        return { ...parsed, chasles: check.mode === "chasles", validated: true };
      }
      console.warn("askClaude 1st try invalid:", parsed.answer, "→", check.reason);

      parsed = await apiAskClaude(plate, theme, true);
      if (parsed.answer) {
        const check2 = validateAnswer(parsed.answer, plate);
        if (check2.valid) {
          return { ...parsed, chasles: check2.mode === "chasles", validated: true };
        }
        return {
          answer: parsed.answer,
          explanation: `⚠️ ${check2.reason} — ${parsed.explanation}`,
          chasles: false,
          validated: false,
        };
      }
    }
    return parsed;
  } catch (e) {
    console.error("askClaudeForAnswer error:", e);
    return { answer: "Impossible de contacter Claude", explanation: e.message || "Erreur réseau.", chasles: false };
  }
};


// ============================================================
// HOOK DICTÉE VOCALE + COMPOSANT MIC
// ============================================================

const useSpeechRecognition = (onFinalResult) => {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [interim, setInterim] = useState("");
  const recognitionRef = useRef(null);
  const callbackRef = useRef(onFinalResult);
  callbackRef.current = onFinalResult;

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    setSupported(true);
    const recognition = new SR();
    recognition.lang = 'fr-FR';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (e) => {
      let interimText = "";
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interimText += t;
      }
      if (interimText) setInterim(interimText);
      if (finalText) {
        setInterim("");
        callbackRef.current?.(finalText.trim());
      }
    };
    recognition.onerror = () => { setListening(false); setInterim(""); };
    recognition.onend = () => { setListening(false); setInterim(""); };
    recognitionRef.current = recognition;
    return () => { try { recognition.abort(); } catch (e) { /* */ } };
  }, []);

  const start = () => {
    if (!recognitionRef.current || listening) return;
    try {
      recognitionRef.current.start();
      setListening(true);
    } catch (e) { setListening(false); }
  };
  const stop = () => {
    if (!recognitionRef.current) return;
    try { recognitionRef.current.stop(); } catch (e) { /* */ }
    setListening(false);
  };
  return { listening, supported, interim, start, stop };
};

const MicButton = ({ onTranscript, disabled }) => {
  const { listening, supported, start, stop } = useSpeechRecognition(onTranscript);
  if (!supported) return null;
  return (
    <button
      type="button"
      onClick={listening ? stop : start}
      disabled={disabled}
      aria-label={listening ? "Arrêter la dictée" : "Dictée vocale"}
      className={`absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
        listening
          ? "bg-chrono-solid text-white animate-pulse"
          : "bg-stone-200 text-stone-700 hover:bg-stone-300"
      } disabled:opacity-40`}
    >
      🎤
    </button>
  );
};


// ============================================================
// COMPOSANT PLAQUE
// ============================================================

const Plate = ({ plate, size = "lg" }) => {
  const sizeClasses = {
    sm: "w-56",
    md: "w-72",
    lg: "w-80 sm:w-96",
    xl: "w-96 sm:w-[28rem]",
  };

  return (
    <div className={`${sizeClasses[size]} select-none drop-shadow-xl`}>
      <svg viewBox="0 0 520 110" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
        {/* Corps de la plaque */}
        <rect x="2" y="2" width="516" height="106" rx="10" fill="white" stroke="#2a2a2a" strokeWidth="2"/>

        {/* Bande bleue gauche */}
        <rect x="4" y="4" width="52" height="102" rx="8" fill="#003399"/>
        <rect x="52" y="4" width="4" height="102" fill="#003399"/>

        {/* Cercle d'étoiles européennes */}
        <g transform="translate(30, 38)">
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i * 30 - 90) * Math.PI / 180;
            const r = 13;
            return (
              <text
                key={i}
                x={Math.cos(angle) * r}
                y={Math.sin(angle) * r + 3}
                textAnchor="middle"
                fontSize="7"
                fill="#FFCC00"
                fontWeight="bold"
              >★</text>
            );
          })}
        </g>
        <text x="30" y="88" textAnchor="middle" fill="white" fontFamily="Arial Black, sans-serif" fontSize="18" fontWeight="900">F</text>

        {/* Numéro de plaque au centre */}
        <text
          x="260"
          y="75"
          textAnchor="middle"
          fill="#111"
          fontFamily="'Charles Wright', 'Arial Black', sans-serif"
          fontSize="54"
          fontWeight="900"
          letterSpacing="1"
        >{plate}</text>

        {/* Bande bleue droite */}
        <rect x="464" y="4" width="52" height="102" rx="8" fill="#003399"/>
        <rect x="464" y="4" width="4" height="102" fill="#003399"/>

        {/* Portrait de Chasles à la place du logo région */}
        <clipPath id="chaslesClip">
          <rect x="470" y="10" width="40" height="56" rx="2"/>
        </clipPath>
        <image
          href={CHASLES_PORTRAIT}
          x="470"
          y="10"
          width="40"
          height="56"
          preserveAspectRatio="xMidYMid slice"
          clipPath="url(#chaslesClip)"
        />

        {/* Numéro de département 67 (Bas-Rhin, clin d'œil) */}
        <text x="490" y="92" textAnchor="middle" fill="white" fontFamily="Arial Black, sans-serif" fontSize="17" fontWeight="900">67</text>
      </svg>
    </div>
  );
};

// ============================================================
// MODALE — MICHEL CHASLES (version épique)
// ============================================================

const ChaslesModal = ({ onClose }) => (
  <div
    onClick={onClose}
    className="fixed inset-0 bg-stone-900/70 z-50 flex items-center justify-center p-4"
  >
    <div
      onClick={e => e.stopPropagation()}
      className="bg-gradient-cream max-w-md w-full rounded-3xl p-6 shadow-2xl border-4 border-stone-900 max-h-[90vh] overflow-y-auto"
    >
      <div className="flex justify-between items-start mb-4">
        <div className="text-xs tracking-[0.3em] text-stone-700">📜 LÉGENDE</div>
        <button onClick={onClose} className="text-stone-700 hover:text-stone-900 text-xl leading-none">✕</button>
      </div>

      <div className="flex flex-col items-center gap-3 mb-4">
        <img
          src={CHASLES_PORTRAIT}
          alt="Michel Chasles"
          className="w-32 h-32 rounded-full object-cover border-4 border-stone-900 shadow-lg"
        />
        <h2 className="font-display text-4xl text-stone-900 text-center leading-none">
          MICHEL<br/>CHASLES
        </h2>
        <div className="text-xs tracking-widest text-stone-600">1793 — 1880</div>
      </div>

      <div className="space-y-3 text-sm text-stone-800 leading-relaxed">
        <p>
          <strong>Épernon, an de grâce 1793.</strong> Dans une France encore secouée par la Révolution naît un enfant qui, un jour, plierait la géométrie à sa volonté.
        </p>
        <p>
          Michel Chasles gravit les marches de Polytechnique, croise Poncelet, dépasse ses maîtres. Là où d'autres calculent, lui <em>voit</em>. Il refonde la géométrie projective, ressuscite les Grecs, et grave son nom sur une équation d'une simplicité désarmante :
        </p>
        <div className="bg-white/80 rounded-2xl p-4 my-3 text-center border-2 border-stone-900">
          <div className="font-mono text-2xl font-bold text-stone-900">AB + BC = AC</div>
          <div className="text-xs text-stone-600 mt-2 tracking-wider">LA RELATION DE CHASLES</div>
        </div>
        <p>
          Trois points. Deux segments. Une addition qui se souvient du sens. Cette humble formule est encore, aujourd'hui, la première brique que l'on pose dans l'esprit de tout élève de seconde qui affronte les vecteurs.
        </p>
        <p>
          Dans <em>Le jeu des plaques</em>, quand les initiales du milieu s'accordent, Chasles réapparaît. <strong>EW + WS = ES</strong>. Une seule célébrité, une seule âme, pour relier deux paires : c'est sa magie, sa signature, son clin d'œil à travers les siècles.
        </p>
        <p className="text-center italic text-stone-700 pt-2">
          Chaque fois que tu enchaînes ⛓️, tu réveilles un mathématicien.
        </p>
      </div>

      <button
        onClick={onClose}
        className="w-full mt-5 bg-stone-900 text-white p-3 rounded-2xl font-medium hover:bg-stone-800"
      >
        Refermer les annales
      </button>
    </div>
  </div>
);

// ============================================================
// MODALE — RÈGLES DU JEU (version épique)
// ============================================================

const RulesModal = ({ onClose }) => (
  <div
    onClick={onClose}
    className="fixed inset-0 bg-stone-900/70 z-50 flex items-center justify-center p-4"
  >
    <div
      onClick={e => e.stopPropagation()}
      className="bg-gradient-cream max-w-md w-full rounded-3xl p-6 shadow-2xl border-4 border-stone-900 max-h-[90vh] overflow-y-auto"
    >
      <div className="flex justify-between items-start mb-4">
        <div className="text-xs tracking-[0.3em] text-stone-700">📖 LES RÈGLES</div>
        <button onClick={onClose} className="text-stone-700 hover:text-stone-900 text-xl leading-none">✕</button>
      </div>

      <h2 className="font-display text-4xl text-stone-900 text-center leading-none mb-5">
        COMMENT<br/>ÇA MARCHE ?
      </h2>

      <div className="space-y-4 text-sm text-stone-800 leading-relaxed">
        <div>
          <div className="font-display text-lg text-stone-900 mb-1">🛣️ La voie directe</div>
          <p>Sur une plaque comme <code className="bg-stone-200 px-1.5 py-0.5 rounded font-mono">EW-143-WS</code>, invoque <strong>deux</strong> célébrités :</p>
          <ul className="list-disc pl-6 mt-1 space-y-0.5">
            <li>une pour <code className="bg-stone-200 px-1 rounded font-mono">EW</code> → « <em>Emma Watson</em> »</li>
            <li>une pour <code className="bg-stone-200 px-1 rounded font-mono">WS</code> → « <em>William Saurin</em> »</li>
          </ul>
        </div>

        <div>
          <div className="font-display text-lg text-stone-900 mb-1">⛓️ La voie de Chasles</div>
          <p>Quand la 2ème et la 3ème lettre s'accordent (ici <strong>W = W</strong>), tu peux enchaîner : une <strong>seule</strong> âme suffit, celle qui relie la 1ère et la 4ème lettre.</p>
          <p className="mt-1">Sur <code className="bg-stone-200 px-1.5 py-0.5 rounded font-mono">EW-143-WS</code> → « <em>Élina Svitolina</em> » (EW + WS = ES). Le mathématicien approuve.</p>
        </div>

        <div>
          <div className="font-display text-lg text-stone-900 mb-1">💰 Le butin</div>
          <ul className="list-disc pl-6 space-y-0.5">
            <li><strong>10 pts</strong> pour une bonne réponse</li>
            <li><strong>+5 pts</strong> pour une chaîne de Chasles réussie ⛓️</li>
            <li><strong>+5 pts</strong> si tu respectes le thème imposé 🎯</li>
            <li><strong>×1.5 à ×3</strong> en série (3, 6, 10 réussites de suite 🔥)</li>
          </ul>
        </div>

        <div>
          <div className="font-display text-lg text-stone-900 mb-1">⚖️ Le jury</div>
          <p>Chaque réponse est jugée par Claude, l'arbitre. Il accepte largement — même les personnalités de niche — mais refuse les inventions pures. En cas de doute, tu peux <em>défier son verdict</em>.</p>
        </div>

        <div>
          <div className="font-display text-lg text-stone-900 mb-1">🎮 Les modes</div>
          <ul className="list-disc pl-6 space-y-0.5">
            <li><strong>Zen</strong> — sans timer, à ton rythme</li>
            <li><strong>Chrono</strong> — 90 secondes pour maximiser le score</li>
            <li><strong>Multi</strong> — plusieurs guerriers dans un salon, le premier qui dégaine emporte la manche</li>
            <li><strong>Défi</strong> — 10 mêmes plaques pour tout le monde, classement partagé</li>
          </ul>
        </div>
      </div>

      <button
        onClick={onClose}
        className="w-full mt-5 bg-stone-900 text-white p-3 rounded-2xl font-medium hover:bg-stone-800"
      >
        Que la partie commence
      </button>
    </div>
  </div>
);

// ============================================================
// ÉCRAN D'ACCUEIL
// ============================================================

const Home = ({ onSelectMode }) => {
  const [examplePlate, setExamplePlate] = useState("DA-149-PY");
  const [showChasles, setShowChasles] = useState(false);
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setExamplePlate(randomPlate()), 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-home flex flex-col items-center justify-start p-4 sm:p-8">
      {showChasles && <ChaslesModal onClose={() => setShowChasles(false)} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
      <div className="w-full max-w-md flex flex-col items-center gap-6">
        <button
          onClick={() => setShowChasles(true)}
          className="self-center text-xs text-stone-700 hover:text-stone-900 underline decoration-dotted underline-offset-4 tracking-wider mt-2"
        >
          📜 En savoir plus sur Michel Chasles
        </button>
        <div className="pt-4 pb-2 text-center">
          <h1 className="font-display text-5xl sm:text-6xl text-stone-900 leading-none tracking-tight">
            LE JEU<br/>DES PLAQUES
          </h1>
          <div className="font-display text-2xl sm:text-3xl text-stone-800 tracking-tight mt-2">
            d'immatriculation
          </div>
        </div>

        <div className="my-4 transition-all duration-500 hover:scale-105">
          <Plate plate={examplePlate} size="lg" />
        </div>

        <p className="text-center text-stone-700 text-sm leading-relaxed max-w-xs">
          Sur la plaque <span className="font-mono font-bold">{examplePlate}</span>, trouve deux célébrités : une pour <span className="font-mono font-bold">{getPlateLetters(examplePlate)[0]}{getPlateLetters(examplePlate)[1]}</span>, une pour <span className="font-mono font-bold">{getPlateLetters(examplePlate)[2]}{getPlateLetters(examplePlate)[3]}</span>.
          {canChain(examplePlate) && (
            <>
              <br/>Ou par Chasles, une seule pour <span className="font-mono font-bold">{getPlateLetters(examplePlate)[0]}{getPlateLetters(examplePlate)[3]}</span> ⛓️
            </>
          )}
        </p>

        <div className="w-full flex flex-col gap-3 mt-4">
          <button
            onClick={() => onSelectMode("zen")}
            className="bg-stone-900 text-white p-5 rounded-2xl flex items-center justify-between hover:bg-stone-800 active:scale-98 transition-all shadow-lg"
          >
            <div className="text-left">
              <div className="font-display text-2xl tracking-wide">SOLO · ZEN</div>
              <div className="text-xs text-stone-300 mt-0.5">La route, ton esprit, l'éternité</div>
            </div>
            <span className="text-2xl">🌿</span>
          </button>

          <button
            onClick={() => onSelectMode("chrono")}
            className="btn-chrono text-white p-5 rounded-2xl flex items-center justify-between active:scale-98 transition-all shadow-lg"
          >
            <div className="text-left">
              <div className="font-display text-2xl tracking-wide">SOLO · CHRONO</div>
              <div className="text-xs text-red-100 mt-0.5">90 secondes pour marquer l'Histoire</div>
            </div>
            <span className="text-2xl">⏱️</span>
          </button>

          <button
            onClick={() => onSelectMode("multi")}
            className="btn-multi text-white p-5 rounded-2xl flex items-center justify-between active:scale-98 transition-all shadow-lg"
          >
            <div className="text-left">
              <div className="font-display text-2xl tracking-wide">MULTI · SALON</div>
              <div className="text-xs text-blue-100 mt-0.5">Un salon, plusieurs guerriers, un vainqueur</div>
            </div>
            <span className="text-2xl">👥</span>
          </button>

          <button
            onClick={() => onSelectMode("defi")}
            className="bg-purple-700 text-white p-5 rounded-2xl flex items-center justify-between hover:bg-purple-800 active:scale-98 transition-all shadow-lg"
          >
            <div className="text-left">
              <div className="font-display text-2xl tracking-wide">DÉFI · PARTAGÉ</div>
              <div className="text-xs text-purple-100 mt-0.5">10 épreuves. Qui régnera sur le tableau ?</div>
            </div>
            <span className="text-2xl">🏁</span>
          </button>
        </div>

        <button
          onClick={() => setShowRules(true)}
          className="text-xs text-stone-700 hover:text-stone-900 underline decoration-dotted underline-offset-4 tracking-wider mt-6"
        >
          Comment ça marche ?
        </button>
      </div>
    </div>
  );
};

// ============================================================
// MODE SOLO ZEN
// ============================================================

const SoloZen = ({ onBack }) => {
  const [difficulty, setDifficulty] = useState("normal");
  const [plate, setPlate] = useState(() => randomPlate("normal"));
  const [theme, setTheme] = useState(THEMES[0]);
  const [answer, setAnswer] = useState("");
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [history, setHistory] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [askingClaude, setAskingClaude] = useState(false);
  const [claudeHint, setClaudeHint] = useState(null);
  const inputRef = useRef(null);

  const currentMultiplier = streakMultiplier(streak);

  const handleTranscript = (t) => {
    setAnswer(prev => (prev.trim() ? prev + " " : "") + t);
    inputRef.current?.focus();
  };

  const handleSubmit = async () => {
    if (!answer.trim() || verifying) return;
    const result = validateAnswer(answer, plate);

    if (!result.valid) {
      setFeedback({ valid: false, reason: result.reason });
      setTimeout(() => setFeedback(null), 2500);
      return;
    }

    setVerifying(true);
    const verification = await verifyCelebrities(plate, result.names, result.mode, theme);
    setVerifying(false);

    if (!verification.valid && !verification._fallback) {
      const badPeople = (verification.people || []).filter(p => !p.exists).map(p => p.name).join(", ");
      setFeedback({
        valid: false,
        reason: badPeople ? `Claude ne reconnaît pas : ${badPeople}` : (verification.reason || "Une des personnes n'est pas reconnue."),
        contestable: { result, streakAtSubmit: streak },
      });
      return;
    }

    const themeRespected = theme.id !== "free" &&
      verification.people && verification.people.length > 0 &&
      verification.people.every(p => p.matches_theme);
    const points = computePoints(result, themeRespected, streak);

    setScore(s => s + points);
    setStreak(s => s + 1);
    setHistory(h => [{
      plate, answer: result.names.join(" + "), points, mode: result.mode,
      themeBonus: themeRespected, multiplier: currentMultiplier,
    }, ...h.slice(0, 4)]);
    setFeedback({
      valid: true, points, mode: result.mode, themeBonus: themeRespected,
      multiplier: currentMultiplier, comment: verification.comment || "",
    });
    setTimeout(() => {
      setPlate(randomPlate(difficulty));
      setAnswer("");
      setFeedback(null);
      setClaudeHint(null);
      inputRef.current?.focus();
    }, 1800);
  };

  const handleContest = () => {
    if (!feedback?.contestable) return;
    const { result, streakAtSubmit } = feedback.contestable;
    const points = computePoints(result, false, streakAtSubmit);
    setScore(s => s + points);
    setStreak(s => s + 1);
    setHistory(h => [{
      plate, answer: result.names.join(" + "), points, mode: result.mode,
      contested: true, multiplier: streakMultiplier(streakAtSubmit),
    }, ...h.slice(0, 4)]);
    setFeedback({ valid: true, points, mode: result.mode, contested: true });
    setTimeout(() => {
      setPlate(randomPlate(difficulty));
      setAnswer("");
      setFeedback(null);
      setClaudeHint(null);
      inputRef.current?.focus();
    }, 1500);
  };

  const handleSkip = () => {
    setStreak(0);
    setPlate(randomPlate(difficulty));
    setAnswer("");
    setFeedback(null);
    setClaudeHint(null);
    inputRef.current?.focus();
  };

  const handleAskClaude = async () => {
    if (askingClaude) return;
    setAskingClaude(true);
    const hint = await askClaudeForAnswer(plate, theme);
    setAskingClaude(false);
    setClaudeHint(hint);
    setStreak(0);
  };

  return (
    <div className="min-h-screen bg-gradient-cream p-4 flex flex-col">
      <div className="w-full max-w-md mx-auto flex flex-col gap-3 flex-1">
        <header className="flex items-center justify-between">
          <button onClick={onBack} className="text-stone-700 hover:text-stone-900 text-sm">← Menu</button>
          <div className="text-center">
            <div className="text-xs text-stone-600">SCORE</div>
            <div className="font-display text-3xl text-stone-900 leading-none">{score}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-stone-600">SÉRIE</div>
            <div className="font-display text-2xl text-chrono leading-none">
              {streak}🔥
              {currentMultiplier > 1 && (
                <span className="ml-1 text-sm bg-chrono-solid text-white px-1.5 py-0.5 rounded-md align-middle">
                  x{currentMultiplier}
                </span>
              )}
            </div>
          </div>
        </header>

        {/* Ligne difficulté + thème */}
        <div className="bg-white/60 backdrop-blur rounded-2xl p-3 border border-stone-300 space-y-2">
          <div>
            <div className="text-xs text-stone-600 mb-1.5">DIFFICULTÉ</div>
            <div className="flex gap-1.5">
              {DIFFICULTIES.map(d => (
                <button
                  key={d.id}
                  onClick={() => setDifficulty(d.id)}
                  className={`flex-1 px-2 py-1.5 rounded-full text-xs transition-all ${
                    difficulty === d.id ? "bg-stone-900 text-white" : "bg-white text-stone-700 hover:bg-stone-100"
                  }`}
                >
                  {d.emoji} {d.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-stone-600 mb-1.5">THÈME</div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {THEMES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t)}
                  className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-all ${
                    theme.id === t.id ? "bg-stone-900 text-white" : "bg-white text-stone-700 hover:bg-stone-100"
                  }`}
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-center py-4">
          <Plate plate={plate} size="lg" />
        </div>

        <div className="text-center text-stone-600 text-sm">
          <span className="font-mono font-bold">{getPlateLetters(plate)[0]}{getPlateLetters(plate)[1]}</span>
          {" + "}
          <span className="font-mono font-bold">{getPlateLetters(plate)[2]}{getPlateLetters(plate)[3]}</span>
          {canChain(plate) && (
            <>
              {"  ou Chasles ⛓️  "}
              <span className="font-mono font-bold">{getPlateLetters(plate)[0]}{getPlateLetters(plate)[3]}</span>
            </>
          )}
        </div>

        {/* Input avec micro */}
        <div className="relative">
          <input
            ref={inputRef}
            autoFocus
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            placeholder="ex : Daniel Auteuil et Paul Young"
            className="w-full p-4 pr-14 rounded-2xl border-2 border-stone-300 focus:border-stone-900 outline-none text-base bg-white"
          />
          <MicButton onTranscript={handleTranscript} disabled={verifying} />
        </div>

        {verifying && (
          <div className="p-3 rounded-xl text-sm text-center font-medium bg-blue-50 text-blue-900 border-2 border-blue-300 flex items-center justify-center gap-2">
            <span className="inline-block w-3 h-3 border-2 border-blue-900 border-t-transparent rounded-full animate-spin"/>
            Le jury consulte les archives...
          </div>
        )}

        {!verifying && feedback && (
          <div className={`p-3 rounded-xl text-sm font-medium ${
            feedback.valid
              ? "bg-green-100 text-green-900 border-2 border-green-400"
              : "bg-red-50 text-red-900 border-2 border-red-300"
          }`}>
            {feedback.valid ? (
              <div className="text-center space-y-1">
                <div>
                  ✓ {feedback.mode === "chasles" && "Chasles ! "}
                  {feedback.themeBonus && "Thème ! "}
                  {feedback.contested && "⚠️ Contesté "}
                  <span className="font-bold">+{feedback.points} pts</span>
                  {feedback.multiplier > 1 && (
                    <span className="ml-1 text-xs">(x{feedback.multiplier})</span>
                  )}
                </div>
                {feedback.comment && (
                  <div className="text-xs italic text-green-800">{feedback.comment}</div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-center">{feedback.reason}</div>
                {feedback.contestable && (
                  <button
                    onClick={handleContest}
                    className="w-full mt-2 bg-amber-500 hover:bg-amber-600 text-white p-3 rounded-xl text-sm font-medium"
                  >
                    🤔 Je maintiens · +{computePoints(feedback.contestable.result, false, feedback.contestable.streakAtSubmit)} pts
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Recherche de Claude */}
        {askingClaude && (
          <div className="p-3 rounded-xl bg-purple-50 border-2 border-purple-300 text-sm text-center font-medium text-purple-900 flex items-center justify-center gap-2">
            <span className="inline-block w-3 h-3 border-2 border-purple-900 border-t-transparent rounded-full animate-spin"/>
            Claude fouille les annales de l'Histoire...
          </div>
        )}

        {/* Indice de Claude */}
        {!askingClaude && claudeHint && (
          <div className="p-3 rounded-xl bg-purple-50 border-2 border-purple-300 text-sm space-y-1">
            <div className="text-xs text-purple-700 tracking-widest">🐈 L'ORACLE RÉVÈLE</div>
            <div className="font-medium text-purple-950">{claudeHint.answer}</div>
            {claudeHint.explanation && (
              <div className="text-xs text-purple-800 italic">{claudeHint.explanation}</div>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={handleAskClaude}
            disabled={verifying || askingClaude}
            className="p-3 bg-purple-100 text-purple-900 rounded-2xl font-medium text-xs sm:text-sm hover:bg-purple-200 disabled:opacity-50 transition-all"
          >
            {askingClaude ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 border-2 border-purple-900 border-t-transparent rounded-full animate-spin"/>
                Recherche...
              </span>
            ) : "🐈 Langue au chat"}
          </button>
          <button
            onClick={handleSkip}
            disabled={verifying}
            className="p-3 bg-stone-200 text-stone-700 rounded-2xl font-medium text-xs sm:text-sm hover:bg-stone-300 disabled:opacity-50 transition-all"
          >
            Passer mon tour
          </button>
          <button
            onClick={handleSubmit}
            disabled={!answer.trim() || verifying}
            className="p-3 bg-stone-900 text-white rounded-2xl font-medium text-xs sm:text-sm hover:bg-stone-800 disabled:bg-stone-400 transition-all"
          >
            {verifying ? "..." : "En avant !"}
          </button>
        </div>

        {history.length > 0 && (
          <div className="mt-2">
            <div className="text-xs text-stone-600 mb-2">CHRONIQUES</div>
            <div className="space-y-1.5">
              {history.map((h, i) => (
                <div key={i} className="bg-white/60 rounded-lg p-2 flex justify-between items-center text-xs">
                  <div className="min-w-0 flex-1">
                    <span className="font-mono font-bold text-stone-900">{h.plate}</span>
                    <span className="text-stone-600 ml-2 truncate">→ {h.answer}</span>
                  </div>
                  <span className="font-bold text-green-700 whitespace-nowrap ml-2">
                    +{h.points}
                    {h.mode === "chasles" && " ⛓️"}
                    {h.themeBonus && " 🎯"}
                    {h.contested && " ⚠️"}
                    {h.multiplier > 1 && ` ×${h.multiplier}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// MODE SOLO CHRONO
// ============================================================

const SoloChrono = ({ onBack }) => {
  const DURATION = 90;
  const [difficulty, setDifficulty] = useState("normal");
  const [phase, setPhase] = useState("ready");
  const [timeLeft, setTimeLeft] = useState(DURATION);
  const [plate, setPlate] = useState(() => randomPlate("normal"));
  const [answer, setAnswer] = useState("");
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [solved, setSolved] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [bestScore, setBestScore] = useState(0);
  // Stats de session (in-memory pour la partie en cours)
  const [stats, setStats] = useState({ people: {}, bestStreak: 0, chaslesCount: 0 });
  const [chronoHistory, setChronoHistory] = useState([]); // recap plaque par plaque
  const inputRef = useRef(null);

  useEffect(() => {
    try { const v = localStorage.getItem("chrono:best"); if (v) setBestScore(parseInt(v)); } catch (e) {}
  }, []);

  useEffect(() => {
    if (phase !== "playing") return;
    if (timeLeft <= 0) {
      setPhase("done");
      if (score > bestScore) {
        setBestScore(score);
        try { localStorage.setItem("chrono:best", String(score)); } catch (e) {}
      }
      return;
    }
    const t = setTimeout(() => setTimeLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, phase, score, bestScore]);

  const start = () => {
    setPhase("playing");
    setTimeLeft(DURATION);
    setPlate(randomPlate(difficulty));
    setScore(0);
    setSolved(0);
    setSkipped(0);
    setStreak(0);
    setStats({ people: {}, bestStreak: 0, chaslesCount: 0 });
    setChronoHistory([]);
    setAnswer("");
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleTranscript = (t) => {
    setAnswer(prev => (prev.trim() ? prev + " " : "") + t);
    inputRef.current?.focus();
  };

  const handleSubmit = async () => {
    if (!answer.trim()) return;
    const result = validateAnswer(answer, plate);
    if (!result.valid) {
      setFeedback({ valid: false, reason: result.reason });
      setTimeout(() => setFeedback(null), 1800);
      return;
    }

    const pts = computePoints(result, false, streak);
    const submittedPlate = plate;
    const submittedNames = result.names;
    const submittedMode = result.mode;
    const newStreak = streak + 1;

    setScore(s => s + pts);
    setSolved(s => s + 1);
    setStreak(newStreak);
    setStats(prev => {
      const newPeople = { ...prev.people };
      submittedNames.forEach(n => { newPeople[n] = (newPeople[n] || 0) + 1; });
      return {
        people: newPeople,
        bestStreak: Math.max(prev.bestStreak, newStreak),
        chaslesCount: prev.chaslesCount + (submittedMode === "chasles" ? 1 : 0),
      };
    });
    setFeedback({ valid: true, points: pts, mode: result.mode, multiplier: streakMultiplier(streak) });
    setChronoHistory(h => [...h, {
      plate: submittedPlate,
      answer: submittedNames.join(" + "),
      points: pts,
      mode: submittedMode,
      status: "accepted",
    }]);
    setPlate(randomPlate(difficulty));
    setAnswer("");
    setTimeout(() => setFeedback(null), 800);

    verifyCelebrities(submittedPlate, submittedNames, submittedMode, { id: "free" }).then(verif => {
      if (!verif.valid && !verif._fallback) {
        const badPeople = (verif.people || []).filter(p => !p.exists).map(p => p.name).join(", ");
        setScore(s => Math.max(0, s - pts));
        setSolved(s => Math.max(0, s - 1));
        setChronoHistory(h => h.map(entry =>
          entry.plate === submittedPlate && entry.answer === submittedNames.join(" + ") && entry.status === "accepted"
            ? { ...entry, status: "rejected", points: 0 }
            : entry
        ));
        setFeedback({
          valid: false,
          reason: `⚠️ ${badPeople || "inconnu"} rejeté (−${pts})`,
          contestable: { points: pts },
        });
        setTimeout(() => setFeedback(null), 4000);
      }
    });
  };

  const contestChrono = () => {
    if (!feedback?.contestable) return;
    setScore(s => s + feedback.contestable.points);
    setSolved(s => s + 1);
    // Restaurer la ligne d'historique
    setChronoHistory(h => {
      const idx = [...h].reverse().findIndex(e => e.status === "rejected");
      if (idx === -1) return h;
      const realIdx = h.length - 1 - idx;
      return h.map((e, i) => i === realIdx ? { ...e, status: "contested", points: feedback.contestable.points } : e);
    });
    setFeedback(null);
  };

  const handleSkip = () => {
    setSkipped(s => s + 1);
    setStreak(0);
    setChronoHistory(h => [...h, { plate, answer: "—", points: 0, mode: null, status: "skipped" }]);
    setPlate(randomPlate(difficulty));
    setAnswer("");
    setFeedback(null);
    inputRef.current?.focus();
  };

  const pct = (timeLeft / DURATION) * 100;
  const urgent = timeLeft <= 15;
  const currentMultiplier = streakMultiplier(streak);

  if (phase === "ready") {
    return (
      <div className="min-h-screen bg-gradient-cream flex flex-col p-4">
        <div className="w-full max-w-md mx-auto flex flex-col items-center gap-6 mt-8">
          <button onClick={onBack} className="self-start text-stone-700 hover:text-stone-900 text-sm">← Menu</button>
          <div className="text-center">
            <div className="text-xs tracking-[0.3em] text-stone-600 mb-1">MODE</div>
            <h2 className="font-display text-6xl text-stone-900">CHRONO</h2>
          </div>
          <Plate plate={randomPlate("normal")} size="lg" />
          <div className="text-center text-stone-700">
            <p className="text-lg">90 secondes</p>
            <p className="text-sm text-stone-600 mt-1">Enchaîne le plus de plaques possible</p>
          </div>

          <div className="w-full bg-white/60 rounded-2xl p-3">
            <div className="text-xs text-stone-600 mb-2 text-center">DIFFICULTÉ</div>
            <div className="flex gap-1.5">
              {DIFFICULTIES.map(d => (
                <button
                  key={d.id}
                  onClick={() => setDifficulty(d.id)}
                  className={`flex-1 px-2 py-2 rounded-full text-xs transition-all ${
                    difficulty === d.id ? "bg-stone-900 text-white" : "bg-white text-stone-700"
                  }`}
                >
                  {d.emoji} {d.label}
                </button>
              ))}
            </div>
          </div>

          {bestScore > 0 && (
            <div className="bg-white/60 px-6 py-3 rounded-2xl">
              <div className="text-xs text-stone-600">RECORD</div>
              <div className="font-display text-3xl text-stone-900">{bestScore} pts</div>
            </div>
          )}
          <button
            onClick={start}
            className="btn-chrono text-white px-12 py-5 rounded-2xl font-display text-3xl active:scale-95 transition-all shadow-lg"
          >
            DÉMARRER
          </button>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    const isRecord = score >= bestScore && score > 0;

    return (
      <div className="min-h-screen bg-gradient-cream flex flex-col p-4">
        <div className="w-full max-w-md mx-auto flex flex-col items-center gap-6 mt-12">
          <div className="text-center">
            <div className="text-xs tracking-[0.3em] text-stone-600 mb-2">TEMPS ÉCOULÉ</div>
            <h2 className="font-display text-6xl text-stone-900">TERMINÉ</h2>
            {isRecord && <div className="text-chrono font-bold mt-2 text-lg">🏆 NOUVEAU RECORD</div>}
          </div>

          <div className="bg-white/80 p-8 rounded-3xl flex flex-col items-center gap-2 border-2 border-stone-900 w-full">
            <div className="text-xs text-stone-600">SCORE FINAL</div>
            <div className="font-display text-7xl text-stone-900 leading-none">{score}</div>
            <div className="grid grid-cols-3 gap-4 mt-4 w-full">
              <div className="text-center">
                <div className="font-bold text-2xl text-stone-900">{solved}</div>
                <div className="text-xs text-stone-600">résolues</div>
              </div>
              <div className="text-center border-x border-stone-300">
                <div className="font-bold text-2xl text-stone-900">{skipped}</div>
                <div className="text-xs text-stone-600">passées</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-2xl text-stone-900">{stats.bestStreak}🔥</div>
                <div className="text-xs text-stone-600">série max</div>
              </div>
            </div>
          </div>

          {bestScore > 0 && !isRecord && (
            <div className="text-sm text-stone-600">
              Record actuel : <span className="font-bold text-stone-900">{bestScore}</span> pts
              {score > 0 && ` · à ${bestScore - score} pts`}
            </div>
          )}

          {chronoHistory.length > 0 && (
            <details open className="bg-white/60 rounded-2xl p-3 text-xs w-full">
              <summary className="cursor-pointer text-stone-700 font-medium">
                Rouvrir tes {chronoHistory.length} tentatives
              </summary>
              <div className="mt-2 space-y-1 max-h-72 overflow-y-auto">
                {chronoHistory.map((h, i) => (
                  <div key={i} className={`flex justify-between items-center p-2 rounded-lg ${
                    h.status === "accepted" ? "bg-green-50" :
                    h.status === "contested" ? "bg-amber-50" :
                    h.status === "rejected" ? "bg-red-50" :
                    "bg-stone-100"
                  }`}>
                    <div className="min-w-0 flex-1">
                      <span className="font-mono font-bold text-stone-900">{h.plate}</span>
                      <span className="text-stone-600 ml-2 truncate">→ {h.answer}</span>
                    </div>
                    <span className={`font-bold whitespace-nowrap ml-2 ${
                      h.status === "accepted" ? "text-green-700" :
                      h.status === "contested" ? "text-amber-700" :
                      h.status === "rejected" ? "text-red-700" :
                      "text-stone-500"
                    }`}>
                      {h.status === "accepted" && `+${h.points}`}
                      {h.status === "contested" && `+${h.points} ⚠️`}
                      {h.status === "rejected" && "✗"}
                      {h.status === "skipped" && "—"}
                      {h.mode === "chasles" && " ⛓️"}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}

          <div className="flex gap-2 w-full">
            <button onClick={onBack} className="flex-1 p-4 bg-stone-200 rounded-2xl font-medium">Menu</button>
            <button onClick={start} className="flex-1 p-4 bg-stone-900 text-white rounded-2xl font-medium">Rejouer</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-cream p-4 flex flex-col">
      <div className="w-full max-w-md mx-auto flex flex-col gap-4 flex-1">
        <header className="flex items-center justify-between">
          <button onClick={onBack} className="text-stone-700 text-sm">← Quitter</button>
          <div className="text-center">
            <div className="text-xs text-stone-600">SCORE</div>
            <div className="font-display text-3xl text-stone-900 leading-none">
              {score}
              {currentMultiplier > 1 && (
                <span className="ml-1 text-xs bg-chrono-solid text-white px-1 py-0.5 rounded align-middle">x{currentMultiplier}</span>
              )}
            </div>
          </div>
          <div className={`text-right transition-all ${urgent ? "animate-pulse" : ""}`}>
            <div className="text-xs text-stone-600">TEMPS</div>
            <div className={`font-display text-3xl leading-none ${urgent ? "text-chrono" : "text-stone-900"}`}>{timeLeft}</div>
          </div>
        </header>

        <div className="h-2 bg-stone-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ease-linear ${urgent ? "bg-chrono-solid" : "bg-stone-900"}`}
            style={{ width: `${pct}%`, transitionDuration: "1000ms" }}
          />
        </div>

        <div className="flex justify-center py-4">
          <Plate plate={plate} size="lg" />
        </div>

        <div className="text-center text-stone-600 text-sm">
          <span className="font-mono font-bold">{getPlateLetters(plate)[0]}{getPlateLetters(plate)[1]}</span>
          {" + "}
          <span className="font-mono font-bold">{getPlateLetters(plate)[2]}{getPlateLetters(plate)[3]}</span>
          {canChain(plate) && (
            <>
              {"  ou Chasles ⛓️  "}
              <span className="font-mono font-bold">{getPlateLetters(plate)[0]}{getPlateLetters(plate)[3]}</span>
            </>
          )}
        </div>

        <div className="relative">
          <input
            ref={inputRef}
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            placeholder="Tape vite..."
            className="w-full p-4 pr-14 rounded-2xl border-2 border-stone-300 focus:border-stone-900 outline-none text-base bg-white"
          />
          <MicButton onTranscript={handleTranscript} />
        </div>

        {feedback && (
          <div className={`p-3 rounded-xl text-sm font-medium ${
            feedback.valid
              ? "bg-green-100 text-green-900 border-2 border-green-400 text-center"
              : "bg-red-50 text-red-900 border-2 border-red-300"
          }`}>
            {feedback.valid ? (
              <div className="text-center">
                ✓ +{feedback.points}
                {feedback.multiplier > 1 && <span className="ml-1 text-xs">(x{feedback.multiplier})</span>}
              </div>
            ) : feedback.contestable ? (
              <div className="flex items-center justify-between gap-2">
                <span className="flex-1">{feedback.reason}</span>
                <button onClick={contestChrono} className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-xs whitespace-nowrap">
                  🤔 Contester
                </button>
              </div>
            ) : (
              <div className="text-center">{feedback.reason}</div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button onClick={handleSkip} className="p-4 bg-stone-200 rounded-2xl font-medium">Passer mon tour</button>
          <button onClick={handleSubmit} disabled={!answer.trim()} className="p-4 bg-stone-900 text-white rounded-2xl font-medium disabled:bg-stone-400">En avant !</button>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// MODE MULTI SALON
// ============================================================

const MultiRoom = ({ onBack }) => {
  const [phase, setPhase] = useState("lobby");
  const [roomCode, setRoomCode] = useState("");
  const [inputCode, setInputCode] = useState("");
  const [pseudo, setPseudo] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [room, setRoom] = useState(null);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [voteTick, setVoteTick] = useState(0);
  const pollRef = useRef(null);
  const resolvingRef = useRef(false);

  useEffect(() => {
    try { const v = localStorage.getItem("multi:pseudo"); if (v) setPseudo(v); } catch (e) {}
  }, []);

  const savePseudo = (p) => {
    setPseudo(p);
    try { localStorage.setItem("multi:pseudo", p); } catch (e) {}
  };

  const pollRoom = useCallback(async (code, pid) => {
    try {
      const data = await roomsAPI.get(code, pid);
      setRoom(data);
    } catch (e) {
      console.error("Poll error", e);
      if (e.message?.includes("404")) {
        setError("Le salon n\'existe plus.");
        setPhase("lobby");
      }
    }
  }, []);

  useEffect(() => {
    if (phase !== "inroom" || !roomCode) return;
    pollRoom(roomCode, playerId);
    pollRef.current = setInterval(() => pollRoom(roomCode, playerId), 1500);
    return () => clearInterval(pollRef.current);
  }, [phase, roomCode, playerId, pollRoom]);

  // Timer local pour rafraîchir l'affichage du vote
  useEffect(() => {
    if (room?.status !== "voting") return;
    const t = setInterval(() => setVoteTick(v => v + 1), 500);
    return () => clearInterval(t);
  }, [room?.status]);

  // Résolution automatique du vote quand timer expire
  useEffect(() => {
    if (room?.status !== "voting" || !room.vote || resolvingRef.current) return;
    const elapsed = Date.now() - room.vote.startedAt;
    if (elapsed >= 20000) {
      resolvingRef.current = true;
      roomsAPI.resolveVote(roomCode)
        .catch(e => console.error("resolve vote", e))
        .finally(() => { setTimeout(() => { resolvingRef.current = false; }, 2000); });
    }
  }, [room, roomCode, voteTick]);

  const createRoom = async () => {
    if (!pseudo.trim()) { setError("Choisis un pseudo."); return; }
    try {
      const res = await roomsAPI.create(pseudo);
      setPlayerId(res.playerId);
      setRoomCode(res.room.code);
      setRoom(res.room);
      setPhase("inroom");
      setError("");
    } catch (e) {
      setError("Les portes du salon restent closes...");
    }
  };

  const joinRoom = async () => {
    if (!pseudo.trim()) { setError("Choisis un pseudo."); return; }
    const code = inputCode.trim().toUpperCase();
    if (code.length !== 4) { setError("Le code fait 4 lettres."); return; }
    try {
      const res = await roomsAPI.join(code, pseudo);
      setPlayerId(res.playerId);
      setRoomCode(code);
      setRoom(res.room);
      setPhase("inroom");
      setError("");
    } catch (e) {
      setError("Ce salon s'est évaporé dans l'éther.");
    }
  };

  const leaveRoom = async () => {
    if (roomCode && playerId) {
      try { await roomsAPI.leave(roomCode, playerId); } catch (e) {}
    }
    clearInterval(pollRef.current);
    setPhase("lobby");
    setRoom(null);
    setRoomCode("");
    setPlayerId("");
  };

  const startRound = async () => {
    if (!room || room.host !== playerId) return;
    try {
      const updated = await roomsAPI.startRound(roomCode, playerId);
      setRoom(updated);
    } catch (e) { console.error(e); }
  };

  const nextRound = async () => {
    if (!room || room.host !== playerId) return;
    try {
      const updated = await roomsAPI.nextRound(roomCode, playerId);
      setRoom(updated);
      setAnswer("");
    } catch (e) { console.error(e); }
  };

  const submitAnswer = async () => {
    if (!answer.trim() || !room || room.status !== "playing" || verifying) return;
    setVerifying(true);
    try {
      const res = await roomsAPI.submit(roomCode, playerId, answer);
      setRoom(res.room);
      if (res.accepted) {
        setAnswer("");
        setFeedback({ valid: true, points: res.points });
      } else if (res.voting) {
        setAnswer("");
        setFeedback(null);
      } else {
        setFeedback({ valid: false, reason: res.reason });
      }
      setTimeout(() => setFeedback(null), 2500);
    } catch (e) {
      setFeedback({ valid: false, reason: e.message?.includes("409") ? "Un rival t'a devancé !" : "Erreur" });
      setTimeout(() => setFeedback(null), 2000);
    } finally {
      setVerifying(false);
    }
  };

  const castVote = async (accept) => {
    if (!room?.vote || room.vote.proposer === playerId) return;
    try {
      const updated = await roomsAPI.vote(roomCode, playerId, accept);
      setRoom(updated);
    } catch (e) { console.error(e); }
  };

  const passRound = async () => {
    if (!room || room.status !== "playing") return;
    try {
      const updated = await roomsAPI.pass(roomCode, playerId);
      setRoom(updated);
      setAnswer("");
    } catch (e) { console.error(e); }
  };

  const contestRound = async () => {
    if (!room || room.status !== "validated" || room.winner === playerId) return;
    if (!confirm("Défier ce verdict ? Le jury des autres joueurs tranchera.")) return;
    try {
      const updated = await roomsAPI.contest(roomCode, playerId);
      setRoom(updated);
    } catch (e) { console.error(e); }
  };

  // ============ LOBBY ============
  if (phase === "lobby") {
    return (
      <div className="min-h-screen bg-gradient-lobby p-4 flex flex-col">
        <div className="w-full max-w-md mx-auto flex flex-col gap-4">
          <button onClick={onBack} className="self-start text-stone-700 text-sm">← Menu</button>

          <div className="text-center mt-4">
            <div className="text-xs tracking-[0.3em] text-stone-600 mb-1">MODE</div>
            <h2 className="font-display text-6xl text-stone-900">MULTI</h2>
          </div>

          <div className="bg-white/80 p-5 rounded-2xl space-y-3 mt-4">
            <label className="block text-xs text-stone-600 uppercase tracking-wider">Ton pseudo</label>
            <input
              value={pseudo}
              onChange={e => savePseudo(e.target.value.slice(0, 16))}
              placeholder="Eugène"
              className="w-full p-3 rounded-xl border-2 border-stone-300 focus:border-stone-900 outline-none"
            />
          </div>

          <button
            onClick={createRoom}
            className="btn-multi text-white p-5 rounded-2xl font-display text-2xl active:scale-98 transition-all shadow-lg"
          >
            OUVRIR UN SALON
          </button>

          <div className="text-center text-stone-600 text-sm py-2">— ou —</div>

          <div className="bg-white/80 p-5 rounded-2xl space-y-3">
            <label className="block text-xs text-stone-600 uppercase tracking-wider">Code du salon</label>
            <input
              value={inputCode}
              onChange={e => setInputCode(e.target.value.toUpperCase().slice(0, 4))}
              placeholder="ABCD"
              className="w-full p-3 rounded-xl border-2 border-stone-300 focus:border-stone-900 outline-none font-mono text-center text-2xl tracking-widest"
            />
            <button onClick={joinRoom} className="w-full bg-stone-900 text-white p-3 rounded-xl font-medium">
              Rejoindre la mêlée
            </button>
          </div>

          {error && <div className="bg-red-100 text-red-900 p-3 rounded-xl text-sm text-center">{error}</div>}
        </div>
      </div>
    );
  }

  // ============ INROOM ============
  if (!room) {
    return (
      <div className="min-h-screen bg-gradient-lobby p-4 flex items-center justify-center">
        <div className="text-stone-700">Ouverture des portes du salon...</div>
      </div>
    );
  }

  const isHost = room.host === playerId;
  const players = Object.values(room.players).sort((a, b) => b.score - a.score);
  const isWaiting = room.status === "waiting";
  const isPlaying = room.status === "playing";
  const isValidated = room.status === "validated";
  const isVoting = room.status === "voting";
  const isSkipped = room.status === "skipped";
  const passes = room.passes || [];
  const hasPassed = passes.includes(playerId);
  const totalPlayers = Object.keys(room.players).length;
  const winnerPlayer = room.winner ? room.players[room.winner] : null;
  const voteTimeLeft = isVoting && room.vote
    ? Math.max(0, Math.ceil((20000 - (Date.now() - room.vote.startedAt)) / 1000))
    : 0;

  return (
    <div className="min-h-screen bg-gradient-lobby p-4 flex flex-col">
      <div className="w-full max-w-md mx-auto flex flex-col gap-3 flex-1">
        <header className="flex items-center justify-between">
          <button onClick={leaveRoom} className="text-stone-700 text-sm">← Quitter</button>
          <div className="text-center">
            <div className="text-xs text-stone-600">SALON</div>
            <div className="font-mono font-bold text-2xl tracking-widest text-stone-900">{roomCode}</div>
          </div>
          <div className="text-right text-sm text-stone-700">Manche {room.roundNumber}</div>
        </header>

        <div className="bg-white/80 rounded-2xl p-3">
          <div className="text-xs text-stone-600 mb-2">JOUEURS ({players.length})</div>
          <div className="space-y-1.5">
            {players.map((p, i) => (
              <div key={p.id} className={`flex justify-between items-center p-2 rounded-lg ${
                p.id === playerId ? "bg-stone-900 text-white" : "bg-stone-100"
              }`}>
                <div className="flex items-center gap-2">
                  <span className="text-xs opacity-60">#{i + 1}</span>
                  <span className="font-medium">{p.name}</span>
                  {p.id === room.host && <span className="text-xs opacity-60">👑</span>}
                </div>
                <span className="font-bold">{p.score} pts</span>
              </div>
            ))}
          </div>
        </div>

        {isWaiting && (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="text-stone-700 text-center">
              {isHost ? "Tu es le maître de cérémonie. Ouvre le bal !" : "Le maître de cérémonie prépare la première épreuve..."}
            </div>
            {isHost && (
              <button onClick={startRound} className="btn-chrono text-white px-10 py-4 rounded-2xl font-display text-2xl shadow-lg">
                QUE LES JEUX COMMENCENT
              </button>
            )}
          </div>
        )}

        {(isPlaying || isValidated || isVoting || isSkipped) && (
          <>
            <div className="flex justify-center py-4">
              <Plate plate={room.plate} size="lg" />
            </div>

            <div className="text-center text-stone-600 text-sm">
              <span className="font-mono font-bold">{getPlateLetters(room.plate)[0]}{getPlateLetters(room.plate)[1]}</span>
              {" + "}
              <span className="font-mono font-bold">{getPlateLetters(room.plate)[2]}{getPlateLetters(room.plate)[3]}</span>
              {canChain(room.plate) && (
                <>
                  {"  ou Chasles ⛓️  "}
                  <span className="font-mono font-bold">{getPlateLetters(room.plate)[0]}{getPlateLetters(room.plate)[3]}</span>
                </>
              )}
            </div>

            {isVoting && room.vote && (
              <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-4 space-y-3">
                <div className="text-xs text-amber-800 text-center tracking-widest">⚖️ VOTE · {voteTimeLeft}s</div>
                <div className="text-center">
                  <div className="text-xs text-stone-600 mb-1">{room.vote.proposerName} a proposé</div>
                  <div className="font-bold text-lg text-stone-900">{room.vote.answer}</div>
                  <div className="text-xs text-red-800 mt-2 italic">{room.vote.reason}</div>
                </div>

                {room.vote.proposer === playerId ? (
                  <div className="text-center bg-white/80 rounded-xl p-3">
                    <div className="text-sm text-stone-700">Les autres joueurs jugent ta réponse</div>
                    <div className="text-xs text-stone-600 mt-1">
                      ✓ {Object.values(room.vote.votes).filter(v => v).length} · ✗ {Object.values(room.vote.votes).filter(v => !v).length}
                      <span className="mx-1">·</span>
                      {Object.keys(room.players).length - 1 - Object.keys(room.vote.votes).length} en attente
                    </div>
                  </div>
                ) : room.vote.votes[playerId] !== undefined ? (
                  <div className="text-center bg-white/80 rounded-xl p-3">
                    <div className="text-sm text-stone-700">
                      Tu as voté <strong>{room.vote.votes[playerId] ? "OUI ✓" : "NON ✗"}</strong>
                    </div>
                    <div className="text-xs text-stone-600 mt-1">Attente des autres...</div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => castVote(false)} className="p-4 bg-red-100 hover:bg-red-200 text-red-900 rounded-xl font-medium border-2 border-red-300">
                      ✗ Non
                    </button>
                    <button onClick={() => castVote(true)} className="p-4 bg-green-100 hover:bg-green-200 text-green-900 rounded-xl font-medium border-2 border-green-300">
                      ✓ Oui, c\'est bon
                    </button>
                  </div>
                )}
              </div>
            )}

            {isPlaying && (
              <>
                {room.checking && room.checking.player !== playerId ? (
                  <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-center">
                    <div className="inline-block w-3 h-3 border-2 border-amber-700 border-t-transparent rounded-full animate-spin mr-2"/>
                    <span className="font-medium text-amber-900">{room.checking.name} dégaine "{room.checking.answer}"...</span>
                  </div>
                ) : hasPassed ? (
                  <div className="p-4 rounded-2xl bg-stone-100 border-2 border-stone-300 text-center">
                    <div className="text-sm text-stone-700">Tu as <strong>rendu les armes</strong></div>
                    <div className="text-xs text-stone-600 mt-1">
                      {passes.length} / {totalPlayers} ont capitulé — on attend les derniers guerriers...
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <input
                        autoFocus
                        value={answer}
                        onChange={e => setAnswer(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && submitAnswer()}
                        placeholder="Dégaine avant les autres..."
                        disabled={verifying || (room.checking && room.checking.player !== playerId)}
                        className="w-full p-4 pr-14 rounded-2xl border-2 border-stone-300 focus:border-stone-900 outline-none text-base bg-white disabled:bg-stone-100"
                      />
                      <MicButton onTranscript={(t) => setAnswer(prev => (prev.trim() ? prev + " " : "") + t)} disabled={verifying} />
                    </div>

                    {verifying && (
                      <div className="p-3 rounded-xl text-sm text-center font-medium bg-blue-50 text-blue-900 border-2 border-blue-300 flex items-center justify-center gap-2">
                        <span className="inline-block w-3 h-3 border-2 border-blue-900 border-t-transparent rounded-full animate-spin"/>
                        Le jury consulte les archives...
                      </div>
                    )}

                    {!verifying && feedback && (
                      <div className={`p-3 rounded-xl text-sm text-center font-medium ${
                        feedback.valid
                          ? "bg-green-100 text-green-900 border-2 border-green-400"
                          : "bg-red-50 text-red-900 border-2 border-red-300"
                      }`}>
                        {feedback.valid ? `✓ +${feedback.points} pts` : feedback.reason}
                      </div>
                    )}

                    <button
                      onClick={submitAnswer}
                      disabled={!answer.trim() || verifying}
                      className="w-full p-4 bg-stone-900 text-white rounded-2xl font-medium disabled:bg-stone-400"
                    >
                      {verifying ? "Le jury tranche..." : "En avant !"}
                    </button>

                    <button
                      onClick={passRound}
                      disabled={verifying}
                      className="w-full p-3 bg-white border-2 border-stone-300 text-stone-700 rounded-2xl font-medium text-sm hover:bg-stone-50 disabled:opacity-50"
                    >
                      Je rends les armes
                      {passes.length > 0 && (
                        <span className="ml-2 text-xs text-stone-500">({passes.length}/{totalPlayers})</span>
                      )}
                    </button>
                  </>
                )}
              </>
            )}

            {isSkipped && (
              <div className="bg-stone-100 border-2 border-stone-300 rounded-2xl p-4 text-center">
                <div className="text-xs text-stone-600">MANCHE ENSEVELIE</div>
                <div className="font-display text-2xl text-stone-800 mt-1">Nul n'a percé le mystère</div>
                <div className="text-xs text-stone-600 mt-1">Toute la troupe a rendu les armes</div>
                {isHost ? (
                  <button onClick={nextRound} className="mt-3 bg-stone-900 text-white px-6 py-2 rounded-xl">
                    Nouvelle épreuve →
                  </button>
                ) : (
                  <div className="mt-3 text-xs text-stone-600">Le maître de cérémonie prépare la suite...</div>
                )}
              </div>
            )}

            {isValidated && winnerPlayer && (
              <div className="bg-green-100 border-2 border-green-400 rounded-2xl p-4 text-center">
                <div className="text-xs text-green-800">VAINQUEUR DE LA MANCHE</div>
                <div className="font-display text-2xl text-green-900 mt-1">{winnerPlayer.name}</div>
                <div className="text-sm text-green-800 mt-1">{room.log[0]?.answer}</div>
                <div className="text-xs text-green-700 mt-1">
                  +{room.log[0]?.points} pts
                  {room.log[0]?.mode === "chasles" && " · Chasles ⛓️"}
                  {room.log[0]?.contested && " · ⚠️ contesté"}
                </div>
                <div className="mt-3 flex flex-col gap-2 items-center">
                  {isHost && (
                    <button onClick={nextRound} className="bg-stone-900 text-white px-6 py-2 rounded-xl">
                      Nouvelle épreuve →
                    </button>
                  )}
                  {!isHost && (
                    <div className="text-xs text-stone-600">Le maître de cérémonie prépare la suite...</div>
                  )}
                  {room.winner !== playerId && (
                    <button
                      onClick={contestRound}
                      className="text-xs text-red-800 underline hover:text-red-900 mt-1"
                    >
                      ⚠️ Défier ce verdict
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {room.log && room.log.length > 0 && (
          <div className="mt-2">
            <div className="text-xs text-stone-600 mb-1">CHRONIQUES DES ANCIENS</div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {room.log.slice(0, 5).map((entry, i) => (
                <div key={i} className="text-xs bg-white/60 rounded p-1.5 flex justify-between">
                  <span><span className="font-mono">{entry.plate}</span> · <strong>{entry.winner}</strong></span>
                  <span className="text-green-700 font-medium">+{entry.points}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// MODE DÉFI PARTAGÉ
// ============================================================

const CHALLENGE_LENGTH = 10;

const generateChallengePlates = (seed) => {
  const rng = mulberry32(seed);
  return Array.from({ length: CHALLENGE_LENGTH }, () => randomPlate("normal", rng));
};

const generateChallengeCode = () => Math.floor(1000 + Math.random() * 9000).toString();

const ChallengeMode = ({ onBack }) => {
  const [phase, setPhase] = useState("menu"); // menu | playing | done
  const [code, setCode] = useState("");
  const [inputCode, setInputCode] = useState("");
  const [pseudo, setPseudo] = useState("");
  const [plates, setPlates] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [results, setResults] = useState([]); // par plaque
  const [leaderboard, setLeaderboard] = useState([]);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    try { const v = localStorage.getItem("challenge:pseudo"); if (v) setPseudo(v); } catch (e) {}
  }, []);

  const savePseudo = (p) => {
    setPseudo(p);
    try { localStorage.setItem("challenge:pseudo", p); } catch (e) {}
  };

  const startChallenge = (challengeCode) => {
    const seed = parseInt(challengeCode);
    if (isNaN(seed)) { setError("Code invalide"); return; }
    setCode(challengeCode);
    setPlates(generateChallengePlates(seed));
    setCurrentIdx(0);
    setScore(0);
    setResults([]);
    setAnswer("");
    setFeedback(null);
    setError("");
    setPhase("playing");
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const createChallenge = () => {
    if (!pseudo.trim()) { setError("Choisis un pseudo pour partager ton score."); return; }
    startChallenge(generateChallengeCode());
  };

  const joinChallenge = () => {
    if (!pseudo.trim()) { setError("Choisis un pseudo."); return; }
    if (!/^\d{4}$/.test(inputCode.trim())) { setError("Le code fait 4 chiffres."); return; }
    startChallenge(inputCode.trim());
  };

  const handleSubmit = async () => {
    if (!answer.trim() || verifying) return;
    const currentPlate = plates[currentIdx];
    const result = validateAnswer(answer, currentPlate);

    if (!result.valid) {
      setFeedback({ valid: false, reason: result.reason });
      setTimeout(() => setFeedback(null), 2000);
      return;
    }

    setVerifying(true);
    const verification = await verifyCelebrities(currentPlate, result.names, result.mode, { id: "free" });
    setVerifying(false);

    let pts = 0;
    let accepted = false;
    if (verification.valid || verification._fallback) {
      pts = computePoints(result, false, 0); // pas de multiplicateur streak en défi (équité)
      accepted = true;
    }

    setResults(r => [...r, { plate: currentPlate, answer: result.names.join(" + "), points: pts, accepted, mode: result.mode }]);
    setScore(s => s + pts);
    setFeedback({ valid: accepted, points: pts, reason: accepted ? "" : (verification.reason || "Non reconnu") });

    setTimeout(() => {
      setFeedback(null);
      setAnswer("");
      if (currentIdx + 1 >= plates.length) {
        finishChallenge();
      } else {
        setCurrentIdx(i => i + 1);
        inputRef.current?.focus();
      }
    }, accepted ? 1200 : 2000);
  };

  const handleSkip = () => {
    const currentPlate = plates[currentIdx];
    setResults(r => [...r, { plate: currentPlate, answer: "—", points: 0, accepted: false, skipped: true }]);
    setAnswer("");
    setFeedback(null);
    if (currentIdx + 1 >= plates.length) {
      finishChallenge();
    } else {
      setCurrentIdx(i => i + 1);
      inputRef.current?.focus();
    }
  };

  const finishChallenge = async () => {
    setPhase("done");
    try {
      await challengesAPI.submitScore(code, pseudo, score, results.filter(r => r.accepted).length);
      const board = await challengesAPI.getLeaderboard(code);
      setLeaderboard(board);
    } catch (e) { console.error("challenge score", e); }
  };

  const shareText = `🏁 DÉFI INITIALES #${code} — j'ai marqué ${score} pts. Ose me défier.`;

  const copyShareText = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareText).catch(() => {});
    }
  };

  // ============ MENU ============
  if (phase === "menu") {
    return (
      <div className="min-h-screen bg-gradient-lobby p-4 flex flex-col">
        <div className="w-full max-w-md mx-auto flex flex-col gap-4">
          <button onClick={onBack} className="self-start text-stone-700 text-sm">← Menu</button>
          <div className="text-center mt-4">
            <div className="text-xs tracking-[0.3em] text-stone-600 mb-1">MODE</div>
            <h2 className="font-display text-6xl text-stone-900">DÉFI</h2>
            <p className="text-sm text-stone-600 mt-2">10 épreuves. Un même parcours pour tous.<br/>Qui inscrira son nom au sommet du tableau ?</p>
          </div>

          <div className="bg-white/80 p-5 rounded-2xl space-y-3 mt-4">
            <label className="block text-xs text-stone-600 uppercase tracking-wider">Ton pseudo</label>
            <input
              value={pseudo}
              onChange={e => savePseudo(e.target.value.slice(0, 16))}
              placeholder="Eugène"
              className="w-full p-3 rounded-xl border-2 border-stone-300 focus:border-stone-900 outline-none"
            />
          </div>

          <button
            onClick={createChallenge}
            className="btn-chrono text-white p-5 rounded-2xl font-display text-2xl active:scale-98 transition-all shadow-lg"
          >
            🏁 FORGER UN DÉFI
          </button>

          <div className="text-center text-stone-600 text-sm py-2">— ou —</div>

          <div className="bg-white/80 p-5 rounded-2xl space-y-3">
            <label className="block text-xs text-stone-600 uppercase tracking-wider">Code du défi</label>
            <input
              value={inputCode}
              onChange={e => setInputCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="1234"
              inputMode="numeric"
              className="w-full p-3 rounded-xl border-2 border-stone-300 focus:border-stone-900 outline-none font-mono text-center text-2xl tracking-widest"
            />
            <button
              onClick={joinChallenge}
              className="w-full bg-stone-900 text-white p-3 rounded-xl font-medium"
            >
              Relever le défi
            </button>
          </div>

          {error && <div className="bg-red-100 text-red-900 p-3 rounded-xl text-sm text-center">{error}</div>}
        </div>
      </div>
    );
  }

  // ============ FIN DÉFI ============
  if (phase === "done") {
    const acceptedCount = results.filter(r => r.accepted).length;
    return (
      <div className="min-h-screen bg-gradient-lobby p-4 flex flex-col">
        <div className="w-full max-w-md mx-auto flex flex-col gap-4">
          <div className="text-center mt-6">
            <div className="text-xs tracking-[0.3em] text-stone-600">DÉFI #{code}</div>
            <h2 className="font-display text-6xl text-stone-900 mt-1">ACHEVÉ</h2>
          </div>

          <div className="bg-white/80 p-6 rounded-3xl flex flex-col items-center gap-2 border-2 border-stone-900">
            <div className="text-xs text-stone-600">TA GLOIRE</div>
            <div className="font-display text-7xl text-stone-900 leading-none">{score}</div>
            <div className="text-sm text-stone-700 mt-2">{acceptedCount}/{plates.length} plaques terrassées</div>
          </div>

          {leaderboard.length > 1 && (
            <div className="bg-white/60 rounded-2xl p-4 space-y-2">
              <div className="text-xs text-stone-600 tracking-widest text-center">LE PANTHÉON</div>
              {leaderboard.slice(0, 5).map((entry, i) => (
                <div key={i} className={`flex justify-between items-center p-2 rounded-lg ${entry.pseudo === pseudo && entry.score === score ? "bg-stone-900 text-white" : "bg-white/80"}`}>
                  <span className="text-sm">
                    {i === 0 && "🥇 "}{i === 1 && "🥈 "}{i === 2 && "🥉 "}
                    #{i + 1} {entry.pseudo}
                  </span>
                  <span className="font-bold">{entry.score} pts</span>
                </div>
              ))}
            </div>
          )}

          <div className="bg-purple-50 border-2 border-purple-300 rounded-2xl p-4 text-center space-y-2">
            <div className="text-xs text-purple-700 tracking-widest">CONVOQUE LES ADVERSAIRES</div>
            <div className="font-mono text-3xl font-bold text-purple-900">#{code}</div>
            <div className="text-xs text-purple-800 italic">{shareText}</div>
            <button onClick={copyShareText} className="w-full mt-2 bg-purple-600 hover:bg-purple-700 text-white p-2 rounded-xl text-sm font-medium">
              📋 Copier le message
            </button>
          </div>

          <details className="bg-white/60 rounded-2xl p-3 text-xs">
            <summary className="cursor-pointer text-stone-700">Rouvrir les 10 épreuves</summary>
            <div className="mt-2 space-y-1">
              {results.map((r, i) => (
                <div key={i} className="flex justify-between p-1.5">
                  <span>
                    <span className="font-mono font-bold">{r.plate}</span>
                    <span className="text-stone-600 ml-2">→ {r.answer}</span>
                  </span>
                  <span className={r.accepted ? "text-green-700 font-bold" : "text-stone-500"}>
                    {r.accepted ? `+${r.points}` : r.skipped ? "—" : "✗"}
                  </span>
                </div>
              ))}
            </div>
          </details>

          <div className="flex gap-2 w-full">
            <button onClick={onBack} className="flex-1 p-4 bg-stone-200 rounded-2xl font-medium">Menu</button>
            <button onClick={() => setPhase("menu")} className="flex-1 p-4 bg-stone-900 text-white rounded-2xl font-medium">Nouveau défi</button>
          </div>
        </div>
      </div>
    );
  }

  // ============ JEU ============
  const currentPlate = plates[currentIdx];
  return (
    <div className="min-h-screen bg-gradient-lobby p-4 flex flex-col">
      <div className="w-full max-w-md mx-auto flex flex-col gap-4 flex-1">
        <header className="flex items-center justify-between">
          <button onClick={onBack} className="text-stone-700 text-sm">← Quitter</button>
          <div className="text-center">
            <div className="text-xs text-stone-600">DÉFI #{code}</div>
            <div className="text-sm font-bold text-stone-900">{currentIdx + 1} / {plates.length}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-stone-600">SCORE</div>
            <div className="font-display text-2xl text-stone-900 leading-none">{score}</div>
          </div>
        </header>

        <div className="h-2 bg-stone-200 rounded-full overflow-hidden">
          <div className="h-full bg-stone-900 transition-all" style={{ width: `${(currentIdx / plates.length) * 100}%` }}/>
        </div>

        <div className="flex justify-center py-4">
          <Plate plate={currentPlate} size="lg" />
        </div>

        <div className="text-center text-stone-600 text-sm">
          <span className="font-mono font-bold">{getPlateLetters(currentPlate)[0]}{getPlateLetters(currentPlate)[1]}</span>
          {" + "}
          <span className="font-mono font-bold">{getPlateLetters(currentPlate)[2]}{getPlateLetters(currentPlate)[3]}</span>
          {canChain(currentPlate) && (
            <>
              {"  ou Chasles ⛓️  "}
              <span className="font-mono font-bold">{getPlateLetters(currentPlate)[0]}{getPlateLetters(currentPlate)[3]}</span>
            </>
          )}
        </div>

        <div className="relative">
          <input
            ref={inputRef}
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            placeholder="Ta réponse..."
            className="w-full p-4 pr-14 rounded-2xl border-2 border-stone-300 focus:border-stone-900 outline-none text-base bg-white"
          />
          <MicButton
            onTranscript={(t) => setAnswer(prev => (prev.trim() ? prev + " " : "") + t)}
            disabled={verifying}
          />
        </div>

        {verifying && (
          <div className="p-3 rounded-xl text-sm text-center font-medium bg-blue-50 text-blue-900 border-2 border-blue-300 flex items-center justify-center gap-2">
            <span className="inline-block w-3 h-3 border-2 border-blue-900 border-t-transparent rounded-full animate-spin"/>
            Vérification...
          </div>
        )}

        {!verifying && feedback && (
          <div className={`p-3 rounded-xl text-sm text-center font-medium ${
            feedback.valid ? "bg-green-100 text-green-900 border-2 border-green-400" : "bg-red-50 text-red-900 border-2 border-red-300"
          }`}>
            {feedback.valid ? `✓ +${feedback.points} pts` : feedback.reason}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button onClick={handleSkip} disabled={verifying} className="p-4 bg-stone-200 rounded-2xl font-medium disabled:opacity-50">Passer</button>
          <button onClick={handleSubmit} disabled={!answer.trim() || verifying} className="p-4 bg-stone-900 text-white rounded-2xl font-medium disabled:bg-stone-400">
            {verifying ? "..." : "Valider"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// APP PRINCIPALE
// ============================================================

export default function App() {
  const [mode, setMode] = useState(null);

  return (
    <>
      {mode === null && <Home onSelectMode={setMode} />}
      {mode === "zen" && <SoloZen onBack={() => setMode(null)} />}
      {mode === "chrono" && <SoloChrono onBack={() => setMode(null)} />}
      {mode === "multi" && <MultiRoom onBack={() => setMode(null)} />}
      {mode === "defi" && <ChallengeMode onBack={() => setMode(null)} />}
    </>
  );
}
