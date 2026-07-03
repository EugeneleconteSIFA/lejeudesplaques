// Client API — tous les appels au backend passent par ici.
// En dev, Vite proxifie /api vers http://localhost:8000.
// En prod, nginx proxifie /api vers le backend.

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

async function apiCall(path, options = {}) {
  const url = `${API_BASE}${path}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    return await res.json();
  } catch (e) {
    console.error(`API ${path} failed:`, e);
    throw e;
  }
}

// ==========================================================
// VÉRIFICATION CLAUDE
// ==========================================================

export async function verifyCelebrities(plate, names, mode, theme) {
  try {
    return await apiCall("/verify", {
      method: "POST",
      body: JSON.stringify({ plate, names, mode, theme }),
    });
  } catch (e) {
    return { valid: true, people: [], reason: "", comment: "", _fallback: true };
  }
}

export async function askClaudeForAnswer(plate, theme, insist = false) {
  try {
    return await apiCall("/ask-claude", {
      method: "POST",
      body: JSON.stringify({ plate, theme, insist }),
    });
  } catch (e) {
    return { answer: "Impossible de contacter Claude", explanation: e.message, chasles: false };
  }
}

// ==========================================================
// SALONS MULTI
// ==========================================================

export const rooms = {
  create: (pseudo) =>
    apiCall("/rooms", { method: "POST", body: JSON.stringify({ pseudo }) }),
  join: (code, pseudo) =>
    apiCall(`/rooms/${code}/join`, { method: "POST", body: JSON.stringify({ pseudo }) }),
  get: (code, playerId) =>
    apiCall(`/rooms/${code}${playerId ? `?playerId=${playerId}` : ""}`),
  leave: (code, playerId) =>
    apiCall(`/rooms/${code}/leave`, { method: "POST", body: JSON.stringify({ playerId }) }),
  startRound: (code, playerId) =>
    apiCall(`/rooms/${code}/start-round`, { method: "POST", body: JSON.stringify({ playerId }) }),
  nextRound: (code, playerId) =>
    apiCall(`/rooms/${code}/next-round`, { method: "POST", body: JSON.stringify({ playerId }) }),
  submit: (code, playerId, answer) =>
    apiCall(`/rooms/${code}/submit`, { method: "POST", body: JSON.stringify({ playerId, answer }) }),
  vote: (code, playerId, accept) =>
    apiCall(`/rooms/${code}/vote`, { method: "POST", body: JSON.stringify({ playerId, accept }) }),
  resolveVote: (code) =>
    apiCall(`/rooms/${code}/resolve-vote`, { method: "POST", body: "{}" }),
  pass: (code, playerId) =>
    apiCall(`/rooms/${code}/pass`, { method: "POST", body: JSON.stringify({ playerId }) }),
};

// ==========================================================
// DÉFIS PARTAGÉS
// ==========================================================

export const challenges = {
  submitScore: (code, pseudo, score, solved) =>
    apiCall(`/challenges/${code}/score`, {
      method: "POST",
      body: JSON.stringify({ pseudo, score, solved }),
    }),
  getLeaderboard: (code, limit = 10) =>
    apiCall(`/challenges/${code}/leaderboard?limit=${limit}`),
};
