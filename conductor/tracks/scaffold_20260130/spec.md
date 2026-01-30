# Spec: Project Scaffolding & Configuration

## Overview
Initialize the `AgUI` standalone chat application structure, mirroring the technical foundation of `AURA-CHAT` but optimized for a lightweight, RAG-less experience.

## Objectives
- Create a clean `AgUI/` directory with `client/` (React) and `server/` (FastAPI).
- Configure the frontend with Vite, Tailwind CSS, and shared UI patterns from `AURA-CHAT`.
- Initialize the backend with Vertex AI SDK configuration and basic health check.

## Technical Requirements
- **Frontend:** React 19, Vite, Tailwind CSS 4.x.
- **Backend:** FastAPI, Python 3.10+, Vertex AI SDK (`google-cloud-aiplatform`).
- **Styling:** Consistent hex codes (`#FFD400`) and layout from `AURA-CHAT`.

## Success Criteria
- [ ] `npm run dev` starts the frontend with Tailwind working.
- [ ] `uvicorn main:app` starts the backend.
- [ ] Backend successfully initializes Vertex AI client (validated via startup log).
