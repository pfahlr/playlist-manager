#!/bin/bash
set -e

# Helper script to create a new development instance with custom ports
# Usage: ./scripts/dev/create-instance.sh [instance-name] [db-port] [redis-port] [minio-api-port] [minio-console-port] [api-port]

INSTANCE_NAME="${1:-dev2}"
DB_PORT="${2:-5433}"
REDIS_PORT="${3:-6380}"
MINIO_API_PORT="${4:-9002}"
MINIO_CONSOLE_PORT="${5:-9003}"
API_PORT="${6:-3102}"

PROJECT_NAME="plmgr-${INSTANCE_NAME}"

echo "========================================="
echo "Creating Development Instance"
echo "========================================="
echo "Instance Name: $INSTANCE_NAME"
echo "Project Name: $PROJECT_NAME"
echo "PostgreSQL Port: $DB_PORT"
echo "Redis Port: $REDIS_PORT"
echo "MinIO API Port: $MINIO_API_PORT"
echo "MinIO Console Port: $MINIO_CONSOLE_PORT"
echo "API Port: $API_PORT"
echo "========================================="
echo ""

# Check if ports are already in use
check_port() {
  if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "❌ Error: Port $1 is already in use"
    echo "   Process: $(lsof -Pi :$1 -sTCP:LISTEN | tail -n 1)"
    return 1
  else
    echo "✓ Port $1 is available"
    return 0
  fi
}

echo "Checking port availability..."
ALL_AVAILABLE=true
check_port $DB_PORT || ALL_AVAILABLE=false
check_port $REDIS_PORT || ALL_AVAILABLE=false
check_port $MINIO_API_PORT || ALL_AVAILABLE=false
check_port $MINIO_CONSOLE_PORT || ALL_AVAILABLE=false
check_port $API_PORT || ALL_AVAILABLE=false
echo ""

if [ "$ALL_AVAILABLE" = false ]; then
  echo "❌ Some ports are already in use. Please choose different ports."
  exit 1
fi

# Create .env file
echo "Creating .env file..."
cat > .env <<EOF
# Development Instance: $INSTANCE_NAME
# Created: $(date)

COMPOSE_PROJECT_NAME=$PROJECT_NAME
DB_PORT=$DB_PORT
REDIS_PORT=$REDIS_PORT
MINIO_API_PORT=$MINIO_API_PORT
MINIO_CONSOLE_PORT=$MINIO_CONSOLE_PORT

# Keep defaults for these
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=playlistmgr
MINIO_ROOT_USER=minio
MINIO_ROOT_PASSWORD=minio12345
EOF
echo "✓ Created .env"

# Update apps/api/.env if it exists
if [ -f "apps/api/.env" ]; then
  echo ""
  read -p "Update apps/api/.env with new ports? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Backup existing .env
    cp apps/api/.env apps/api/.env.backup.$(date +%Y%m%d_%H%M%S)
    echo "✓ Backed up existing apps/api/.env"

    # Update DATABASE_URL
    if grep -q "^DATABASE_URL=" apps/api/.env; then
      sed -i.tmp "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://postgres:postgres@localhost:$DB_PORT/playlistmgr?schema=public|" apps/api/.env
      rm -f apps/api/.env.tmp
    else
      echo "DATABASE_URL=postgresql://postgres:postgres@localhost:$DB_PORT/playlistmgr?schema=public" >> apps/api/.env
    fi

    # Update REDIS_URL
    if grep -q "^REDIS_URL=" apps/api/.env; then
      sed -i.tmp "s|^REDIS_URL=.*|REDIS_URL=redis://localhost:$REDIS_PORT|" apps/api/.env
      rm -f apps/api/.env.tmp
    else
      echo "REDIS_URL=redis://localhost:$REDIS_PORT" >> apps/api/.env
    fi

    # Update S3_ENDPOINT
    if grep -q "^S3_ENDPOINT=" apps/api/.env; then
      sed -i.tmp "s|^S3_ENDPOINT=.*|S3_ENDPOINT=http://localhost:$MINIO_API_PORT|" apps/api/.env
      rm -f apps/api/.env.tmp
    else
      echo "S3_ENDPOINT=http://localhost:$MINIO_API_PORT" >> apps/api/.env
    fi

    # Update PORT
    if grep -q "^PORT=" apps/api/.env; then
      sed -i.tmp "s|^PORT=.*|PORT=$API_PORT|" apps/api/.env
      rm -f apps/api/.env.tmp
    else
      echo "PORT=$API_PORT" >> apps/api/.env
    fi

    # Update API_BASE_URL
    if grep -q "^API_BASE_URL=" apps/api/.env; then
      sed -i.tmp "s|^API_BASE_URL=.*|API_BASE_URL=http://localhost:$API_PORT|" apps/api/.env
      rm -f apps/api/.env.tmp
    else
      echo "API_BASE_URL=http://localhost:$API_PORT" >> apps/api/.env
    fi

    echo "✓ Updated apps/api/.env"
  fi
fi

echo ""
echo "========================================="
echo "Instance Configuration Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Start infrastructure:"
echo "     docker-compose up -d"
echo ""
echo "  2. Run migrations:"
echo "     pnpm prisma:migrate:dev"
echo ""
echo "  3. Start API server:"
echo "     pnpm api:dev"
echo ""
echo "Services will be available at:"
echo "  API:            http://localhost:$API_PORT"
echo "  API Docs:       http://localhost:$API_PORT/docs"
echo "  PostgreSQL:     localhost:$DB_PORT"
echo "  Redis:          localhost:$REDIS_PORT"
echo "  MinIO API:      http://localhost:$MINIO_API_PORT"
echo "  MinIO Console:  http://localhost:$MINIO_CONSOLE_PORT"
echo ""
echo "Container names will be prefixed with: $PROJECT_NAME"
echo "Volume names: ${PROJECT_NAME}_pgdata, ${PROJECT_NAME}_minio"
echo ""
echo "To stop this instance:"
echo "  docker-compose down"
echo ""
echo "To remove this instance completely:"
echo "  docker-compose down -v"
echo "========================================="
