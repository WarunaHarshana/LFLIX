FROM python:3.11-slim-bookworm

# Install aria2, rclone, curl and ca-certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
    aria2 \
    rclone \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Hugging Face Spaces uses UID 1000
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1

WORKDIR /home/user/app

# Install Python dependencies
COPY --chown=user:user requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY --chown=user:user . .

# Hugging Face default port is 7860
EXPOSE 7860

CMD ["python", "main.py"]
