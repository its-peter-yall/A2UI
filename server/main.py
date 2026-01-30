# main.py
# Entry point for the AgUI backend

# Initializes the FastAPI application, configures CORS for the frontend,
# and serves as the central hub for route registration.

# @see: routers/ (future)
# @note: Runs on port 8000 by default

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="AgUI Backend", version="1.0.0")

# Configure CORS
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"message": "AgUI Backend is running"}
