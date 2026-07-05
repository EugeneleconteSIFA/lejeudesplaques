"""
Logique métier partagée : validation des initiales, extraction JSON, prompts Claude.
Reproduit côté serveur ce qui est fait côté client pour valider les soumissions multi.
"""
import re
import unicodedata
import json
from typing import Optional, TypedDict

PARTICLES = {
    "de", "du", "des", "le", "la", "les", "di", "da", "dos", "del",
    "von", "van", "der", "den", "el", "al", "bin", "ben", "ibn",
    "mc", "mac", "st", "saint", "sainte", "ter", "ten", "und", "y",
}

class VerifyResult(TypedDict):
    valid: bool
    people: list
    reason: str
    comment: str

def remove_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")

def parse_names(text: str) -> list[dict]:
    normalized = remove_accents(text.strip().lower())
    normalized = re.sub(r"[.,;]", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    parts = re.split(r"\s+(?:et|puis|and|&|\+)\s+", normalized)

    result = []
    for part in parts:
        words = [w for w in part.strip().split(" ") if w]
        if len(words) < 2:
            continue
        first = words[0]
        i = len(words) - 1
        while i > 0 and words[i] in PARTICLES:
            i -= 1
        last = words[i]
        result.append({
            "first": first[0].upper(),
            "last": last[0].upper(),
            "raw": part.strip(),
        })
    return result

def can_chain(plate: str) -> bool:
    letters = [c for c in plate if c.isalpha()]
    if len(letters) < 4:
        return False
    return letters[1] == letters[2]

def validate_answer(answer: str, plate: str) -> dict:
    letters = [c for c in plate.upper() if c.isalpha()]
    if len(letters) < 4:
        return {"valid": False, "reason": "Plaque invalide"}
    L1, L2, L3, L4 = letters[:4]
    names = parse_names(answer)
    chain_allowed = L2 == L3

    if not names:
        return {"valid": False, "reason": "Aucun nom détecté."}

    if len(names) >= 2:
        p1, p2 = names[0], names[1]
        if p1["first"] == L1 and p1["last"] == L2 and p2["first"] == L3 and p2["last"] == L4:
            return {"valid": True, "mode": "direct", "names": [p1["raw"], p2["raw"]]}
        return {"valid": False, "reason": f"Initiales attendues : {L1}{L2} + {L3}{L4}"}

    if len(names) == 1:
        if not chain_allowed:
            return {"valid": False, "reason": f"Pas de chaîne possible : {L2} ≠ {L3}. Il faut 2 célébrités."}
        p = names[0]
        if p["first"] == L1 and p["last"] == L4:
            return {"valid": True, "mode": "chasles", "names": [p["raw"]]}
        return {"valid": False, "reason": f"Par Chasles : attendu {L1}{L4}, reçu {p['first']}{p['last']}"}

    return {"valid": False, "reason": "Réponse non comprise."}

def streak_multiplier(streak: int) -> float:
    if streak < 3: return 1.0
    if streak < 6: return 1.5
    if streak < 10: return 2.0
    return 3.0

def compute_points(result: dict, theme_respected: bool, streak: int = 0) -> int:
    if not result.get("valid"):
        return 0
    pts = 10
    if result.get("mode") == "chasles":
        pts += 5
    if theme_respected:
        pts += 5
    return round(pts * streak_multiplier(streak))

def extract_json(text: str) -> Optional[dict]:
    """Extrait un objet JSON d'une réponse Claude, tolérant préambule/backticks/smart quotes."""
    if not text:
        return None
    clean = re.sub(r"```json\s*|```", "", text)
    clean = clean.replace("\u2018", "'").replace("\u2019", "'")
    clean = clean.replace("\u201C", '"').replace("\u201D", '"')
    clean = clean.strip()

    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        pass

    first = clean.find("{")
    last = clean.rfind("}")
    if first == -1 or last == -1 or last < first:
        return None
    json_str = clean[first:last + 1]
    try:
        return json.loads(json_str)
    except json.JSONDecodeError:
        # Fix virgules traînantes
        fixed = re.sub(r",\s*([}\]])", r"\1", json_str)
        try:
            return json.loads(fixed)
        except json.JSONDecodeError:
            return None

# ============================================================
# PROMPTS CLAUDE
# ============================================================

def verify_prompt(plate: str, names: list[str], mode: str, theme: Optional[dict]) -> str:
    theme_active = theme and theme.get("id") != "free"
    theme_context = (
        f"Le thème imposé est: {theme['label']} ({theme.get('hint', '')})."
        if theme_active else "Aucun thème imposé."
    )
    people_list = "\n".join(f'{i+1}. "{n}"' for i, n in enumerate(names))

    return f"""Tu es l'arbitre du jeu des initiales sur plaques d'immatriculation françaises.

Plaque: {plate}
Mode de réponse: {"Chasles (1 personne)" if mode == "chasles" else "Direct (2 personnes)"}
{theme_context}

Personnes proposées par le joueur:
{people_list}

Pour CHAQUE personne, vérifie:
1. exists: Est-ce une personne réellement notable ? BIAIS FORT VERS L'ACCEPTATION. Accepte:
   - Célébrités mainstream (acteurs, sportifs, artistes, politiques, écrivains, scientifiques…)
   - Personnalités "de second rang" ou "de niche" mais bien réelles (frères/sœurs de célèbres, sportifs moins médiatisés, chefs d'entreprise, journalistes, YouTubeurs, personnages historiques modestes, personnalités locales/régionales, entrepreneurs, fondateurs de marques…)
   - Personnages de fiction célèbres (Harry Potter, Don Draper, Sherlock Holmes…)
   - Fautes de frappe/orthographe si l'intention est claire (ex: "Pierre Deproge" = Desproges ✓, "Nikola Karabatic" sans accent ✓, "Élie Semoune" = Semoun ✓)
   - Fondateurs éponymes de marques (ex: Armand Thiery, Louis Vuitton, Yves Rocher…)
   Refuse UNIQUEMENT si tu es CERTAIN que : c'est une invention pure, un jeu de mots, ou deux mots sans lien avec une vraie personne.
2. matches_theme: Si un thème est imposé, la personne correspond-elle ? Sinon met true.

⚠️ RÈGLE D'OR : dans le moindre doute, exists=true. Ce jeu se joue en voiture entre potes/famille — mieux vaut accepter un moins connu que froisser un joueur qui a raison. Si tu hésites même 5%, accepte.

Ajoute AUSSI un champ "comment" (5-15 mots) : un fun fact épique ou une petite phrase héroïque si la réponse est bonne. Vide si refusée.

Réponds UNIQUEMENT en JSON strict, sans backticks:
{{"valid": true|false, "people": [{{"name": "...", "exists": true|false, "matches_theme": true|false, "description": "..."}}], "reason": "...", "comment": "..."}}

valid = true seulement si TOUTES les personnes ont exists=true."""

def ask_prompt(plate: str, theme: Optional[dict], insist: bool = False) -> str:
    letters = [c for c in plate.upper() if c.isalpha()]
    L1, L2, L3, L4 = letters[:4]
    chainable = L2 == L3
    theme_ctx = f"Contrainte thème: {theme['label']} uniquement." if (theme and theme.get('id') != 'free') else ""

    insist_text = (
        f'\n⚠️ ATTENTION : Vérifie deux fois que la première lettre du NOM DE FAMILLE correspond bien.\n'
        f'Ex pour LC : "Louis Chirac" ✓. "Louis de Funès" ✗ car nom = Funès (F pas C).\n'
        if insist else ""
    )
    chasles_option = (
        f'\nOption B — UNE seule par Chasles (car {L2}={L3}) :\n- PRÉNOM commence par "{L1}" ET NOM DE FAMILLE commence par "{L4}"'
        if chainable else ""
    )

    return f"""Jeu des initiales sur plaque française {plate}.
{theme_ctx}
Trouve UNE réponse valide et bien connue.

RÈGLE STRICTE : les initiales doivent être EXACTEMENT ces lettres-là.

Option A — DEUX célébrités :
- Personne 1 : PRÉNOM commence par "{L1}" ET NOM DE FAMILLE commence par "{L2}"
- Personne 2 : PRÉNOM commence par "{L3}" ET NOM DE FAMILLE commence par "{L4}"
{chasles_option}
{insist_text}
Privilégie les personnalités connues du grand public francophone.

Tu peux réfléchir librement d'abord (essayer des candidats, éliminer les mauvais), puis conclus avec ta réponse finale EXACTEMENT dans ce format (balises obligatoires) :

<reponse>Prénom Nom et Prénom Nom</reponse>
<explication>Une phrase courte de présentation.</explication>"""
