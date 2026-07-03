#!/bin/bash
# Lance le backend en dev local
set -e
cd "$(dirname "$0")"

if [ ! -d venv ]; then
  python3 -m venv venv
fi
source venv/bin/activate
pip install -q -r requirements.txt

# Charge le .env si présent
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

exec uvicorn main:app --reload --host 0.0.0.0 --port 8000
