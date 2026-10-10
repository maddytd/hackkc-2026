FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /srv/backend
COPY backend/ .
RUN pip install --no-cache-dir -c requirements.lock -e . \
    && useradd --create-home larple \
    && mkdir -p /data/recordings && chown -R larple:larple /data
USER larple
ENV LARP_STORAGE_DIR=/data
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
