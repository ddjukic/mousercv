# Stage 1: Build React frontend
FROM node:22-slim AS frontend
WORKDIR /app
RUN corepack enable
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ .
RUN pnpm build

# Stage 2: Python backend with uv
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim
WORKDIR /app

# System dependencies for opencv-python-headless
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libgl1-mesa-glx libsm6 libxext6 libxrender1 \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first for caching
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev

# Copy backend source
COPY backend/ .

# Copy frontend build as static files
COPY --from=frontend /app/dist ./static

# Runtime config
ENV PORT=8080
EXPOSE 8080
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
