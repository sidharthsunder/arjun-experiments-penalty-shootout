FROM python:3.12-slim

WORKDIR /app
COPY backend /app/backend
COPY frontend /app/frontend

WORKDIR /app/backend

ENV PORT=8080
EXPOSE 8080

CMD ["python", "server.py"]
