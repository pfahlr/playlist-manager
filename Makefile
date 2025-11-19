# Playlist Manager - Development Makefile
# Provides convenient shortcuts for common development tasks

.PHONY: help setup start stop restart logs clean test health doctor

# Default target - show help
help:
	@echo "Playlist Manager - Development Commands"
	@echo ""
	@echo "Environment Setup:"
	@echo "  make setup          - Initial project setup (install deps, copy env files)"
	@echo "  make doctor         - Validate environment and dependencies"
	@echo ""
	@echo "Docker Services:"
	@echo "  make start          - Start all Docker services (db, redis, minio)"
	@echo "  make stop           - Stop all Docker services"
	@echo "  make restart        - Restart all Docker services"
	@echo "  make logs           - View Docker service logs"
	@echo "  make clean          - Stop services and remove volumes (DESTRUCTIVE)"
	@echo ""
	@echo "Database:"
	@echo "  make db-migrate     - Run database migrations"
	@echo "  make db-seed        - Seed database with test data"
	@echo "  make db-reset       - Reset database (migrate + seed)"
	@echo "  make db-studio      - Open Prisma Studio"
	@echo "  make db-backup      - Backup database to ./backups/"
	@echo ""
	@echo "Development:"
	@echo "  make dev-api        - Start API server in dev mode"
	@echo "  make dev-worker     - Start worker in dev mode"
	@echo "  make dev-mobile     - Start mobile app (Expo)"
	@echo "  make dev-all        - Start all services (tmux/screen required)"
	@echo ""
	@echo "Testing:"
	@echo "  make test           - Run all tests"
	@echo "  make test-unit      - Run unit tests"
	@echo "  make test-contract  - Run contract tests"
	@echo "  make lint           - Run linters"
	@echo ""
	@echo "Utilities:"
	@echo "  make health         - Check health of all services"
	@echo "  make gen-types      - Generate TypeScript types from OpenAPI"
	@echo "  make gen-secrets    - Generate random secrets for .env"
	@echo ""

# ============================================================================
# Environment Setup
# ============================================================================

setup: check-pnpm
	@echo "🚀 Setting up Playlist Manager..."
	@echo "📦 Installing dependencies..."
	pnpm install
	@echo "📝 Creating .env files from examples..."
	@test -f .env || cp .env.example .env
	@test -f apps/api/.env || cp apps/api/.env.example apps/api/.env
	@test -f apps/worker/.env || cp apps/worker/.env.example apps/worker/.env
	@echo "⚠️  IMPORTANT: Edit .env files and add required secrets!"
	@echo "   Run 'make gen-secrets' to generate random secrets"
	@echo "🐳 Starting Docker services..."
	docker-compose up -d
	@echo "⏳ Waiting for database..."
	@sleep 5
	@echo "🗄️  Running database migrations..."
	pnpm prisma:generate
	pnpm prisma:migrate:deploy
	@echo ""
	@echo "✅ Setup complete! Next steps:"
	@echo "   1. Edit .env files with your secrets (or run 'make gen-secrets')"
	@echo "   2. Run 'make db-seed' to add test data"
	@echo "   3. Run 'make dev-api' to start the API server"
	@echo "   4. Visit http://localhost:3101/docs for API documentation"

check-pnpm:
	@which pnpm > /dev/null || (echo "❌ pnpm not found. Install with: npm install -g pnpm" && exit 1)

doctor:
	@echo "🔍 Running environment health checks..."
	@./scripts/dev/doctor.sh

# ============================================================================
# Docker Services
# ============================================================================

start:
	@echo "🐳 Starting Docker services..."
	docker-compose up -d
	@echo "✅ Services started. Run 'make logs' to view logs."

stop:
	@echo "🛑 Stopping Docker services..."
	docker-compose stop
	@echo "✅ Services stopped."

restart: stop start

logs:
	docker-compose logs -f

clean:
	@echo "⚠️  This will DELETE all data in Docker volumes!"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		docker-compose down -v; \
		echo "✅ Services and volumes removed."; \
	else \
		echo "❌ Cancelled."; \
	fi

# ============================================================================
# Database Operations
# ============================================================================

db-migrate:
	@echo "🗄️  Running database migrations..."
	pnpm prisma:migrate:deploy

db-seed:
	@echo "🌱 Seeding database..."
	pnpm prisma:seed

db-reset:
	@echo "🔄 Resetting database..."
	pnpm prisma:migrate:reset --skip-seed
	pnpm prisma:seed

db-studio:
	@echo "🎨 Opening Prisma Studio..."
	pnpm prisma:studio

db-backup:
	@echo "💾 Backing up database..."
	@mkdir -p backups
	@./scripts/backup.sh

# ============================================================================
# Development
# ============================================================================

dev-api:
	@echo "🚀 Starting API server in dev mode..."
	pnpm api:dev

dev-worker:
	@echo "⚙️  Starting worker in dev mode..."
	pnpm --filter @app/worker dev

dev-mobile:
	@echo "📱 Starting mobile app..."
	cd apps/mobile && pnpm start

dev-all:
	@echo "🚀 Starting all services..."
	@which tmux > /dev/null || (echo "❌ tmux not found. Install with: apt install tmux / brew install tmux" && exit 1)
	@./scripts/dev/start-all.sh

# ============================================================================
# Testing
# ============================================================================

test:
	@echo "🧪 Running all tests..."
	pnpm vitest run

test-unit:
	@echo "🧪 Running unit tests..."
	pnpm vitest run --exclude "**/*.contract.test.ts"

test-contract:
	@echo "🧪 Running contract tests..."
	pnpm test:contract:dredd:server

lint:
	@echo "🔍 Running linters..."
	pnpm lint:api

# ============================================================================
# Utilities
# ============================================================================

health:
	@echo "🏥 Checking service health..."
	@./scripts/dev/health-check.sh

gen-types:
	@echo "📝 Generating TypeScript types from OpenAPI..."
	pnpm gen:types

gen-secrets:
	@echo "🔐 Generating random secrets..."
	@./scripts/dev/generate-secrets.sh

# ============================================================================
# Production (use with caution)
# ============================================================================

prod-build:
	@echo "🏗️  Building for production..."
	docker-compose -f docker-compose.prod.yml build

prod-up:
	@echo "🚀 Starting production services..."
	docker-compose -f docker-compose.prod.yml up -d

prod-down:
	@echo "🛑 Stopping production services..."
	docker-compose -f docker-compose.prod.yml down

prod-logs:
	docker-compose -f docker-compose.prod.yml logs -f
