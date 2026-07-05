"""
Initiales — Backend FastAPI
Proxifie l'API Anthropic, gère les salons multi et les leaderboards des défis.
"""
import os
import time
import json
import uuid
import random
import string
import sqlite3
import asyncio
from typing import Optional
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from game_logic import (
    validate_answer, can_chain, compute_points, extract_json,
    verify_prompt, ask_prompt, VerifyResult
)

# ============================================================
# CONFIGURATION
# ============================================================

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-5")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
DB_PATH = os.getenv("DB_PATH", "/var/lib/initiales/initiales.db")
ROOM_TTL_SECONDS = 30 * 60  # 30 minutes d'inactivité → cleanup

# ============================================================
# STOCKAGE SALONS MULTI (en mémoire)
# ============================================================

# Structure : { code: {state dict} }
rooms: dict[str, dict] = {}
rooms_lock = asyncio.Lock()  # sérialise les mutations par salon

async def cleanup_rooms_task():
    """Supprime les salons inactifs toutes les 5 minutes."""
    while True:
        await asyncio.sleep(300)
        now = time.time()
        async with rooms_lock:
            expired = []
            for code, room in list(rooms.items()):
                last_activity = max(
                    (p.get("lastSeen", 0) for p in room.get("players", {}).values()),
                    default=0
                )
                if now - last_activity > ROOM_TTL_SECONDS:
                    expired.append(code)
            for code in expired:
                rooms.pop(code, None)

# ============================================================
# STOCKAGE DÉFIS (SQLite)
# ============================================================

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS challenge_scores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT NOT NULL,
                pseudo TEXT NOT NULL,
                score INTEGER NOT NULL,
                solved INTEGER NOT NULL DEFAULT 0,
                played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_code_score ON challenge_scores(code, score DESC)")

# ============================================================
# LIFESPAN
# ============================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    cleanup_task = asyncio.create_task(cleanup_rooms_task())
    yield
    cleanup_task.cancel()

app = FastAPI(title="Initiales API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# APPELS CLAUDE (proxifié)
# ============================================================

async def call_claude(prompt: str, max_tokens: int = 1000) -> str:
    if not ANTHROPIC_API_KEY:
        raise HTTPException(500, "ANTHROPIC_API_KEY not configured")
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": CLAUDE_MODEL,
                "max_tokens": max_tokens,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        if r.status_code != 200:
            raise HTTPException(502, f"Anthropic API error {r.status_code}: {r.text[:200]}")
        data = r.json()
        return "".join(c.get("text", "") for c in data.get("content", []) if c.get("type") == "text")

# ============================================================
# ENDPOINTS — VÉRIFICATION CLAUDE
# ============================================================

class VerifyRequest(BaseModel):
    plate: str
    names: list[str]
    mode: str  # "direct" | "chasles"
    theme: Optional[dict] = None

@app.post("/api/verify")
async def api_verify(req: VerifyRequest):
    prompt = verify_prompt(req.plate, req.names, req.mode, req.theme)
    try:
        text = await call_claude(prompt, max_tokens=1000)
    except HTTPException:
        raise
    except Exception as e:
        return {"valid": True, "people": [], "reason": "", "comment": "", "_fallback": True, "error": str(e)}
    parsed = extract_json(text)
    if not parsed:
        return {"valid": True, "people": [], "reason": "", "comment": "", "_fallback": True, "raw": text[:500]}
    return parsed

class AskRequest(BaseModel):
    plate: str
    theme: Optional[dict] = None
    insist: bool = False

@app.post("/api/ask-claude")
async def api_ask_claude(req: AskRequest):
    prompt = ask_prompt(req.plate, req.theme, req.insist)
    try:
        text = await call_claude(prompt, max_tokens=1000)
    except HTTPException:
        raise
    except Exception as e:
        return {"answer": "Impossible de contacter Claude", "explanation": str(e), "chasles": False}

    import re
    r_match = re.search(r"<reponse>([\s\S]*?)</reponse>", text, re.IGNORECASE)
    e_match = re.search(r"<explication>([\s\S]*?)</explication>", text, re.IGNORECASE)
    if not r_match:
        return {"answer": "Claude n'a rien trouvé", "explanation": "Réessaie.", "chasles": False, "raw": text[:500]}
    answer = r_match.group(1).strip().strip("\"'«» *")
    explanation = e_match.group(1).strip().replace("*", "") if e_match else ""
    return {"answer": answer, "explanation": explanation, "chasles": False}

# ============================================================
# ENDPOINTS — SALONS MULTI
# ============================================================

def new_room_code() -> str:
    chars = "ABCDEFGHJKLMNPQRSTVWXYZ"
    while True:
        code = "".join(random.choice(chars) for _ in range(4))
        if code not in rooms:
            return code

def random_plate() -> str:
    """Duplication minimale de la logique frontend pour générer une plaque côté serveur."""
    weights = {
        "A": 6, "B": 4, "C": 6, "D": 6, "E": 5, "F": 4, "G": 4, "H": 3,
        "J": 6, "K": 2, "L": 6, "M": 6, "N": 4, "P": 6, "Q": 1, "R": 6,
        "S": 6, "T": 4, "V": 3, "W": 2, "X": 1, "Y": 2, "Z": 2,
    }
    letters = list(weights.keys())
    probs = list(weights.values())
    def pick():
        return random.choices(letters, weights=probs, k=1)[0]
    digits = f"{random.randint(1, 999):03d}"
    return f"{pick()}{pick()}-{digits}-{pick()}{pick()}"

def touch_player(room: dict, player_id: str):
    if player_id in room["players"]:
        room["players"][player_id]["lastSeen"] = time.time() * 1000

class CreateRoomRequest(BaseModel):
    pseudo: str

@app.post("/api/rooms")
async def create_room(req: CreateRoomRequest):
    if not req.pseudo.strip():
        raise HTTPException(400, "Pseudo required")
    async with rooms_lock:
        code = new_room_code()
        player_id = uuid.uuid4().hex[:8]
        room = {
            "code": code,
            "host": player_id,
            "status": "waiting",
            "plate": random_plate(),
            "roundNumber": 0,
            "winner": None,
            "players": {
                player_id: {"id": player_id, "name": req.pseudo[:16], "score": 0, "lastSeen": time.time() * 1000}
            },
            "log": [],
            "checking": None,
            "vote": None,
            "passes": [],
        }
        rooms[code] = room
    return {"playerId": player_id, "room": room}

class JoinRoomRequest(BaseModel):
    pseudo: str

@app.post("/api/rooms/{code}/join")
async def join_room(code: str, req: JoinRoomRequest):
    async with rooms_lock:
        room = rooms.get(code.upper())
        if not room:
            raise HTTPException(404, "Salon introuvable")
        player_id = uuid.uuid4().hex[:8]
        room["players"][player_id] = {
            "id": player_id, "name": req.pseudo[:16], "score": 0, "lastSeen": time.time() * 1000
        }
    return {"playerId": player_id, "room": room}

@app.get("/api/rooms/{code}")
async def get_room(code: str, playerId: Optional[str] = None):
    async with rooms_lock:
        room = rooms.get(code.upper())
        if not room:
            raise HTTPException(404, "Salon introuvable")
        if playerId:
            touch_player(room, playerId)
    return room

class LeaveRequest(BaseModel):
    playerId: str

@app.post("/api/rooms/{code}/leave")
async def leave_room(code: str, req: LeaveRequest):
    async with rooms_lock:
        room = rooms.get(code.upper())
        if not room:
            return {"ok": True}
        room["players"].pop(req.playerId, None)
        if not room["players"]:
            rooms.pop(code.upper(), None)
            return {"ok": True}
        if room["host"] == req.playerId:
            room["host"] = next(iter(room["players"]))
    return {"ok": True, "room": room}

class HostActionRequest(BaseModel):
    playerId: str

@app.post("/api/rooms/{code}/start-round")
async def start_round(code: str, req: HostActionRequest):
    async with rooms_lock:
        room = rooms.get(code.upper())
        if not room:
            raise HTTPException(404, "Salon introuvable")
        if room["host"] != req.playerId:
            raise HTTPException(403, "Seul l'hôte peut lancer une manche")
        room["status"] = "playing"
        room["plate"] = random_plate()
        room["roundNumber"] += 1
        room["winner"] = None
        room["checking"] = None
        room["vote"] = None
        room["passes"] = []
    return room

@app.post("/api/rooms/{code}/next-round")
async def next_round(code: str, req: HostActionRequest):
    return await start_round(code, req)

class SubmitRequest(BaseModel):
    playerId: str
    answer: str

@app.post("/api/rooms/{code}/submit")
async def submit_answer(code: str, req: SubmitRequest):
    """
    Soumet une réponse en multi.
    Le serveur valide les initiales, lock le salon, appelle Claude pour vérification,
    puis met à jour l'état (validé, contestation ou rejet).
    """
    # Lecture initiale + lock
    async with rooms_lock:
        room = rooms.get(code.upper())
        if not room:
            raise HTTPException(404, "Salon introuvable")
        if room["status"] != "playing":
            raise HTTPException(400, "Le salon n'est pas en cours de manche")
        if room.get("checking") or room.get("winner"):
            raise HTTPException(409, "Un autre joueur est en train de répondre")

        plate = room["plate"]
        pseudo = room["players"][req.playerId]["name"]

        # Validation locale des initiales
        result = validate_answer(req.answer, plate)
        if not result["valid"]:
            return {"accepted": False, "reason": result["reason"], "room": room}

        # Lock : passe en "checking"
        room["checking"] = {
            "player": req.playerId,
            "name": pseudo,
            "answer": " + ".join(result["names"]),
            "startedAt": time.time() * 1000,
        }

    # Appel Claude hors du lock (peut prendre du temps)
    prompt = verify_prompt(plate, result["names"], result["mode"], None)
    verification = None
    try:
        text = await call_claude(prompt, max_tokens=1000)
        verification = extract_json(text) or {"_fallback": True, "valid": True, "people": []}
    except Exception as e:
        verification = {"_fallback": True, "valid": True, "people": [], "error": str(e)}

    # Mise à jour finale
    async with rooms_lock:
        room = rooms.get(code.upper())
        if not room or room.get("checking", {}).get("player") != req.playerId:
            return {"accepted": False, "reason": "Lock perdu", "room": room}

        is_valid = verification.get("valid", True) or verification.get("_fallback", False)

        if is_valid:
            pts = compute_points(result, False, 0)
            room["status"] = "validated"
            room["winner"] = req.playerId
            room["players"][req.playerId]["score"] += pts
            room["log"] = [{
                "round": room["roundNumber"], "plate": plate, "winner": pseudo,
                "answer": " + ".join(result["names"]), "points": pts, "mode": result["mode"],
            }] + room.get("log", [])[:9]
            room["checking"] = None
            return {"accepted": True, "points": pts, "room": room}

        # Refus par Claude → passage en vote si d'autres joueurs, sinon rejet direct
        bad_people = [p["name"] for p in verification.get("people", []) if not p.get("exists")]
        reason = f"Claude ne reconnaît pas : {', '.join(bad_people)}" if bad_people else verification.get("reason", "Refusé")
        other_players = [pid for pid in room["players"] if pid != req.playerId]

        if not other_players:
            room["checking"] = None
            return {"accepted": False, "reason": reason, "room": room}

        # Vote
        room["status"] = "voting"
        room["vote"] = {
            "proposer": req.playerId,
            "proposerName": pseudo,
            "plate": plate,
            "answer": " + ".join(result["names"]),
            "reason": reason,
            "startedAt": time.time() * 1000,
            "votes": {},
            "resultData": {"points": compute_points(result, False, 0), "mode": result["mode"]},
        }
        room["checking"] = None
        return {"accepted": False, "voting": True, "reason": reason, "room": room}

class VoteRequest(BaseModel):
    playerId: str
    accept: bool

@app.post("/api/rooms/{code}/vote")
async def cast_vote(code: str, req: VoteRequest):
    async with rooms_lock:
        room = rooms.get(code.upper())
        if not room:
            raise HTTPException(404, "Salon introuvable")
        if room["status"] != "voting" or not room.get("vote"):
            raise HTTPException(400, "Pas de vote en cours")
        if room["vote"]["proposer"] == req.playerId:
            raise HTTPException(400, "Le proposeur ne peut pas voter")
        room["vote"]["votes"][req.playerId] = req.accept

        # Résolution auto si tous ont voté ou timer expiré
        eligible = len(room["players"]) - 1
        votes = list(room["vote"]["votes"].values())
        elapsed = time.time() * 1000 - room["vote"]["startedAt"]
        if len(votes) >= eligible or elapsed > 20000:
            _resolve_vote(room)
    return room

class ContestRequest(BaseModel):
    playerId: str

@app.post("/api/rooms/{code}/contest")
async def contest_round(code: str, req: ContestRequest):
    """Un joueur conteste la victoire déjà validée. Ouvre un vote."""
    async with rooms_lock:
        room = rooms.get(code.upper())
        if not room:
            raise HTTPException(404, "Salon introuvable")
        if room["status"] != "validated":
            raise HTTPException(400, "Rien à contester")
        if req.playerId not in room["players"]:
            raise HTTPException(403, "Joueur inconnu")
        winner_id = room.get("winner")
        if req.playerId == winner_id:
            raise HTTPException(400, "Tu ne peux pas contester ta propre victoire")
        last_log = room["log"][0] if room.get("log") else {}
        winner_name = room["players"].get(winner_id, {}).get("name", "?")
        contester_name = room["players"][req.playerId]["name"]
        room["status"] = "voting"
        room["vote"] = {
            "proposer": winner_id,
            "proposerName": winner_name,
            "plate": last_log.get("plate", room["plate"]),
            "answer": last_log.get("answer", ""),
            "reason": f"Contesté par {contester_name}",
            "startedAt": time.time() * 1000,
            "votes": {req.playerId: False},  # contester = vote NON d'office
            "resultData": {"points": last_log.get("points", 0), "mode": last_log.get("mode", "normal")},
            "contest": True,
        }
        # Résolution auto si tous ont voté (cas 2 joueurs : le seul non-gagnant a voté)
        eligible = len(room["players"]) - 1
        if len(room["vote"]["votes"]) >= eligible:
            _resolve_vote(room)
    return room

class PassRequest(BaseModel):
    playerId: str

@app.post("/api/rooms/{code}/pass")
async def pass_round(code: str, req: PassRequest):
    """Un joueur déclare 'je ne sais pas'. Si tous ont passé, la manche est skipée."""
    async with rooms_lock:
        room = rooms.get(code.upper())
        if not room:
            raise HTTPException(404, "Salon introuvable")
        if room["status"] != "playing":
            raise HTTPException(400, "Le salon n'est pas en cours de manche")
        if req.playerId not in room["players"]:
            raise HTTPException(403, "Joueur inconnu")
        passes = room.setdefault("passes", [])
        if req.playerId not in passes:
            passes.append(req.playerId)
        # Si tous les joueurs ont passé → skip
        if len(passes) >= len(room["players"]):
            room["status"] = "skipped"
            room["log"] = [{
                "round": room["roundNumber"], "plate": room["plate"], "winner": "—",
                "answer": "personne n'a trouvé", "points": 0, "mode": "skipped",
            }] + room.get("log", [])[:9]
        return room

@app.post("/api/rooms/{code}/resolve-vote")
async def resolve_vote(code: str):
    """Endpoint pour forcer la résolution du vote (appelé par le client si timer expiré)."""
    async with rooms_lock:
        room = rooms.get(code.upper())
        if not room:
            raise HTTPException(404, "Salon introuvable")
        if room["status"] == "voting" and room.get("vote"):
            _resolve_vote(room)
    return room

def _resolve_vote(room: dict):
    """Résoud le vote en cours."""
    vote = room["vote"]
    votes = list(vote["votes"].values())
    yes = sum(1 for v in votes if v)
    no = sum(1 for v in votes if not v)

    if vote.get("contest"):
        # Contestation d'un round déjà validé. yes = "on garde", no = "on annule".
        # Égalité → présomption d'innocence, on garde.
        keep = yes >= no
        proposer = vote["proposer"]
        pts = vote["resultData"]["points"]
        if keep:
            room["status"] = "validated"
        else:
            # Retirer points au gagnant, retirer la dernière ligne d'historique
            if proposer in room["players"]:
                room["players"][proposer]["score"] = max(0, room["players"][proposer]["score"] - pts)
            if room.get("log"):
                room["log"] = room["log"][1:]
            room["status"] = "skipped"
            room["winner"] = None
            room["log"] = [{
                "round": room["roundNumber"], "plate": vote["plate"], "winner": "—",
                "answer": f"« {vote['answer']} » invalidé", "points": 0, "mode": "contested_out",
            }] + room.get("log", [])[:9]
        room["vote"] = None
        return

    # Flow original : vote après refus par Claude
    validated = yes > no
    if validated:
        proposer = vote["proposer"]
        pts = vote["resultData"]["points"]
        room["status"] = "validated"
        room["winner"] = proposer
        room["players"][proposer]["score"] += pts
        room["log"] = [{
            "round": room["roundNumber"], "plate": vote["plate"], "winner": vote["proposerName"],
            "answer": vote["answer"], "points": pts, "mode": vote["resultData"]["mode"], "contested": True,
        }] + room.get("log", [])[:9]
    else:
        room["status"] = "playing"
    room["vote"] = None

# ============================================================
# ENDPOINTS — DÉFIS PARTAGÉS
# ============================================================

class ChallengeScoreRequest(BaseModel):
    pseudo: str
    score: int
    solved: int = 0

@app.post("/api/challenges/{code}/score")
async def submit_challenge_score(code: str, req: ChallengeScoreRequest):
    if not code.isdigit() or len(code) != 4:
        raise HTTPException(400, "Code invalide")
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "INSERT INTO challenge_scores (code, pseudo, score, solved) VALUES (?, ?, ?, ?)",
            (code, req.pseudo[:16], req.score, req.solved),
        )
    return {"ok": True}

@app.get("/api/challenges/{code}/leaderboard")
async def get_challenge_leaderboard(code: str, limit: int = 10):
    if not code.isdigit() or len(code) != 4:
        raise HTTPException(400, "Code invalide")
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT pseudo, score, solved, played_at FROM challenge_scores WHERE code = ? ORDER BY score DESC LIMIT ?",
            (code, limit),
        ).fetchall()
        return [dict(r) for r in rows]

# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/api/health")
async def health():
    return {"ok": True, "rooms": len(rooms), "model": CLAUDE_MODEL}
