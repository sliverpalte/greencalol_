#!/bin/bash
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt
  .venv/bin/python -m playwright install chromium
fi
.venv/bin/streamlit run app.py
