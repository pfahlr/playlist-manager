#!/bin/bash
# Environment validation and health check script
# Checks that all required dependencies and services are available

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 Playlist Manager Environment Doctor"
echo "======================================"
echo ""

ERRORS=0
WARNINGS=0

# Function to check command availability
check_command() {
  local cmd=$1
  local required=$2
  local version_cmd=$3

  if command -v "$cmd" &> /dev/null; then
    local version=""
    if [ -n "$version_cmd" ]; then
      version=$($version_cmd 2>&1 || echo "unknown")
    fi
    echo -e "${GREEN}✓${NC} $cmd ${version}"
  else
    if [ "$required" = "required" ]; then
      echo -e "${RED}✗${NC} $cmd (REQUIRED - not found)"
      ((ERRORS++))
    else
      echo -e "${YELLOW}⚠${NC} $cmd (optional - not found)"
      ((WARNINGS++))
    fi
  fi
}

# Function to check environment variable
check_env_var() {
  local var=$1
  local file=$2
  local required=$3

  if grep -q "^${var}=" "$file" 2>/dev/null; then
    local value=$(grep "^${var}=" "$file" | cut -d'=' -f2-)
    if [[ "$value" == *"your-"* ]] || [[ "$value" == *"replace-with"* ]] || [[ "$value" == *"example"* ]]; then
      echo -e "${YELLOW}⚠${NC} $var in $file (placeholder value)"
      ((WARNINGS++))
    else
      echo -e "${GREEN}✓${NC} $var in $file"
    fi
  else
    if [ "$required" = "required" ]; then
      echo -e "${RED}✗${NC} $var missing in $file (REQUIRED)"
      ((ERRORS++))
    else
      echo -e "${YELLOW}⚠${NC} $var missing in $file (optional)"
      ((WARNINGS++))
    fi
  fi
}

# Function to check Docker service
check_docker_service() {
  local service=$1
  local port=$2

  if docker-compose ps "$service" 2>/dev/null | grep -q "Up"; then
    echo -e "${GREEN}✓${NC} $service (running)"

    # Check port if specified
    if [ -n "$port" ]; then
      if nc -z localhost "$port" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} $service port $port (accessible)"
      else
        echo -e "${YELLOW}⚠${NC} $service port $port (not accessible)"
        ((WARNINGS++))
      fi
    fi
  else
    echo -e "${YELLOW}⚠${NC} $service (not running)"
    ((WARNINGS++))
  fi
}

# Check required commands
echo "Checking required dependencies..."
check_command "node" "required" "node --version"
check_command "pnpm" "required" "pnpm --version"
check_command "docker" "required" "docker --version"
check_command "docker-compose" "required" "docker-compose --version"
check_command "git" "required" "git --version"
echo ""

# Check optional commands
echo "Checking optional dependencies..."
check_command "make" "optional" "make --version | head -n1"
check_command "jq" "optional" "jq --version"
check_command "curl" "optional" "curl --version | head -n1"
check_command "nc" "optional" ""
echo ""

# Check Node.js version
echo "Checking Node.js version..."
NODE_VERSION=$(node --version | cut -d'v' -f2)
REQUIRED_VERSION="18.18"
if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" = "$REQUIRED_VERSION" ]; then
  echo -e "${GREEN}✓${NC} Node.js version $NODE_VERSION (>= $REQUIRED_VERSION required)"
else
  echo -e "${RED}✗${NC} Node.js version $NODE_VERSION (>= $REQUIRED_VERSION required)"
  ((ERRORS++))
fi
echo ""

# Check pnpm version
echo "Checking pnpm version..."
PNPM_VERSION=$(pnpm --version)
REQUIRED_PNPM="9.12"
if [ "$(printf '%s\n' "$REQUIRED_PNPM" "$PNPM_VERSION" | sort -V | head -n1)" = "$REQUIRED_PNPM" ]; then
  echo -e "${GREEN}✓${NC} pnpm version $PNPM_VERSION (>= $REQUIRED_PNPM recommended)"
else
  echo -e "${YELLOW}⚠${NC} pnpm version $PNPM_VERSION (>= $REQUIRED_PNPM recommended)"
  ((WARNINGS++))
fi
echo ""

# Check .env files
echo "Checking environment files..."
if [ -f ".env" ]; then
  echo -e "${GREEN}✓${NC} .env exists"
else
  echo -e "${YELLOW}⚠${NC} .env missing (run: cp .env.example .env)"
  ((WARNINGS++))
fi

if [ -f "apps/api/.env" ]; then
  echo -e "${GREEN}✓${NC} apps/api/.env exists"
  check_env_var "DATABASE_URL" "apps/api/.env" "required"
  check_env_var "MASTER_KEY" "apps/api/.env" "required"
  check_env_var "JWT_SECRET" "apps/api/.env" "required"
  check_env_var "PORT" "apps/api/.env" "optional"
else
  echo -e "${RED}✗${NC} apps/api/.env missing (REQUIRED)"
  ((ERRORS++))
fi

if [ -f "apps/worker/.env" ]; then
  echo -e "${GREEN}✓${NC} apps/worker/.env exists"
else
  echo -e "${YELLOW}⚠${NC} apps/worker/.env missing (run: cp apps/worker/.env.example apps/worker/.env)"
  ((WARNINGS++))
fi
echo ""

# Check Docker services
echo "Checking Docker services..."
if docker ps &> /dev/null; then
  check_docker_service "db" "5432"
  check_docker_service "redis" "6379"
  check_docker_service "minio" "9000"
else
  echo -e "${YELLOW}⚠${NC} Docker daemon not running or not accessible"
  ((WARNINGS++))
fi
echo ""

# Check database connection
echo "Checking database connection..."
if [ -f "apps/api/.env" ]; then
  if pnpm db:health &> /dev/null; then
    echo -e "${GREEN}✓${NC} Database connection successful"
  else
    echo -e "${YELLOW}⚠${NC} Database connection failed (is Docker running?)"
    ((WARNINGS++))
  fi
else
  echo -e "${YELLOW}⚠${NC} Skipping database check (apps/api/.env missing)"
fi
echo ""

# Check Prisma client
echo "Checking Prisma client..."
if [ -d "node_modules/@prisma/client" ]; then
  echo -e "${GREEN}✓${NC} Prisma client generated"
else
  echo -e "${YELLOW}⚠${NC} Prisma client not generated (run: pnpm prisma:generate)"
  ((WARNINGS++))
fi
echo ""

# Check port availability
echo "Checking port availability..."
PORTS=(3101 5432 6379 9000 9001)
PORT_NAMES=("API" "PostgreSQL" "Redis" "MinIO API" "MinIO Console")
for i in "${!PORTS[@]}"; do
  PORT=${PORTS[$i]}
  NAME=${PORT_NAMES[$i]}

  if nc -z localhost "$PORT" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Port $PORT ($NAME) - in use (expected)"
  else
    echo -e "${YELLOW}⚠${NC} Port $PORT ($NAME) - available (service not running?)"
  fi
done
echo ""

# Summary
echo "======================================"
echo "Summary:"
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
  echo -e "${GREEN}✓ All checks passed!${NC}"
  echo "Your environment is ready for development."
  exit 0
elif [ $ERRORS -eq 0 ]; then
  echo -e "${YELLOW}⚠ $WARNINGS warning(s)${NC}"
  echo "Your environment is mostly ready, but some optional items need attention."
  exit 0
else
  echo -e "${RED}✗ $ERRORS error(s), $WARNINGS warning(s)${NC}"
  echo "Please fix the errors above before continuing."
  exit 1
fi
