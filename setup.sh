#!/bin/bash
set -e

echo "========================================"
echo "  A2UI - First Time Setup"
echo "========================================"
echo

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python 3 is not installed."
    echo "       Install Python 3.10+ from https://www.python.org"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed."
    echo "       Install Node.js 18+ from https://nodejs.org"
    exit 1
fi

# Check Python version
PYVER=$(python3 --version 2>&1 | awk '{print $2}')
PYMAJOR=$(echo $PYVER | cut -d. -f1)
PYMINOR=$(echo $PYVER | cut -d. -f2)

if [ "$PYMAJOR" -lt 3 ] || ([ "$PYMAJOR" -eq 3 ] && [ "$PYMINOR" -lt 10 ]); then
    echo "ERROR: Python 3.10+ required, found $PYVER"
    exit 1
fi

echo "  [OK] Python $PYVER found"
echo "  [OK] Node.js found"
echo

# Backend setup
echo "[1/2] Setting up backend (Python)..."
echo

if [ ! -d "server/.venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv server/.venv
    echo "  [OK] Virtual environment created"
else
    echo "  [OK] Virtual environment already exists"
fi

echo "Installing Python dependencies..."
source server/.venv/bin/activate
pip install -r server/requirements.txt --quiet
deactivate
echo "  [OK] Python dependencies installed"
echo

# Frontend setup
echo "[2/2] Setting up frontend (Node)..."
echo

if [ ! -d "client/node_modules" ]; then
    echo "Installing Node packages..."
    cd client && npm install && cd ..
    echo "  [OK] Node packages installed"
else
    echo "  [OK] Node packages already installed"
fi

echo
echo "========================================"
echo "  Setup complete!"
echo "========================================"
echo
echo "Next steps:"
echo "  1. Get an API key from https://openrouter.ai"
echo "  2. Run './run.sh' to start the application"
echo "  3. Paste your API key in the Settings panel"
echo
