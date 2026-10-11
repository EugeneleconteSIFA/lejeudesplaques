// Sons du jeu (générés par Game Song IA, Full Gaz) : coupés par défaut, choix mémorisé,
// rien n'est chargé ni joué avant que le joueur active le son (un clic). Web Audio,
// .ogg (Opus) si le navigateur le lit, sinon .mp3. Toute erreur est silencieuse.
import { useEffect, useState } from "react";

const KEY = "plaques:sound";
const SOUNDS = ["correct", "wrong", "skip", "tick", "time_up", "record", "click"];
const SFX_VOLUME = 0.45;
const MUSIC_VOLUME = 0.06; // très discrète

let enabled = false;
try { enabled = localStorage.getItem(KEY) === "on"; } catch (e) { /* */ }
let ctx = null;
let master = null;
const buffers = new Map();
const listeners = new Set();
let wantedMusic = null;
let current = null;

const ext = () => {
  try { return new Audio().canPlayType('audio/ogg; codecs="opus"') ? "ogg" : "mp3"; } catch (e) { return "mp3"; }
};

const unlock = () => {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
  } catch (e) { ctx = null; }
};

const load = (id) => {
  if (!ctx) return Promise.resolve(null);
  if (!buffers.has(id)) {
    const c = ctx;
    buffers.set(id, fetch(`${import.meta.env.BASE_URL}audio/${id}.${ext()}`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      .then((data) => new Promise((ok, ko) => c.decodeAudioData(data, ok, ko)))
      .catch(() => null));
  }
  return buffers.get(id);
};

const startMusic = () => {
  if (current && current.id === wantedMusic && enabled) return;
  stopMusic();
  const id = wantedMusic;
  if (!id || !enabled || !ctx) return;
  load(id).then((buffer) => {
    if (!buffer || !enabled || wantedMusic !== id || current) return;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    source.loop = true;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(MUSIC_VOLUME, ctx.currentTime + 1);
    source.connect(gain).connect(master);
    source.start();
    current = { id, source, gain };
  });
};

const stopMusic = () => {
  const playing = current;
  current = null;
  if (!playing || !ctx) return;
  const t = ctx.currentTime;
  playing.gain.gain.cancelScheduledValues(t);
  playing.gain.gain.setValueAtTime(playing.gain.gain.value, t);
  playing.gain.gain.linearRampToValueAtTime(0, t + 0.5);
  playing.source.stop(t + 0.5);
};

export const isSoundOn = () => enabled;

// À appeler depuis un clic (le navigateur n'autorise le son qu'après un geste).
export const setSoundOn = (on) => {
  enabled = on;
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (e) { /* */ }
  if (on) {
    unlock();
    SOUNDS.forEach(load);
    startMusic();
  } else {
    stopMusic();
  }
  listeners.forEach((l) => l(on));
};

export const playSound = (id, volume = 1) => {
  if (!enabled || !ctx) return;
  const c = ctx;
  load(id).then((buffer) => {
    if (!buffer || !enabled) return;
    const source = c.createBufferSource();
    const gain = c.createGain();
    gain.gain.value = SFX_VOLUME * volume;
    source.buffer = buffer;
    source.connect(gain).connect(master);
    source.start();
  });
};

// Musique de fond (null : aucune). Mémorisée même son coupé.
export const setMusic = (id) => {
  if (wantedMusic === id) return;
  wantedMusic = id;
  startMusic();
};

export const useSoundOn = () => {
  const [on, setOn] = useState(enabled);
  useEffect(() => { listeners.add(setOn); return () => listeners.delete(setOn); }, []);
  return on;
};

if (typeof window !== "undefined") {
  // Son activé lors d'une visite précédente : le contexte audio attend le premier geste.
  const first = () => {
    window.removeEventListener("pointerdown", first, true);
    window.removeEventListener("keydown", first, true);
    if (!enabled) return;
    unlock();
    SOUNDS.forEach(load);
    startMusic();
  };
  window.addEventListener("pointerdown", first, true);
  window.addEventListener("keydown", first, true);
  // Clics de l'interface : tous les boutons.
  document.addEventListener("click", (e) => {
    if (e.target instanceof Element && e.target.closest("button")) playSound("click", 0.5);
  });
}
