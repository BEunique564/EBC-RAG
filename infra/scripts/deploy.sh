#!/bin/bash
# ============================================================
# EBC Legal AI — Deploy Script
# Sirf yeh command chalani hai: bash infra/scripts/deploy.sh
# ============================================================
set -euo pipefail

echo "=========================================="
echo " EBC Legal AI — Deploy Script"
echo "=========================================="

# ----------------------------------------
# Step 1: Check prerequisites
# ----------------------------------------
echo ""
echo "[1/5] Checking prerequisites..."

command -v aws >/dev/null 2>&1 || { echo "❌ AWS CLI nahi mila. Install karo: https://aws.amazon.com/cli/"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "❌ Docker nahi mila. Install karo: https://docker.com"; exit 1; }

# Check AWS credentials
aws sts get-caller-identity >/dev/null 2>&1 || { echo "❌ AWS credentials configure nahi hain. Run: aws configure"; exit 1; }

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=${AWS_REGION:-ap-south-1}
ECR_REPO="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/ebc-ai-api"
echo "✅ AWS authenticated (Account: $ACCOUNT_ID, Region: $REGION)"

# ----------------------------------------
# Step 2: Build Docker image
# ----------------------------------------
echo ""
echo "[2/5] Building Docker image..."
cd "$(dirname "$0")/../.."

docker build -t ebc-ai-api:latest .
echo "✅ Docker image built"

# ----------------------------------------
# Step 3: Push to ECR
# ----------------------------------------
echo ""
echo "[3/5] Pushing to ECR..."

# Login to ECR
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

# Tag and push
docker tag ebc-ai-api:latest ${ECR_REPO}:latest
docker tag ebc-ai-api:latest ${ECR_REPO}:$(date +%Y%m%d-%H%M%S)
docker push ${ECR_REPO}:latest
echo "✅ Image pushed to ECR"

# ----------------------------------------
# Step 4: Update ECS service
# ----------------------------------------
echo ""
echo "[4/5] Updating ECS service..."
ECS_CLUSTER="ebc-ai-${ENVIRONMENT:-production}"
ECS_SERVICE="ebc-ai-api"

aws ecs update-service \
  --cluster $ECS_CLUSTER \
  --service $ECS_SERVICE \
  --force-new-deployment \
  --region $REGION

echo "✅ ECS service updated (new deployment started)"

# ----------------------------------------
# Step 5: Create DB tables (first time only)
# ----------------------------------------
echo ""
echo "[5/5] Setting up database..."
echo "⏳ Pehle deploy ke baad hi yeh step chahiye. Baar baar nahi chalana."

# SQL file for initial setup
PG_HOST=$(aws rds describe-db-instances --db-instance-identifier ebc-ai-production --query "DBInstances[0].Endpoint.Address" --output text 2>/dev/null || echo "")
if [ -n "$PG_HOST" ]; then
  echo "RDS endpoint: $PG_HOST"
  echo "Connect karne ke liye: psql -h $PG_HOST -U ebc_admin -d ebc_legal_ai"
  echo ""
  echo "Phir yeh SQL chalana:"
  cat <<'SQL'
CREATE TABLE IF NOT EXISTS documents (
  document_id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  document_type VARCHAR(50),
  court VARCHAR(100),
  year INTEGER,
  citation TEXT,
  act VARCHAR(100),
  section VARCHAR(50),
  metadata JSONB,
  s3_raw_path TEXT,
  s3_clean_path TEXT,
  ingested_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS query_log (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR(100),
  query TEXT,
  status VARCHAR(50),
  confidence INTEGER,
  citations_count INTEGER,
  latency_ms INTEGER,
  answer_type VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_query_log_created ON query_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_log_user ON query_log(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_court ON documents(court);
CREATE INDEX IF NOT EXISTS idx_documents_act ON documents(act);
CREATE INDEX IF NOT EXISTS idx_documents_year ON documents(year);
SQL
fi

echo ""
echo "=========================================="
echo " ✅ DEPLOY COMPLETE"
echo "=========================================="
echo ""
echo "API URL: https://ai.ebc.co.in"
echo "Health:  https://ai.ebc.co.in/api/health"
echo ""
echo "EBC website me integration ke liye yeh script chalao:"
echo "  <script src=\"https://ai.ebc.co.in/widget.js\" data-ebc-key=\"YOUR_KEY\"></script>"
