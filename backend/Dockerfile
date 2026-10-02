# ==============================================================================
# Production Dockerfile for AI Music Smart Engine (FastAPI + yt-dlp + FFmpeg)
# Supports deployment on Oracle Cloud Always Free VPS, Render, Fly.io, or Docker.
# ==============================================================================

FROM python:3.12-slim AS base

# Prevent Python from writing .pyc files and buffer stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Install system dependencies:
# - ffmpeg: audio extraction, transcoding, and ID3 tagging
# - curl: container health checks
# - nodejs: solves YouTube JS challenge signatures in yt-dlp
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application source code
COPY . .

# Ensure storage directories exist
RUN mkdir -p /app/local_storage/audio /app/local_storage/covers

ENV PYTHONPATH=/app:/app/backend
ENV PORT=8000
EXPOSE 8000

# Healthcheck to verify the engine is responding
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/ || exit 1

# Launch production server (works whether context was root or backend/)
CMD ["sh", "-c", "if [ -f main.py ]; then uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}; else cd backend && uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}; fi"]
