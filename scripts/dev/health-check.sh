#!/bin/bash
# Health check script for all services
# Checks that API, database, Redis, and MinIO are all healthy

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🏥 Service Health Check"
echo "======================="
echo ""

ALL_HEALTHY=true

# Check PostgreSQL
echo -n "PostgreSQL... "
if nc -z localhost 5432 2>/dev/null; then
  if pnpm db:health &> /dev/null; then
    echo -e "${GREEN}✓ Healthy${NC}"
  else
    echo -e "${YELLOW}⚠ Running but connection failed${NC}"
    ALL_HEALTHY=false
  fi
else
  echo -e "${RED}✗ Not running${NC}"
  ALL_HEALTHY=false
fi

# Check Redis
echo -n "Redis... "
if nc -z localhost 6379 2>/dev/null; then
  if redis-cli ping 2>/dev/null | grep -q "PONG"; then
    echo -e "${GREEN}✓ Healthy${NC}"
  elif docker-compose exec -T redis redis-cli ping 2>/dev/null | grep -q "PONG"; then
    echo -e "${GREEN}✓ Healthy${NC}"
  else
    echo -e "${YELLOW}⚠ Running but ping failed${NC}"
    ALL_HEALTHY=false
  fi
else
  echo -e "${RED}✗ Not running${NC}"
  ALL_HEALTHY=false
fi

# Check MinIO
echo -n "MinIO... "
if nc -z localhost 9000 2>/dev/null; then
  if curl -s -f http://localhost:9000/minio/health/live > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Healthy${NC}"
  else
    echo -e "${YELLOW}⚠ Running but health check failed${NC}"
    ALL_HEALTHY=false
  fi
else
  echo -e "${RED}✗ Not running${NC}"
  ALL_HEALTHY=false
fi

# Check API
echo -n "API... "
if nc -z localhost 3101 2>/dev/null; then
  if curl -s -f http://localhost:3101/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Healthy${NC}"
  else
    echo -e "${YELLOW}⚠ Running but health check failed${NC}"
    ALL_HEALTHY=false
  fi
else
  echo -e "${YELLOW}⚠ Not running (expected if not started)${NC}"
fi

echo ""
echo "======================="
if [ "$ALL_HEALTHY" = true ]; then
  echo -e "${GREEN}✓ All infrastructure services are healthy${NC}"
  exit 0
else
  echo -e "${YELLOW}⚠ Some services are not healthy${NC}"
  echo ""
  echo "To start infrastructure services:"
  echo "  docker-compose up -d"
  echo ""
  echo "To view logs:"
  echo "  docker-compose logs -f"
  exit 1
fi
