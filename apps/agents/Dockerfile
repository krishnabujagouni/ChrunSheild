FROM python:3.12-slim

WORKDIR /app

# Install uv for fast dependency resolution
RUN pip install uv

# Copy dependency files
COPY pyproject.toml ./

# Install dependencies (no dev extras)
RUN uv pip install --system --no-cache .

# Copy source
COPY src/ ./src/

# Install the package itself
RUN uv pip install --system --no-cache -e .

EXPOSE 8000

CMD ["uvicorn", "churnshield_agents.main:app", "--host", "0.0.0.0", "--port", "8000"]
