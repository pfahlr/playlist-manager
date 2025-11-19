#!/bin/bash
# Generate random secrets for .env files

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔐 Generating Random Secrets"
echo "============================"
echo ""

# Generate secrets
MASTER_KEY=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 64)
DB_PASSWORD=$(openssl rand -base64 24)
REDIS_PASSWORD=$(openssl rand -base64 24)
MINIO_PASSWORD=$(openssl rand -base64 24)

echo -e "${GREEN}Generated secrets:${NC}"
echo ""
echo "MASTER_KEY (32 bytes base64):"
echo "$MASTER_KEY"
echo ""
echo "JWT_SECRET (64 bytes base64):"
echo "$JWT_SECRET"
echo ""
echo "DB_PASSWORD:"
echo "$DB_PASSWORD"
echo ""
echo "REDIS_PASSWORD:"
echo "$REDIS_PASSWORD"
echo ""
echo "MINIO_ROOT_PASSWORD:"
echo "$MINIO_PASSWORD"
echo ""

# Ask if user wants to update .env files automatically
echo -e "${YELLOW}Would you like to automatically update your .env files?${NC}"
read -p "This will modify .env and apps/api/.env [y/N]: " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
  # Update root .env
  if [ -f ".env" ]; then
    # Create backup
    cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
    echo "✓ Backed up .env"

    # Update values (macOS compatible sed)
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|^MASTER_KEY=.*|MASTER_KEY=\"$MASTER_KEY\"|" .env
      sed -i '' "s|^DB_PASSWORD=.*|DB_PASSWORD=$DB_PASSWORD|" .env
      sed -i '' "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$REDIS_PASSWORD|" .env
      sed -i '' "s|^MINIO_ROOT_PASSWORD=.*|MINIO_ROOT_PASSWORD=$MINIO_PASSWORD|" .env
    else
      sed -i "s|^MASTER_KEY=.*|MASTER_KEY=\"$MASTER_KEY\"|" .env
      sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=$DB_PASSWORD|" .env
      sed -i "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$REDIS_PASSWORD|" .env
      sed -i "s|^MINIO_ROOT_PASSWORD=.*|MINIO_ROOT_PASSWORD=$MINIO_PASSWORD|" .env
    fi
    echo "✓ Updated .env"
  else
    echo "⚠ .env not found, skipping"
  fi

  # Update apps/api/.env
  if [ -f "apps/api/.env" ]; then
    # Create backup
    cp apps/api/.env apps/api/.env.backup.$(date +%Y%m%d_%H%M%S)
    echo "✓ Backed up apps/api/.env"

    # Update values
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|^MASTER_KEY=.*|MASTER_KEY=$MASTER_KEY|" apps/api/.env
      sed -i '' "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" apps/api/.env
    else
      sed -i "s|^MASTER_KEY=.*|MASTER_KEY=$MASTER_KEY|" apps/api/.env
      sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" apps/api/.env
    fi
    echo "✓ Updated apps/api/.env"
  else
    echo "⚠ apps/api/.env not found, skipping"
  fi

  # Update apps/worker/.env
  if [ -f "apps/worker/.env" ]; then
    # Create backup
    cp apps/worker/.env apps/worker/.env.backup.$(date +%Y%m%d_%H%M%S)
    echo "✓ Backed up apps/worker/.env"

    # Update values
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|^MASTER_KEY=.*|MASTER_KEY=$MASTER_KEY|" apps/worker/.env
    else
      sed -i "s|^MASTER_KEY=.*|MASTER_KEY=$MASTER_KEY|" apps/worker/.env
    fi
    echo "✓ Updated apps/worker/.env"
  else
    echo "⚠ apps/worker/.env not found, skipping"
  fi

  echo ""
  echo -e "${GREEN}✓ Secrets updated in .env files${NC}"
  echo "  Old files backed up with timestamp"
  echo ""
  echo "⚠️  IMPORTANT: If services are running, restart them:"
  echo "  make restart"
else
  echo ""
  echo "Secrets generated but not saved to files."
  echo "Copy the values above into your .env files manually."
fi

echo ""
echo "🔒 SECURITY REMINDERS:"
echo "  1. Never commit .env files to git"
echo "  2. Use different secrets for production"
echo "  3. Rotate secrets periodically"
echo "  4. Store production secrets in a secure vault"
