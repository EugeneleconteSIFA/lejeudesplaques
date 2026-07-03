# Initiales

> Le jeu des plaques d'immatriculation, adapté pour les vacances en voiture.

**Stack** : FastAPI (backend) + React/Vite (frontend) + SQLite + nginx/systemd (déploiement VPS).

## Structure

```
initiales/
├── backend/          # FastAPI : proxy Anthropic, salons multi, leaderboards défi
│   ├── main.py
│   ├── game_logic.py # Validation initiales + prompts Claude
│   ├── requirements.txt
│   ├── .env.example
│   └── start.sh
├── frontend/         # React + Vite + Tailwind
│   ├── src/
│   │   ├── App.jsx   # Tous les modes de jeu
│   │   ├── api.js    # Client HTTP vers le backend
│   │   ├── chasles.js # Portrait de Chasles (domaine public)
│   │   └── index.css # Tailwind + styles custom
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── deploy/           # Fichiers de déploiement VPS
│   ├── nginx.conf
│   ├── initiales-backend.service
│   └── deploy.sh
└── README.md
```

## Développement local

### Backend

```bash
cd backend
cp .env.example .env
# Édite .env pour ajouter ANTHROPIC_API_KEY
./start.sh
```

Backend disponible sur http://localhost:8000.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend disponible sur http://localhost:5173. Le proxy Vite renvoie les `/api/*` vers le backend.

## Déploiement sur VPS

### Prérequis serveur

- Ubuntu/Debian avec Python 3.10+ et Node 18+
- nginx installé
- Un domaine pointé sur le VPS
- Certbot (pour HTTPS)

### Première installation

```bash
# 1. Cloner le repo sur le VPS
sudo mkdir -p /var/www/initiales
cd /var/www/initiales
sudo git clone <ton-repo> .    # ou rsync depuis ta machine

# 2. Lancer le déploiement (crée les dossiers, installe, configure)
sudo bash deploy/deploy.sh

# 3. Éditer le .env avec ta vraie clé API
sudo nano /var/www/initiales/backend/.env

# 4. Config nginx
sudo cp deploy/nginx.conf /etc/nginx/sites-available/initiales
sudo nano /etc/nginx/sites-available/initiales    # ajuste server_name
sudo ln -s /etc/nginx/sites-available/initiales /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 5. HTTPS avec Certbot
sudo certbot --nginx -d initiales.ton-domaine.com

# 6. Restart backend avec le vrai .env
sudo systemctl restart initiales-backend
```

### Mises à jour

```bash
cd /var/www/initiales
git pull
sudo bash deploy/deploy.sh
```

## Variables d'environnement

### Backend (`.env`)

| Variable | Description | Défaut |
|----------|-------------|--------|
| `ANTHROPIC_API_KEY` | Clé API Anthropic | *(obligatoire)* |
| `CLAUDE_MODEL` | Modèle à utiliser | `claude-sonnet-4-5` |
| `CORS_ORIGINS` | Origines autorisées (CSV) | `http://localhost:5173` |
| `DB_PATH` | Chemin SQLite | `/var/lib/initiales/initiales.db` |

### Frontend (`.env`)

| Variable | Description | Défaut |
|----------|-------------|--------|
| `VITE_API_BASE` | URL du backend | `/api` (via proxy nginx) |

## Endpoints API

### Vérification

- `POST /api/verify` — Vérifie que les célébrités citées sont valides
- `POST /api/ask-claude` — Demande une réponse valide (langue au chat)

### Salons multi

- `POST /api/rooms` — Créer un salon
- `GET /api/rooms/{code}` — Récupérer l'état du salon (polling toutes les 1.5s)
- `POST /api/rooms/{code}/join` — Rejoindre
- `POST /api/rooms/{code}/leave` — Quitter
- `POST /api/rooms/{code}/start-round` — Lancer une manche (hôte)
- `POST /api/rooms/{code}/next-round` — Manche suivante (hôte)
- `POST /api/rooms/{code}/submit` — Soumettre une réponse
- `POST /api/rooms/{code}/vote` — Voter en cas de contestation
- `POST /api/rooms/{code}/resolve-vote` — Forcer résolution vote (timer)

### Défis partagés

- `POST /api/challenges/{code}/score` — Soumettre un score
- `GET /api/challenges/{code}/leaderboard` — Voir le classement

### Health

- `GET /api/health` — Ping + nombre de salons actifs

## Notes techniques

- **Salons multi en mémoire** : les salons sont éphémères. Un salon inactif 30 min est supprimé automatiquement.
- **Défis persistants** : les scores des défis sont stockés en SQLite pour permettre les comparaisons long terme.
- **Cache célébrités** : côté client uniquement, réinitialisé à chaque rechargement.
- **Record chrono** : stocké en `localStorage` (par navigateur).
- **Le portrait de Chasles** est utilisé en clin d'œil (relation de Chasles = mécanique du jeu). Photo du 19e siècle, domaine public.

## Licence

Projet perso pour les vacances. Fais-en ce que tu veux.
