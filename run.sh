#!/bin/bash
set -e

echo "Starting A2UI Server and Client..."
echo

# Start server in background
echo "Starting Server (port 8000)..."
cd server
source .venv/bin/activate
python -m uvicorn server.main:app --reload --port 8000 &
SERVER_PID=$!
cd ..

# Wait for server to initialize
sleep 2

# Start client
echo "Starting Client (port 5173)..."
cd client
npm run dev &
CLIENT_PID=$!
cd ..

echo
echo "Both services are starting!"
echo "- Server: http://localhost:8000"
echo "- Client: http://localhost:5173"
echo
echo "Press Ctrl+C to stop both services"

# Trap Ctrl+C to kill both processes
trap "kill $SERVER_PID $CLIENT_PID 2>/dev/null; exit" INT

# Wait for either to exit
wait
