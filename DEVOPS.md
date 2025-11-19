# DevOps Guide - Playlist Manager

Complete deployment guide for development and production environments.

## Table of Contents

- [Stack Overview](#stack-overview)
- [Prerequisites](#prerequisites)
- [Development Environment](#development-environment)
- [Production Deployment - Single Node](#production-deployment---single-node)
- [Production Deployment - Multi-Node](#production-deployment---multi-node)
- [Configuration Management](#configuration-management)
- [Database Operations](#database-operations)
- [Backup and Restore](#backup-and-restore)
- [Monitoring and Logging](#monitoring-and-logging)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)

---

## Stack Overview

### Architecture Components

```
┌─────────────────┐
│  Mobile App     │
│  (Expo/RN)      │
└────────┬────────┘
         │ HTTPS/REST
         ↓
┌─────────────────┐      ┌─────────────────┐
│  API Server     │◄─────│  Worker Service │
│  (Fastify)      │      │  (BullMQ Jobs)  │
│  Port: 3101     │      └────────┬────────┘
└────────┬────────┘               │
         │                        │
    ┌────┴────────────────────────┴─────┐
    │                                    │
    ↓                                    ↓
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ PostgreSQL  │  │   Redis     │  │   MinIO/S3  │
│   :5432     │  │   :6379     │  │ :9000/:9001 │
└─────────────┘  └─────────────┘  └─────────────┘
```

### Services

| Service | Technology | Port(s) | Purpose |
|---------|-----------|---------|---------|
| API Server | Node.js + Fastify 5.6.1 | 3101 | REST API, OAuth callbacks |
| Worker | Node.js + Custom Queue | - | Background jobs, exports, enrichment |
| Mobile App | Expo 52 + React Native | - | iOS/Android client |
| Web App | Vite + React | 3000 | Web interface (stub) |
| Database | PostgreSQL 16 | 5432 | Primary data store |
| Cache/Queue | Redis 7 | 6379 | Sessions, cache, job queue |
| Object Storage | MinIO/S3 | 9000, 9001 | Exports, backups |

---

## Prerequisites

### All Environments

- **Node.js**: v20.x LTS
- **pnpm**: v8.x or later ⚠️ **REQUIRED** - This is a pnpm monorepo; npm will NOT work
- **Docker**: v24.x or later
- **Docker Compose**: v2.x or later

### Installing pnpm

This project uses pnpm workspaces with the `workspace:*` protocol, which npm does not support.

```bash
# Option 1: Using corepack (recommended - comes with Node.js 16+)
corepack enable
corepack prepare pnpm@latest --activate

# Option 2: Using npm (one-time only)
npm install -g pnpm

# Verify installation
pnpm --version
```

### Production Additional Requirements

- **Linux Server(s)**: Ubuntu 22.04/24.04 LTS or equivalent
- **Minimum Resources (Single Node)**:
  - CPU: 4 cores
  - RAM: 8 GB
  - Disk: 50 GB SSD
- **Recommended Resources (Single Node)**:
  - CPU: 8 cores
  - RAM: 16 GB
  - Disk: 100 GB SSD
- **Multi-Node**: Additional nodes for database, cache, and worker scaling

### External Services (Optional)

- **Managed PostgreSQL**: AWS RDS, Google Cloud SQL, DigitalOcean
- **Managed Redis**: AWS ElastiCache, Redis Cloud
- **Object Storage**: AWS S3, Google Cloud Storage, DigitalOcean Spaces
- **OAuth Providers**: Spotify, Deezer, Tidal, YouTube Music

---

## Development Environment

### Quick Start

```bash
# 1. Clone the repository
git clone <repository-url>
cd playlist-manager

# 2. Install dependencies
pnpm install

# 3. Start infrastructure services (PostgreSQL, Redis, MinIO)
docker-compose up -d

# 4. Set up environment variables
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env

# 5. Generate encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" > master.key
# Copy the output to MASTER_KEY in .env and apps/api/.env and apps/worker/.env

# 6. Generate JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))" > jwt.secret
# Copy the output to JWT_SECRET in apps/api/.env

# 7. Generate Prisma client
pnpm prisma:generate

# 8. Run database migrations
pnpm prisma:migrate:dev

# 9. Seed the database (optional)
pnpm prisma:seed

# 10. Start the API server
pnpm api:dev
# API available at http://localhost:3101

# 11. Start the worker (in a new terminal)
pnpm worker:dev

# 12. Start mobile app (in a new terminal)
cd apps/mobile
pnpm start
```

### Environment Configuration

**Minimum Required Variables** (`.env`, `apps/api/.env`, `apps/worker/.env`):

```bash
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/playlistmgr"

# Security (must be the same across API and Worker)
MASTER_KEY="<generated-32-byte-base64-key>"
JWT_SECRET="<generated-64-byte-base64-secret>"

# API specific (apps/api/.env)
PORT=3101
API_BASE_URL="http://localhost:3101"
NODE_ENV="development"
CORS_ORIGINS="http://localhost:3000,exp://localhost:8081"

# Redis (optional for dev)
REDIS_URL="redis://localhost:6379"

# MinIO (optional for dev)
S3_ENDPOINT="http://localhost:9000"
S3_BUCKET="playlist-exports"
AWS_ACCESS_KEY_ID="minio"
AWS_SECRET_ACCESS_KEY="minio12345"
```

### Verify Installation

```bash
# Check database connection
pnpm db:health

# View database in browser
pnpm prisma:studio
# Opens at http://localhost:5555

# Check API health
curl http://localhost:3101/health

# Run tests
pnpm test
```

### Development Tools

```bash
# Type generation from OpenAPI
pnpm gen:types

# Database operations
pnpm prisma:studio          # Visual DB editor
pnpm db:reset              # Reset dev database
pnpm prisma:migrate:dev    # Create new migration

# Linting and formatting
pnpm lint
pnpm format

# Performance checks
./scripts/run-explain-checks.sh  # Analyze query performance
```

---

## Production Deployment - Single Node

Deploy all services on a single Linux server using Docker Compose.

### Step 1: Prepare the Server

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker

# Install Docker Compose
sudo apt install docker-compose-plugin -y

# Install Node.js and pnpm (for building)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
npm install -g pnpm

# Create application directory
sudo mkdir -p /opt/playlist-manager
sudo chown $USER:$USER /opt/playlist-manager
cd /opt/playlist-manager
```

### Step 2: Clone and Build

```bash
# Clone repository
git clone <repository-url> .

# Install dependencies
pnpm install --frozen-lockfile

# Build the applications
pnpm build
```

### Step 3: Create Dockerfiles

**Create `apps/api/Dockerfile`:**

```dockerfile
FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages packages
COPY apps/api apps/api

# Install dependencies
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod

# Generate Prisma client
RUN pnpm --filter @app/db prisma:generate

# Production stage
FROM node:20-slim
WORKDIR /app

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy built application
COPY --from=base /app /app

# Set environment
ENV NODE_ENV=production

# Expose port
EXPOSE 3101

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3101/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start API
CMD ["node", "apps/api/dist/index.js"]
```

**Create `apps/worker/Dockerfile`:**

```dockerfile
FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages packages
COPY apps/worker apps/worker

# Install dependencies
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod

# Generate Prisma client
RUN pnpm --filter @app/db prisma:generate

# Production stage
FROM node:20-slim
WORKDIR /app

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy built application
COPY --from=base /app /app

# Set environment
ENV NODE_ENV=production

# Start Worker
CMD ["node", "apps/worker/dist/index.js"]
```

### Step 4: Production Docker Compose

**Create `docker-compose.prod.yml`:**

```yaml
version: '3.8'

services:
  db:
    image: postgres:16-alpine
    container_name: playlist-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: playlistmgr
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - playlist-net

  redis:
    image: redis:7-alpine
    container_name: playlist-redis
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD} --maxmemory 512mb --maxmemory-policy allkeys-lru
    volumes:
      - redis-data:/data
    ports:
      - "127.0.0.1:6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "--raw", "incr", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - playlist-net

  minio:
    image: minio/minio:RELEASE.2024-10-02T17-50-41Z
    container_name: playlist-minio
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    volumes:
      - minio-data:/data
    ports:
      - "127.0.0.1:9000:9000"
      - "127.0.0.1:9001:9001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 20s
      retries: 3
    networks:
      - playlist-net

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    container_name: playlist-api
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3101
      DATABASE_URL: postgresql://postgres:${DB_PASSWORD}@db:5432/playlistmgr
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      MASTER_KEY: ${MASTER_KEY}
      JWT_SECRET: ${JWT_SECRET}
      API_BASE_URL: ${API_BASE_URL}
      CORS_ORIGINS: ${CORS_ORIGINS}
      S3_ENDPOINT: http://minio:9000
      S3_BUCKET: ${S3_BUCKET}
      AWS_ACCESS_KEY_ID: ${MINIO_ROOT_USER}
      AWS_SECRET_ACCESS_KEY: ${MINIO_ROOT_PASSWORD}
      LOG_LEVEL: ${LOG_LEVEL:-info}
      ENABLE_METRICS: ${ENABLE_METRICS:-true}
    ports:
      - "${API_PORT:-3101}:3101"
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
      minio:
        condition: service_healthy
    networks:
      - playlist-net
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3101/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  worker:
    build:
      context: .
      dockerfile: apps/worker/Dockerfile
    container_name: playlist-worker
    restart: unless-stopped
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://postgres:${DB_PASSWORD}@db:5432/playlistmgr
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      MASTER_KEY: ${MASTER_KEY}
      WORKER_CONCURRENCY: ${WORKER_CONCURRENCY:-5}
      WORKER_TIMEOUT_MS: ${WORKER_TIMEOUT_MS:-300000}
      S3_ENDPOINT: http://minio:9000
      S3_BUCKET: ${S3_BUCKET}
      AWS_ACCESS_KEY_ID: ${MINIO_ROOT_USER}
      AWS_SECRET_ACCESS_KEY: ${MINIO_ROOT_PASSWORD}
      LOG_LEVEL: ${LOG_LEVEL:-info}
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
      minio:
        condition: service_healthy
    networks:
      - playlist-net
    deploy:
      replicas: ${WORKER_REPLICAS:-1}

  nginx:
    image: nginx:alpine
    container_name: playlist-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
      - nginx-cache:/var/cache/nginx
    depends_on:
      - api
    networks:
      - playlist-net

volumes:
  pgdata:
  redis-data:
  minio-data:
  nginx-cache:

networks:
  playlist-net:
    driver: bridge
```

### Step 5: Create Nginx Configuration

**Create `nginx.conf`:**

```nginx
events {
    worker_connections 1024;
}

http {
    upstream api {
        server api:3101 max_fails=3 fail_timeout=30s;
    }

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=5r/m;

    # Logging
    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log warn;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    server {
        listen 80;
        server_name _;

        # Redirect to HTTPS (uncomment when SSL is configured)
        # return 301 https://$host$request_uri;

        # Health check endpoint (allow HTTP)
        location /health {
            proxy_pass http://api;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            access_log off;
        }

        location / {
            proxy_pass http://api;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # Rate limiting
            limit_req zone=api_limit burst=20 nodelay;

            # Timeouts
            proxy_connect_timeout 60s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
        }

        # Stricter rate limit for auth endpoints
        location ~ ^/api/v1/(auth|login|register) {
            proxy_pass http://api;
            limit_req zone=auth_limit burst=5 nodelay;
        }
    }

    # HTTPS configuration (uncomment and configure when SSL certificates are available)
    # server {
    #     listen 443 ssl http2;
    #     server_name your-domain.com;
    #
    #     ssl_certificate /etc/nginx/ssl/cert.pem;
    #     ssl_certificate_key /etc/nginx/ssl/key.pem;
    #     ssl_protocols TLSv1.2 TLSv1.3;
    #     ssl_ciphers HIGH:!aNULL:!MD5;
    #     ssl_prefer_server_ciphers on;
    #
    #     location / {
    #         proxy_pass http://api;
    #         # ... same as HTTP location
    #     }
    # }
}
```

### Step 6: Environment Configuration

**Create `.env.production`:**

```bash
# Database
DB_PASSWORD=<strong-random-password>

# Redis
REDIS_PASSWORD=<strong-random-password>

# MinIO
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=<strong-random-password>
S3_BUCKET=playlist-exports

# Application Security
MASTER_KEY=<generated-32-byte-base64-key>
JWT_SECRET=<generated-64-byte-base64-secret>

# API Configuration
API_BASE_URL=https://your-domain.com
API_PORT=3101
CORS_ORIGINS=https://your-domain.com,https://app.your-domain.com

# Worker Configuration
WORKER_CONCURRENCY=5
WORKER_TIMEOUT_MS=300000
WORKER_REPLICAS=1

# Logging
LOG_LEVEL=info

# Metrics
ENABLE_METRICS=true

# OAuth Providers (optional)
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REDIRECT_URI=https://your-domain.com/api/v1/auth/spotify/callback

DEEZER_CLIENT_ID=
DEEZER_CLIENT_SECRET=
DEEZER_REDIRECT_URI=https://your-domain.com/api/v1/auth/deezer/callback
```

### Step 7: Deploy

```bash
# Build Docker images
docker-compose -f docker-compose.prod.yml build

# Start all services
docker-compose -f docker-compose.prod.yml --env-file .env.production up -d

# Watch logs
docker-compose -f docker-compose.prod.yml logs -f

# Run database migrations
docker-compose -f docker-compose.prod.yml exec api sh -c "cd /app && pnpm prisma:migrate:deploy"

# Check service status
docker-compose -f docker-compose.prod.yml ps

# Test API
curl http://localhost/health
```

### Step 8: SSL/TLS Setup with Let's Encrypt

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Obtain certificate (make sure DNS points to your server)
sudo certbot --nginx -d your-domain.com -d api.your-domain.com

# Auto-renewal is configured automatically
# Test renewal
sudo certbot renew --dry-run
```

### Step 9: Set Up Automatic Backups

```bash
# Create backup script
sudo tee /opt/playlist-manager/scripts/backup-prod.sh > /dev/null <<'EOF'
#!/bin/bash
set -e

BACKUP_DIR="/opt/backups/playlist-manager"
DATE=$(date +%Y%m%d_%H%M%S)
DB_PASSWORD=$(grep DB_PASSWORD /opt/playlist-manager/.env.production | cut -d '=' -f2)

mkdir -p "$BACKUP_DIR"

# Backup database
docker-compose -f /opt/playlist-manager/docker-compose.prod.yml exec -T db \
  pg_dump -U postgres playlistmgr | gzip > "$BACKUP_DIR/db_$DATE.sql.gz"

# Backup volumes
docker run --rm -v playlist-manager_pgdata:/data -v "$BACKUP_DIR":/backup \
  alpine tar czf /backup/pgdata_$DATE.tar.gz /data

docker run --rm -v playlist-manager_minio-data:/data -v "$BACKUP_DIR":/backup \
  alpine tar czf /backup/minio_$DATE.tar.gz /data

# Keep only last 30 days
find "$BACKUP_DIR" -name "*.gz" -mtime +30 -delete

echo "Backup completed: $DATE"
EOF

chmod +x /opt/playlist-manager/scripts/backup-prod.sh

# Add to crontab (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/playlist-manager/scripts/backup-prod.sh >> /var/log/playlist-backup.log 2>&1") | crontab -
```

---

## Production Deployment - Multi-Node

Deploy services across multiple servers for high availability and scalability.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Load Balancer                           │
│                   (HAProxy/Nginx)                           │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    ┌────▼────┐     ┌────▼────┐     ┌────▼────┐
    │  API    │     │  API    │     │  API    │
    │ Node 1  │     │ Node 2  │     │ Node 3  │
    └────┬────┘     └────┬────┘     └────┬────┘
         │               │               │
         └───────────────┼───────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    ┌────▼────┐     ┌────▼────┐     ┌────▼────┐
    │ Worker  │     │ Worker  │     │ Worker  │
    │ Node 1  │     │ Node 2  │     │ Node 3  │
    └────┬────┘     └────┬────┘     └────┬────┘
         │               │               │
         └───────────────┼───────────────┘
                         │
         ┌───────────────┼────────────────┐
         │               │                │
    ┌────▼────┐     ┌────▼────┐     ┌────▼────┐
    │PostgreSQL│    │  Redis  │     │MinIO/S3 │
    │ Primary  │    │ Cluster │     │ Cluster │
    │+ Replicas│    │         │     │         │
    └──────────┘    └─────────┘     └─────────┘
```

### Deployment Options

#### Option A: Docker Swarm

**Initialize Swarm (on manager node):**

```bash
# Initialize swarm
docker swarm init --advertise-addr <MANAGER-IP>

# Join workers (run on worker nodes)
docker swarm join --token <TOKEN> <MANAGER-IP>:2377
```

**Create `docker-compose.swarm.yml`:**

```yaml
version: '3.8'

services:
  api:
    image: ${REGISTRY}/playlist-api:${VERSION}
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      MASTER_KEY: ${MASTER_KEY}
      JWT_SECRET: ${JWT_SECRET}
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure
      placement:
        constraints:
          - node.role == worker
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
    networks:
      - playlist-net
    ports:
      - target: 3101
        published: 3101
        mode: host

  worker:
    image: ${REGISTRY}/playlist-worker:${VERSION}
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      MASTER_KEY: ${MASTER_KEY}
      WORKER_CONCURRENCY: 5
    deploy:
      replicas: 3
      restart_policy:
        condition: on-failure
      placement:
        constraints:
          - node.role == worker
      resources:
        limits:
          cpus: '2'
          memory: 2G
    networks:
      - playlist-net

networks:
  playlist-net:
    driver: overlay
    attachable: true

configs:
  api_config:
    external: true
  worker_config:
    external: true

secrets:
  master_key:
    external: true
  jwt_secret:
    external: true
  db_password:
    external: true
```

**Deploy to Swarm:**

```bash
# Create secrets
echo "your-master-key" | docker secret create master_key -
echo "your-jwt-secret" | docker secret create jwt_secret -
echo "your-db-password" | docker secret create db_password -

# Deploy stack
docker stack deploy -c docker-compose.swarm.yml playlist

# Scale services
docker service scale playlist_api=5
docker service scale playlist_worker=3

# Update service
docker service update --image ${REGISTRY}/playlist-api:v2.0.0 playlist_api

# View logs
docker service logs -f playlist_api
```

#### Option B: Kubernetes

**Create namespace:**

```bash
kubectl create namespace playlist-manager
```

**Create `k8s/secrets.yaml`:**

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: playlist-secrets
  namespace: playlist-manager
type: Opaque
stringData:
  master-key: <base64-encoded-master-key>
  jwt-secret: <base64-encoded-jwt-secret>
  db-password: <db-password>
  redis-password: <redis-password>
```

**Create `k8s/configmap.yaml`:**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: playlist-config
  namespace: playlist-manager
data:
  NODE_ENV: "production"
  LOG_LEVEL: "info"
  WORKER_CONCURRENCY: "5"
  API_PORT: "3101"
```

**Create `k8s/api-deployment.yaml`:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: playlist-manager
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
      - name: api
        image: ${REGISTRY}/playlist-api:${VERSION}
        ports:
        - containerPort: 3101
          name: http
        env:
        - name: NODE_ENV
          valueFrom:
            configMapKeyRef:
              name: playlist-config
              key: NODE_ENV
        - name: MASTER_KEY
          valueFrom:
            secretKeyRef:
              name: playlist-secrets
              key: master-key
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: playlist-secrets
              key: jwt-secret
        - name: DATABASE_URL
          value: postgresql://postgres:$(DB_PASSWORD)@postgres-service:5432/playlistmgr
        - name: REDIS_URL
          value: redis://:$(REDIS_PASSWORD)@redis-service:6379
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: playlist-secrets
              key: db-password
        - name: REDIS_PASSWORD
          valueFrom:
            secretKeyRef:
              name: playlist-secrets
              key: redis-password
        resources:
          requests:
            memory: "1Gi"
            cpu: "1"
          limits:
            memory: "2Gi"
            cpu: "2"
        livenessProbe:
          httpGet:
            path: /health
            port: 3101
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3101
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: api-service
  namespace: playlist-manager
spec:
  selector:
    app: api
  ports:
  - protocol: TCP
    port: 3101
    targetPort: 3101
  type: ClusterIP
```

**Create `k8s/worker-deployment.yaml`:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: worker
  namespace: playlist-manager
spec:
  replicas: 3
  selector:
    matchLabels:
      app: worker
  template:
    metadata:
      labels:
        app: worker
    spec:
      containers:
      - name: worker
        image: ${REGISTRY}/playlist-worker:${VERSION}
        env:
        - name: NODE_ENV
          valueFrom:
            configMapKeyRef:
              name: playlist-config
              key: NODE_ENV
        - name: WORKER_CONCURRENCY
          valueFrom:
            configMapKeyRef:
              name: playlist-config
              key: WORKER_CONCURRENCY
        - name: MASTER_KEY
          valueFrom:
            secretKeyRef:
              name: playlist-secrets
              key: master-key
        - name: DATABASE_URL
          value: postgresql://postgres:$(DB_PASSWORD)@postgres-service:5432/playlistmgr
        - name: REDIS_URL
          value: redis://:$(REDIS_PASSWORD)@redis-service:6379
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: playlist-secrets
              key: db-password
        - name: REDIS_PASSWORD
          valueFrom:
            secretKeyRef:
              name: playlist-secrets
              key: redis-password
        resources:
          requests:
            memory: "1Gi"
            cpu: "1"
          limits:
            memory: "2Gi"
            cpu: "2"
```

**Create `k8s/ingress.yaml`:**

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-ingress
  namespace: playlist-manager
  annotations:
    nginx.ingress.kubernetes.io/rate-limit: "10"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - api.your-domain.com
    secretName: api-tls
  rules:
  - host: api.your-domain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: api-service
            port:
              number: 3101
```

**Deploy to Kubernetes:**

```bash
# Apply configurations
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/api-deployment.yaml
kubectl apply -f k8s/worker-deployment.yaml
kubectl apply -f k8s/ingress.yaml

# Check deployments
kubectl get pods -n playlist-manager
kubectl get services -n playlist-manager

# Scale deployments
kubectl scale deployment api --replicas=5 -n playlist-manager
kubectl scale deployment worker --replicas=3 -n playlist-manager

# View logs
kubectl logs -f deployment/api -n playlist-manager

# Rolling update
kubectl set image deployment/api api=${REGISTRY}/playlist-api:v2.0.0 -n playlist-manager

# Rollback
kubectl rollout undo deployment/api -n playlist-manager
```

### Database High Availability

**PostgreSQL Replication (Streaming Replication):**

```bash
# Primary node configuration (postgresql.conf)
wal_level = replica
max_wal_senders = 10
wal_keep_size = 64MB
hot_standby = on

# Create replication user
CREATE USER replicator WITH REPLICATION ENCRYPTED PASSWORD 'repl_password';

# Configure pg_hba.conf on primary
host replication replicator <replica-ip>/32 md5

# On replica, create recovery.conf
primary_conninfo = 'host=<primary-ip> port=5432 user=replicator password=repl_password'
primary_slot_name = 'replica_1_slot'

# Start replica in standby mode
```

**Redis Cluster:**

```bash
# Create Redis cluster with 3 masters and 3 replicas
docker run -d --name redis-1 --net playlist-net -p 7000:7000 redis:7 \
  redis-server --cluster-enabled yes --port 7000

docker run -d --name redis-2 --net playlist-net -p 7001:7001 redis:7 \
  redis-server --cluster-enabled yes --port 7001

docker run -d --name redis-3 --net playlist-net -p 7002:7002 redis:7 \
  redis-server --cluster-enabled yes --port 7002

# Create cluster
docker exec -it redis-1 redis-cli --cluster create \
  <node1-ip>:7000 <node2-ip>:7001 <node3-ip>:7002 \
  --cluster-replicas 1
```

**MinIO Distributed Mode:**

```bash
# 4 nodes (minimum for distributed mode)
docker run -d --name minio-1 --net playlist-net \
  -e "MINIO_ROOT_USER=admin" \
  -e "MINIO_ROOT_PASSWORD=password" \
  minio/minio server \
  http://node1/data http://node2/data http://node3/data http://node4/data

# Repeat for nodes 2-4
```

---

## Configuration Management

### Environment-Specific Configuration

**Directory Structure:**

```
config/
├── development.env
├── staging.env
├── production.env
└── secrets/
    ├── development/
    ├── staging/
    └── production/
        ├── master-key.txt
        ├── jwt-secret.txt
        └── db-password.txt
```

### Secrets Management

**Option A: Docker Secrets (Swarm/Kubernetes):**

```bash
# Docker Swarm
echo "secret-value" | docker secret create secret_name -

# Kubernetes
kubectl create secret generic playlist-secrets \
  --from-literal=master-key=<value> \
  --from-literal=jwt-secret=<value> \
  -n playlist-manager
```

**Option B: HashiCorp Vault:**

```bash
# Store secrets in Vault
vault kv put secret/playlist/production \
  master_key=<value> \
  jwt_secret=<value> \
  db_password=<value>

# Retrieve in application startup script
export MASTER_KEY=$(vault kv get -field=master_key secret/playlist/production)
```

**Option C: AWS Secrets Manager:**

```bash
# Store secret
aws secretsmanager create-secret \
  --name playlist/production/master-key \
  --secret-string "<value>"

# Retrieve in application
# Use AWS SDK in application code or ECS task definition
```

### Configuration Validation

```bash
# Validate required environment variables before startup
cat > validate-config.sh <<'EOF'
#!/bin/bash
set -e

REQUIRED_VARS=(
  "DATABASE_URL"
  "MASTER_KEY"
  "JWT_SECRET"
  "API_BASE_URL"
)

for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    echo "Error: $var is not set"
    exit 1
  fi
done

echo "Configuration validation passed"
EOF

chmod +x validate-config.sh
./validate-config.sh
```

---

## Database Operations

### Migrations

**Development:**

```bash
# Create new migration
pnpm prisma:migrate:dev --name migration_name

# Reset database
pnpm db:reset
```

**Production:**

```bash
# Dry run
pnpm prisma:migrate:deploy --preview-feature

# Deploy migrations
pnpm prisma:migrate:deploy

# Check migration status
pnpm prisma:migrate:status
```

**Zero-Downtime Migrations:**

1. **Backward-compatible changes first** (add columns with defaults)
2. **Deploy new application code** (handles old and new schema)
3. **Run data migrations** (populate new columns)
4. **Deploy code using new schema**
5. **Remove old columns** (in next migration)

### Performance Optimization

**Analyze Query Performance:**

```bash
# Run EXPLAIN checks
./scripts/run-explain-checks.sh

# Custom query analysis
docker-compose exec db psql -U postgres playlistmgr -c "
EXPLAIN ANALYZE
SELECT * FROM playlists
WHERE user_id = '...'
ORDER BY created_at DESC
LIMIT 10;
"
```

**Create Indexes:**

```sql
-- Check missing indexes
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexrelname NOT LIKE 'pg_toast%'
ORDER BY pg_relation_size(indexrelid) DESC;

-- Add index
CREATE INDEX CONCURRENTLY idx_playlists_user_created
ON playlists(user_id, created_at DESC);
```

### Database Maintenance

**Vacuum and Analyze:**

```bash
# Full vacuum (requires downtime)
docker-compose exec db psql -U postgres playlistmgr -c "VACUUM FULL;"

# Concurrent vacuum (no downtime)
docker-compose exec db psql -U postgres playlistmgr -c "VACUUM ANALYZE;"

# Auto-vacuum configuration (postgresql.conf)
autovacuum = on
autovacuum_max_workers = 3
autovacuum_naptime = 1min
```

**Monitor Database Size:**

```sql
-- Database size
SELECT pg_size_pretty(pg_database_size('playlistmgr'));

-- Table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## Backup and Restore

### Automated Backups

**Backup Script** (uses existing `scripts/backup.sh`):

```bash
#!/bin/bash
# Enhanced version of scripts/backup.sh with rotation

set -e

BACKUP_DIR="${BACKUP_DIR:-/opt/backups/playlist-manager}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DATE=$(date +%Y%m%d_%H%M%S)
S3_SYNC="${S3_SYNC:-false}"

mkdir -p "$BACKUP_DIR"

# Database backup
echo "Starting database backup..."
docker-compose exec -T db pg_dump -U postgres playlistmgr | gzip > "$BACKUP_DIR/db_$DATE.sql.gz"

# Volume backups
echo "Backing up PostgreSQL data..."
docker run --rm -v playlist-manager_pgdata:/data -v "$BACKUP_DIR":/backup \
  alpine tar czf /backup/pgdata_$DATE.tar.gz -C / data

echo "Backing up MinIO data..."
docker run --rm -v playlist-manager_minio-data:/data -v "$BACKUP_DIR":/backup \
  alpine tar czf /backup/minio_$DATE.tar.gz -C / data

# Configuration backup
echo "Backing up configuration..."
tar czf "$BACKUP_DIR/config_$DATE.tar.gz" .env* nginx.conf docker-compose*.yml

# Sync to S3 (optional)
if [ "$S3_SYNC" = "true" ]; then
  echo "Syncing to S3..."
  aws s3 sync "$BACKUP_DIR" "s3://${S3_BACKUP_BUCKET}/backups/" \
    --storage-class STANDARD_IA \
    --exclude "*" \
    --include "*.gz"
fi

# Cleanup old backups
echo "Cleaning up old backups..."
find "$BACKUP_DIR" -name "*.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup completed: $DATE"
```

**Schedule Backups:**

```bash
# Crontab entry
0 2 * * * /opt/playlist-manager/scripts/backup-prod.sh >> /var/log/playlist-backup.log 2>&1
```

### Restore Procedures

**Database Restore:**

```bash
#!/bin/bash
# scripts/restore.sh

set -e

BACKUP_FILE="$1"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup-file.sql.gz>"
  exit 1
fi

# Stop API and worker to prevent connections
docker-compose stop api worker

# Drop and recreate database
docker-compose exec db psql -U postgres -c "DROP DATABASE IF EXISTS playlistmgr;"
docker-compose exec db psql -U postgres -c "CREATE DATABASE playlistmgr;"

# Restore from backup
gunzip -c "$BACKUP_FILE" | docker-compose exec -T db psql -U postgres playlistmgr

# Run migrations to ensure schema is up to date
docker-compose exec api pnpm prisma:migrate:deploy

# Restart services
docker-compose start api worker

echo "Restore completed successfully"
```

**Point-in-Time Recovery:**

```bash
# PostgreSQL PITR using WAL archives
# 1. Configure WAL archiving (postgresql.conf)
archive_mode = on
archive_command = 'test ! -f /mnt/wal_archive/%f && cp %p /mnt/wal_archive/%f'
wal_level = replica

# 2. Create base backup
pg_basebackup -U postgres -D /backup/base -Ft -z -P

# 3. Restore to specific time
# Create recovery.conf
restore_command = 'cp /mnt/wal_archive/%f %p'
recovery_target_time = '2024-01-15 14:30:00'
recovery_target_action = 'promote'
```

### Disaster Recovery Plan

**RTO (Recovery Time Objective): 1 hour**
**RPO (Recovery Point Objective): 1 hour**

**Recovery Steps:**

1. **Assess damage** (5 minutes)
   - Identify failed components
   - Check backup integrity

2. **Provision infrastructure** (15 minutes)
   - Spin up new servers
   - Configure networking

3. **Restore data** (30 minutes)
   - Restore latest database backup
   - Restore configuration files
   - Restore object storage

4. **Deploy services** (10 minutes)
   - Deploy containers
   - Run health checks

5. **Verify and test** (10 minutes)
   - Test API endpoints
   - Verify data integrity
   - Check OAuth flows

---

## Monitoring and Logging

### Application Metrics

**Prometheus Integration:**

```yaml
# Add to docker-compose.prod.yml
  prometheus:
    image: prom/prometheus:latest
    container_name: playlist-prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    ports:
      - "9090:9090"
    networks:
      - playlist-net

  grafana:
    image: grafana/grafana:latest
    container_name: playlist-grafana
    volumes:
      - grafana-data:/var/lib/grafana
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD}
    ports:
      - "3000:3000"
    networks:
      - playlist-net
```

**Prometheus Configuration** (`prometheus.yml`):

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'api'
    static_configs:
      - targets: ['api:3101']
    metrics_path: '/metrics'

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']

  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']

  - job_name: 'node'
    static_configs:
      - targets: ['node-exporter:9100']
```

### Logging Stack

**ELK Stack (Elasticsearch, Logstash, Kibana):**

```yaml
# Add to docker-compose.prod.yml
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
    volumes:
      - elasticsearch-data:/usr/share/elasticsearch/data
    ports:
      - "9200:9200"
    networks:
      - playlist-net

  logstash:
    image: docker.elastic.co/logstash/logstash:8.11.0
    volumes:
      - ./logstash.conf:/usr/share/logstash/pipeline/logstash.conf
    networks:
      - playlist-net

  kibana:
    image: docker.elastic.co/kibana/kibana:8.11.0
    ports:
      - "5601:5601"
    environment:
      ELASTICSEARCH_HOSTS: http://elasticsearch:9200
    networks:
      - playlist-net
```

**Application Logging Configuration:**

```javascript
// Configure Pino logger in production
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Send to stdout for container logging
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
  } : undefined,
});
```

**Centralized Logging with Docker:**

```yaml
# Configure logging driver
services:
  api:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
        labels: "service=api,environment=production"
```

### Health Checks and Alerts

**Health Check Endpoints:**

- `GET /health` - Basic health check
- `GET /health/ready` - Readiness probe (DB connection)
- `GET /health/live` - Liveness probe

**Alertmanager Configuration:**

```yaml
# alertmanager.yml
global:
  resolve_timeout: 5m

route:
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  receiver: 'default'

receivers:
  - name: 'default'
    email_configs:
      - to: 'alerts@your-domain.com'
        from: 'alertmanager@your-domain.com'
        smarthost: 'smtp.gmail.com:587'
        auth_username: 'alerts@your-domain.com'
        auth_password: '${SMTP_PASSWORD}'
    slack_configs:
      - api_url: '${SLACK_WEBHOOK_URL}'
        channel: '#alerts'
        title: '{{ .CommonAnnotations.summary }}'
        text: '{{ .CommonAnnotations.description }}'
```

**Alert Rules** (`alerts.yml`):

```yaml
groups:
  - name: api_alerts
    interval: 30s
    rules:
      - alert: APIDown
        expr: up{job="api"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "API is down"
          description: "API has been down for more than 1 minute"

      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"
          description: "Error rate is above 5% for 5 minutes"

      - alert: HighMemoryUsage
        expr: container_memory_usage_bytes{name="playlist-api"} / container_spec_memory_limit_bytes{name="playlist-api"} > 0.9
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage"
          description: "Memory usage is above 90%"

      - alert: DatabaseConnectionPoolExhausted
        expr: pg_stat_activity_count > 90
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Database connection pool exhausted"
          description: "PostgreSQL has {{ $value }} active connections"
```

### Monitoring Dashboard

**Key Metrics to Monitor:**

1. **Application Metrics:**
   - Request rate (requests/second)
   - Error rate (5xx responses)
   - Response time (p50, p95, p99)
   - Active users/sessions

2. **System Metrics:**
   - CPU usage
   - Memory usage
   - Disk I/O
   - Network traffic

3. **Database Metrics:**
   - Query performance
   - Connection pool usage
   - Cache hit ratio
   - Replication lag

4. **Worker Metrics:**
   - Job queue length
   - Job processing rate
   - Failed jobs
   - Job duration

---

## Security Considerations

### Production Security Checklist

- [ ] **Use HTTPS everywhere** (TLS 1.2+)
- [ ] **Strong secrets** (minimum 32 characters, randomly generated)
- [ ] **Environment isolation** (separate secrets per environment)
- [ ] **Firewall configuration** (restrict database/Redis to internal network)
- [ ] **Rate limiting** (API endpoints, especially auth)
- [ ] **CORS configuration** (whitelist specific origins)
- [ ] **SQL injection prevention** (Prisma handles this)
- [ ] **XSS prevention** (sanitize inputs, CSP headers)
- [ ] **CSRF protection** (state parameter in OAuth)
- [ ] **Dependency scanning** (`pnpm audit`)
- [ ] **Container scanning** (Trivy, Clair)
- [ ] **Secrets rotation** (regular key rotation)
- [ ] **Backup encryption** (encrypt backups at rest)
- [ ] **Access logging** (audit all access)
- [ ] **Regular updates** (security patches)

### Token Key Rotation

```bash
# Generate new master key
NEW_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")

# Set environment variables
export MASTER_KEY="<current-key>"
export MASTER_KEY_PREVIOUS="<previous-key>"  # For gradual migration
export MASTER_KEY_NEW="$NEW_KEY"

# Run rotation script
pnpm tsx scripts/rotate-token-key.ts

# Update environment variables in production
# - Set MASTER_KEY_PREVIOUS to old MASTER_KEY
# - Set MASTER_KEY to new key
# - Restart services with new environment

# After all tokens are re-encrypted, remove MASTER_KEY_PREVIOUS
```

### Network Security

**Firewall Rules (UFW):**

```bash
# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Block database/Redis from external access
sudo ufw deny 5432/tcp
sudo ufw deny 6379/tcp

# Enable firewall
sudo ufw enable
```

**Docker Network Isolation:**

```yaml
# Internal network for backend services
networks:
  internal:
    driver: bridge
    internal: true  # No external access

  public:
    driver: bridge
    internal: false  # External access allowed

services:
  api:
    networks:
      - public
      - internal

  db:
    networks:
      - internal  # Only accessible from internal network
```

---

## Troubleshooting

### Common Issues

#### 0. npm install fails with "Unsupported URL Type workspace:"

**Symptoms:**
```
npm error code EUNSUPPORTEDPROTOCOL
npm error Unsupported URL Type "workspace:": workspace:*
```

**Cause:**
This project is a **pnpm monorepo** that uses the `workspace:*` protocol, which npm does not support.

**Solution:**
```bash
# Install pnpm
corepack enable
corepack prepare pnpm@latest --activate

# Or using npm (one-time only)
npm install -g pnpm

# Then use pnpm instead of npm
pnpm install

# DO NOT USE npm - it will not work with this project
```

**Important:** Always use `pnpm` commands throughout this project:
- `pnpm install` (NOT `npm install`)
- `pnpm run <script>` (NOT `npm run <script>`)
- `pnpm add <package>` (NOT `npm install <package>`)

#### 1. Database Connection Errors

**Symptoms:**
```
Error: P1001: Can't reach database server at `db:5432`
```

**Solutions:**

```bash
# Check database is running
docker-compose ps db

# Check network connectivity
docker-compose exec api ping db

# Verify credentials
docker-compose exec db psql -U postgres -c "SELECT version();"

# Check connection limit
docker-compose exec db psql -U postgres -c "SHOW max_connections;"
docker-compose exec db psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"
```

#### 2. Redis Connection Issues

**Symptoms:**
```
Error: Redis connection to redis:6379 failed - connect ECONNREFUSED
```

**Solutions:**

```bash
# Check Redis is running
docker-compose ps redis

# Test connection
docker-compose exec redis redis-cli ping

# Check password
docker-compose exec redis redis-cli -a <password> ping

# View Redis logs
docker-compose logs redis
```

#### 3. High Memory Usage

**Solutions:**

```bash
# Check container memory usage
docker stats

# Increase memory limit in docker-compose.yml
services:
  api:
    deploy:
      resources:
        limits:
          memory: 2G

# Check for memory leaks
docker-compose exec api node --expose-gc --inspect=0.0.0.0:9229 dist/index.js

# Analyze heap dumps
node --inspect-brk dist/index.js
# Chrome: chrome://inspect
```

#### 4. Worker Jobs Stuck

**Symptoms:**
- Jobs in queue but not processing
- Worker service not consuming jobs

**Solutions:**

```bash
# Check worker logs
docker-compose logs -f worker

# Restart worker
docker-compose restart worker

# Check Redis queue
docker-compose exec redis redis-cli
> LLEN bullmq:jobs:waiting
> LRANGE bullmq:jobs:waiting 0 -1

# Manually clear stuck jobs (caution!)
> DEL bullmq:jobs:waiting
```

#### 5. Migration Failures

**Solutions:**

```bash
# Check migration status
docker-compose exec api pnpm prisma:migrate:status

# View migration logs
docker-compose logs api | grep migration

# Resolve conflicts
docker-compose exec api pnpm prisma:migrate:resolve --applied <migration-name>

# Reset development database (dev only!)
docker-compose exec api pnpm db:reset
```

#### 6. OAuth Callback Errors

**Symptoms:**
- "Invalid redirect URI"
- "State parameter mismatch"

**Solutions:**

```bash
# Verify API_BASE_URL is correct
echo $API_BASE_URL

# Check OAuth provider settings
# - Spotify: https://developer.spotify.com/dashboard
# - Deezer: https://developers.deezer.com/myapps

# Verify redirect URI matches exactly
# Format: {API_BASE_URL}/api/v1/auth/{provider}/callback

# Check state parameter expiration (10 minutes)
docker-compose exec api pnpm tsx -e "
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();
  db.oAuthAttempt.findMany({ orderBy: { expiresAt: 'desc' }, take: 10 })
    .then(console.log);
"
```

### Performance Debugging

**Slow API Requests:**

```bash
# Enable detailed logging
LOG_LEVEL=debug docker-compose up api

# Profile with clinic.js
npx clinic doctor -- node dist/index.js
npx clinic bubbleprof -- node dist/index.js

# Analyze PostgreSQL slow queries
docker-compose exec db psql -U postgres -c "
  SELECT
    query,
    calls,
    mean_exec_time,
    max_exec_time
  FROM pg_stat_statements
  ORDER BY mean_exec_time DESC
  LIMIT 10;
"
```

**High Database Load:**

```bash
# Check active queries
docker-compose exec db psql -U postgres -c "
  SELECT
    pid,
    usename,
    application_name,
    state,
    query,
    query_start
  FROM pg_stat_activity
  WHERE state != 'idle'
  ORDER BY query_start;
"

# Kill long-running query
docker-compose exec db psql -U postgres -c "SELECT pg_terminate_backend(<pid>);"

# Add missing indexes
./scripts/run-explain-checks.sh
```

### Logs Investigation

```bash
# View all logs
docker-compose logs -f

# Filter by service
docker-compose logs -f api

# Filter by time
docker-compose logs --since 30m api

# Search for errors
docker-compose logs api | grep -i error

# Export logs for analysis
docker-compose logs --no-color > logs.txt
```

### Emergency Procedures

**Complete Stack Restart:**

```bash
# Graceful restart
docker-compose restart

# Hard restart (loses ephemeral data)
docker-compose down
docker-compose up -d

# Nuclear option (destroys volumes - BACKUP FIRST!)
docker-compose down -v
docker-compose up -d
# Then restore from backup
```

**Rollback Deployment:**

```bash
# Docker Compose
docker-compose pull  # Get latest images
docker-compose up -d --no-deps api  # Update only API

# Kubernetes
kubectl rollout undo deployment/api -n playlist-manager

# Docker Swarm
docker service rollback playlist_api
```

---

## Appendix

### Useful Commands Reference

```bash
# Docker Compose
docker-compose up -d                    # Start services
docker-compose down                     # Stop services
docker-compose ps                       # List services
docker-compose logs -f <service>        # View logs
docker-compose exec <service> <cmd>     # Execute command
docker-compose restart <service>        # Restart service
docker-compose build                    # Rebuild images

# Prisma
pnpm prisma:generate                    # Generate client
pnpm prisma:migrate:dev                 # Create migration
pnpm prisma:migrate:deploy              # Deploy migrations
pnpm prisma:studio                      # Visual editor
pnpm db:health                          # Health check

# Database
pg_dump -U postgres playlistmgr > backup.sql           # Backup
psql -U postgres playlistmgr < backup.sql              # Restore
psql -U postgres -c "SELECT version();"                # Version

# Redis
redis-cli ping                                         # Test connection
redis-cli INFO                                         # Server info
redis-cli KEYS pattern                                 # List keys
redis-cli FLUSHALL                                     # Clear all data

# Monitoring
docker stats                                           # Container stats
docker system df                                       # Disk usage
docker system prune                                    # Cleanup
```

### Port Reference

| Service | Port | Protocol | Exposed |
|---------|------|----------|---------|
| API | 3101 | HTTP | Yes |
| PostgreSQL | 5432 | TCP | Internal |
| Redis | 6379 | TCP | Internal |
| MinIO API | 9000 | HTTP | Internal |
| MinIO Console | 9001 | HTTP | Internal |
| Prometheus | 9090 | HTTP | Internal |
| Grafana | 3000 | HTTP | Yes |
| Kibana | 5601 | HTTP | Internal |

### Support and Resources

- **Documentation**: [Repository README](README.md)
- **API Specification**: [OpenAPI Spec](packages/contracts/openapi.yaml)
- **Database Schema**: [Prisma Schema](packages/db/prisma/schema.prisma)
- **CI/CD**: [GitHub Actions](.github/workflows/ci.yml)
- **Issue Tracker**: GitHub Issues
- **License**: [LICENSE](LICENSE)

---

**Last Updated:** 2024-11-19
**Version:** 1.0.0
**Maintained by:** DevOps Team
