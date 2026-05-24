FROM python:3.12-slim

WORKDIR /app

COPY . .

# SQLite 数据库放到持久化目录
ENV DATA_DIR=/data
ENV PORT=8080
VOLUME ["/data"]

EXPOSE 8080

CMD ["python", "server.py"]
