#!/bin/bash
# Script de déploiement Initiales
# À lancer depuis le dossier racine du projet sur le VPS.
# Suppose que git pull a été fait, ou que le code est déjà à jour.

set -e

DEPLOY_ROOT="/var/www/initiales"
DATA_DIR="/var/lib/initiales"

echo "==> Déploiement Initiales"

# 1. Créer les dossiers cibles
sudo mkdir -p "$DEPLOY_ROOT/backend" "$DEPLOY_ROOT/frontend" "$DATA_DIR"
sudo chown -R www-data:www-data "$DATA_DIR"

# 2. Backend
echo "==> Backend"
sudo rsync -a --delete --exclude=venv --exclude=__pycache__ --exclude=.env \
    backend/ "$DEPLOY_ROOT/backend/"

# Créer/mettre à jour le venv
if [ ! -d "$DEPLOY_ROOT/backend/venv" ]; then
    sudo python3 -m venv "$DEPLOY_ROOT/backend/venv"
fi
sudo "$DEPLOY_ROOT/backend/venv/bin/pip" install -q -r "$DEPLOY_ROOT/backend/requirements.txt"

# Copier le .env s'il n'existe pas encore
if [ ! -f "$DEPLOY_ROOT/backend/.env" ]; then
    echo "⚠️  Pas de .env, copie de .env.example — À ÉDITER MAINTENANT"
    sudo cp "$DEPLOY_ROOT/backend/.env.example" "$DEPLOY_ROOT/backend/.env"
    sudo chmod 600 "$DEPLOY_ROOT/backend/.env"
fi

sudo chown -R www-data:www-data "$DEPLOY_ROOT/backend"

# 3. Frontend
echo "==> Frontend build"
cd frontend
npm ci --silent
npm run build
cd ..

echo "==> Frontend deploy"
sudo rsync -a --delete frontend/dist/ "$DEPLOY_ROOT/frontend/"
sudo chown -R www-data:www-data "$DEPLOY_ROOT/frontend"

# 4. Systemd
echo "==> systemd unit"
if [ ! -f /etc/systemd/system/initiales-backend.service ]; then
    sudo cp deploy/initiales-backend.service /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable initiales-backend
fi

# 5. Nginx (à faire manuellement la première fois)
if [ ! -f /etc/nginx/sites-available/initiales ]; then
    echo "⚠️  Pas encore de conf nginx. Voir deploy/nginx.conf pour l'installer."
fi

# 6. Restart backend
echo "==> Restart backend"
sudo systemctl restart initiales-backend
sudo systemctl status initiales-backend --no-pager

echo "==> Fait. Health check :"
sleep 1
curl -s http://127.0.0.1:8000/api/health && echo
