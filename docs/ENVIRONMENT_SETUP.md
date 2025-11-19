# Environment Setup Guide

Complete guide for setting up development, testing, and production environments.

## Quick Start (Development)

```bash
# 1. One-command setup
make setup

# 2. Generate secrets (or manually edit .env files)
make gen-secrets

# 3. Verify everything is working
make doctor

# 4. Start developing
make dev-api
```

---

## Manual Setup

### 1. Install Prerequisites

**Required:**
- Node.js 18.18+ ([nodejs.org](https://nodejs.org))
- pnpm 9.12+ (`corepack enable && corepack prepare pnpm@latest --activate`)
- Docker 24+ ([docs.docker.com](https://docs.docker.com/get-docker/))
- Docker Compose v2+

**Optional:**
- Make (for convenience commands)
- tmux (for `make dev-all`)
- jq (for JSON processing)

### 2. Clone Repository

```bash
git clone https://github.com/pfahlr/playlist-manager.git
cd playlist-manager
```

### 3. Install Dependencies

```bash
pnpm install
```

### 4. Set Up Environment Variables

**Option A: Use helper script (recommended)**
```bash
# Creates .env files from examples
make setup

# Generate secure random secrets
make gen-secrets
```

**Option B: Manual setup**
```bash
# Copy example files
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env

# Generate secrets
openssl rand -base64 32  # For MASTER_KEY
openssl rand -base64 64  # For JWT_SECRET

# Edit files and add secrets
nano .env
nano apps/api/.env
nano apps/worker/.env
```

**Required Environment Variables:**

`.env` (root):
```bash
COMPOSE_PROJECT_NAME=plmgr  # Optional: change for multiple instances
DB_PORT=5432
REDIS_PORT=6379
MINIO_API_PORT=9000
MINIO_CONSOLE_PORT=9001
```

`apps/api/.env`:
```bash
# Required
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/playlistmgr?schema=public
MASTER_KEY=<generated-32-byte-base64-key>
JWT_SECRET=<generated-64-byte-base64-secret>

# Optional but recommended
NODE_ENV=development
PORT=3101
API_BASE_URL=http://localhost:3101
LOG_LEVEL=debug
```

`apps/worker/.env`:
```bash
# Required
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/playlistmgr?schema=public
MASTER_KEY=<same-as-api>

# Optional
WORKER_CONCURRENCY=5
LOG_LEVEL=debug
```

### 5. Start Infrastructure Services

```bash
# Start Docker services (PostgreSQL, Redis, MinIO)
docker-compose up -d

# Or using make
make start
```

### 6. Set Up Database

```bash
# Generate Prisma client
pnpm prisma:generate

# Run migrations
pnpm prisma:migrate:deploy

# Seed with test data (optional)
pnpm prisma:seed
```

### 7. Verify Installation

```bash
# Run health checks
make doctor

# Or manually
pnpm db:health
curl http://localhost:3101/health  # After starting API
```

### 8. Start Development Servers

**Option A: Start all services in tmux**
```bash
make dev-all
```

**Option B: Start services individually**
```bash
# Terminal 1: API server
make dev-api
# Or: pnpm api:dev

# Terminal 2: Worker (if needed)
make dev-worker
# Or: pnpm --filter @app/worker dev

# Terminal 3: Mobile app (if needed)
make dev-mobile
# Or: cd apps/mobile && pnpm start
```

---

## Environment Types

### Development Environment

**Purpose:** Local development and testing

**Services:**
- PostgreSQL (port 5432) - Development database
- Redis (port 6379) - Cache and job queue
- MinIO (ports 9000/9001) - S3-compatible object storage

**Configuration:**
- Uses `.env` and `apps/*/. env` files
- Docker Compose with persistent volumes
- Hot reload enabled
- Debug logging
- No authentication required for some features

**Start:**
```bash
make start        # Start infrastructure
make dev-api      # Start API in dev mode
```

### Test Environment

**Purpose:** Integration and contract testing

**Services:**
- PostgreSQL (port 5433) - Test database (ephemeral)
- Redis (port 6380) - Test cache (no persistence)
- MinIO (ports 9002/9003) - Test storage (ephemeral)

**Configuration:**
- Uses `docker-compose.test.yml`
- All data is ephemeral (tmpfs volumes)
- Different ports to avoid conflicts
- Isolated from development data

**Start:**
```bash
docker-compose -f docker-compose.test.yml up -d

# Or with custom project name
COMPOSE_PROJECT_NAME=plmgr-test \
  docker-compose -f docker-compose.test.yml up -d
```

**Run Tests:**
```bash
# Set test database URL
export DATABASE_URL="postgresql://postgres:postgres@localhost:5433/playlistmgr_test?schema=public"

# Run tests
make test
```

### Staging Environment

**Purpose:** Pre-production testing

**Configuration:**
- Similar to production but separate infrastructure
- Uses production-like data (anonymized)
- Full logging and monitoring
- May use lower-tier resources

**Not included in this repo - requires separate deployment**

### Production Environment

**Purpose:** Live production system

**Services:**
- All services containerized
- Managed database (RDS/Cloud SQL) or PostgreSQL cluster
- Managed Redis (ElastiCache/Memorystore) or Redis cluster
- S3 or MinIO distributed
- Reverse proxy (Nginx)
- Monitoring (Prometheus/Grafana)
- Log aggregation (ELK/Loki)

**Configuration:**
- Uses `docker-compose.prod.yml`
- Secrets from vault (not .env files)
- SSL/TLS required
- Rate limiting enabled
- Audit logging
- Backups automated

**Deploy:**
See [DEVOPS.md](../DEVOPS.md) for detailed production deployment instructions.

---

## Common Environment Operations

### Health Checks

```bash
# Check all services
make health

# Check database only
pnpm db:health

# Check API
curl http://localhost:3101/health

# Check Redis
redis-cli ping
# Or through Docker
docker-compose exec redis redis-cli ping

# Check MinIO
curl http://localhost:9000/minio/health/live
```

### View Logs

```bash
# All Docker services
make logs

# Specific service
docker-compose logs -f db
docker-compose logs -f redis
docker-compose logs -f minio

# API logs (when running with pnpm)
# Logs output to stdout
```

### Database Operations

```bash
# Run migrations
make db-migrate

# Seed database
make db-seed

# Reset database (careful!)
make db-reset

# Open Prisma Studio (visual editor)
make db-studio

# Backup database
make db-backup
```

### Restart Services

```bash
# Restart all Docker services
make restart

# Restart specific service
docker-compose restart db
docker-compose restart redis

# Restart API (Ctrl+C and restart pnpm api:dev)
```

### Stop Services

```bash
# Stop all Docker services (keep volumes)
make stop

# Stop and remove volumes (destructive!)
make clean
```

---

## Multiple Development Instances

Run multiple instances of the project simultaneously (different branches, testing, etc.)

### Method 1: Using Helper Script

```bash
# Create new instance with different ports
./scripts/dev/create-instance.sh feature 5433 6380 9002 9003 3102

# This creates .env with:
# - DB_PORT=5433
# - REDIS_PORT=6380
# - MINIO_API_PORT=9002
# - MINIO_CONSOLE_PORT=9003
# - And updates apps/api/.env to use PORT=3102
```

### Method 2: Manual Configuration

```bash
# Instance 1 (default ports)
cd ~/playlist-manager-main
docker-compose up -d
pnpm api:dev

# Instance 2 (custom ports)
cd ~/playlist-manager-feature
cat > .env <<EOF
COMPOSE_PROJECT_NAME=plmgr-feature
DB_PORT=5433
REDIS_PORT=6380
MINIO_API_PORT=9002
MINIO_CONSOLE_PORT=9003
EOF

# Update apps/api/.env
sed -i 's|:5432/|:5433/|' apps/api/.env
sed -i 's|PORT=3101|PORT=3102|' apps/api/.env

docker-compose up -d
pnpm api:dev
```

---

## Troubleshooting

### Port Already in Use

**Symptom:**
```
Error: bind: address already in use
```

**Solution:**
```bash
# Find what's using the port
lsof -i :5432
lsof -i :3101

# Kill the process
kill -9 <PID>

# Or use different ports
# Edit .env and set DB_PORT=5433
```

### Database Connection Failed

**Symptom:**
```
Error: Can't reach database server
```

**Solution:**
```bash
# Check if PostgreSQL is running
docker-compose ps db

# View logs
docker-compose logs db

# Restart database
docker-compose restart db

# Verify connection
make health
```

### Permission Denied (Docker)

**Symptom:**
```
permission denied while trying to connect to Docker daemon
```

**Solution:**
```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Log out and back in, or:
newgrp docker

# Verify
docker ps
```

### Prisma Client Not Generated

**Symptom:**
```
Cannot find module '@prisma/client'
```

**Solution:**
```bash
pnpm prisma:generate
```

### Migrations Out of Sync

**Symptom:**
```
Migration XYZ is missing in database
```

**Solution:**
```bash
# Development: reset database
pnpm prisma:migrate:reset

# Production: deploy migrations
pnpm prisma:migrate:deploy
```

### Node Version Mismatch

**Symptom:**
```
The engine "node" is incompatible with this module
```

**Solution:**
```bash
# Check version
node --version

# Must be >= 18.18
# Install correct version from nodejs.org
```

### Make Command Not Found

**Symptom:**
```
make: command not found
```

**Solution:**
```bash
# Install make
# Ubuntu/Debian
sudo apt install build-essential

# macOS
xcode-select --install

# Or use pnpm scripts directly instead
pnpm api:dev  # Instead of make dev-api
```

---

## Environment Validation

Before starting development, run:

```bash
make doctor
```

This checks:
- ✓ Required commands (node, pnpm, docker)
- ✓ Node.js version
- ✓ Environment files exist
- ✓ Required environment variables are set
- ✓ Docker services are running
- ✓ Database connection works
- ✓ Ports are available

Example output:
```
🔍 Playlist Manager Environment Doctor
======================================

Checking required dependencies...
✓ node v20.10.0
✓ pnpm 9.12.3
✓ docker 24.0.7
✓ docker-compose 2.23.3

Checking environment files...
✓ .env exists
✓ apps/api/.env exists
✓ DATABASE_URL in apps/api/.env

Checking Docker services...
✓ db (running)
✓ redis (running)
✓ minio (running)

======================================
Summary:
✓ All checks passed!
Your environment is ready for development.
```

---

## Security Best Practices

### Development

1. **Never commit .env files**
   - Already in .gitignore
   - Double-check before committing

2. **Use different secrets per developer**
   - Each developer generates their own with `make gen-secrets`

3. **Rotate secrets periodically**
   - Change MASTER_KEY, JWT_SECRET every 3-6 months

4. **Don't share secrets via Slack/email**
   - Use secure password manager if needed

### Production

1. **Use secrets manager**
   - AWS Secrets Manager
   - HashiCorp Vault
   - Azure Key Vault
   - Google Secret Manager

2. **Environment isolation**
   - Separate credentials for dev/staging/production
   - Different databases, different keys

3. **Principle of least privilege**
   - API only gets database access it needs
   - Worker only gets job queue access

4. **Audit logging**
   - Log all access to secrets
   - Monitor for unusual patterns

5. **Regular rotation**
   - Automate secret rotation
   - Use `scripts/rotate-token-key.ts` for MASTER_KEY

---

## Next Steps

After environment setup:

1. **Read the development guide**: [DEVELOPMENT.md](./DEVELOPMENT.md)
2. **Understand the architecture**: [ARCHITECTURE.md](./ARCHITECTURE.md)
3. **Review the API spec**: [OpenAPI Spec](../openapi.yaml)
4. **Run the tests**: `make test`
5. **Start coding!**

---

**For production deployment, see [DEVOPS.md](../DEVOPS.md)**
