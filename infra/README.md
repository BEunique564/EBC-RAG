# EBC Legal AI — Deploy Step by Step (Hinglish)

Yeh guide hai **uske liye jisko AWS nahi aata**. Har step me exactly likha hai kya karna hai.

---

## Option 1: Sabse Easy — Render.com (Free me chalega)

Agar bas demo/test karna hai, 2 minute ka kaam:

```
1. https://render.com pe account banao (GitHub se login)
2. "New Web Service" → "Build and deploy from a Git repository"
3. Yeh repository select karo → "Connect"
4. Name: ebc-legal-rag
5. Environment: Docker
6. "Advanced" → Add Environment Variable:
     PORT = 5174
7. "Create Web Service" → 2-3 min wait karo
8. ✅ Done! Render tumhe URL dega → waha chal raha hai
```

> **Render pe free me unlimited requests. LLM feature nahi chalega (local Ollama chahiye).**

---

## Option 2: Railway.app (Bhi Easy Hai)

```
1. https://railway.app pe account banao (GitHub se login)
2. "New Project" → "Deploy from GitHub repo"
3. Yeh repo select karo
4. Automatic detect karega railway.toml → bas "Deploy" dabao
5. ✅ Done! 5 min me chal raha hoga
```

---

## Option 3: AWS (Production ke liye)

### Pehle kya chahiye?

| Cheez | Kahan milegi |
|-------|-------------|
| AWS Account | https://aws.amazon.com pe signup (credit card chahiye) |
| Domain name | ebc.co.in ka DNS access (EBC IT team se pucho) |
| 10-15 min time | Terraform sab automatically banayega |

### Step 1: AWS Account Banao

```
1. https://aws.amazon.com → "Create an AWS Account"
2. Email + password + credit card daalo
3. Phone verification karo
4. Support plan: "Free Support" (Basic) select karo
5. Login karo: https://console.aws.amazon.com
```

### Step 2: IAM User Banao (Safe Access Ke Liye)

```
1. AWS Console me search karo "IAM"
2. "Users" → "Create user"
3. Username: ebc-deployer
4. "Attach policies directly" select karo:
   - AdministratorAccess (full access, ya specific policies)
5. User create karo → "Create access key"
6. "Use case" → "Command Line Interface (CLI)"
7. Access Key ID aur Secret Access Key copy karo (safe jagah save karo)
```

### Step 3: AWS CLI Install + Configure

Windows:
```
1. https://awscli.amazonaws.com/AWSCLIV2.msi download karo
2. Install karo (Next → Next → Finish)
3. Command Prompt open karo
4. Yeh command chalao:

   aws configure

5. Jab poochhe:
   AWS Access Key ID: <upar wali key daalo>
   AWS Secret Access Key: <upar wala secret daalo>
   Default region: ap-south-1
   Default output format: json

6. Test karo:
   aws sts get-caller-identity
   ✅ Response me Account ID dikhna chahiye
```

### Step 4: Terraform Install Karo

```
Windows:
1. https://developer.hashicorp.com/terraform/downloads
2. Windows AMD64 download karo
3. Zip file extract karo → terraform.exe kahi rakh do
4. PATH me add karo ya C:\Windows\System32 me copy karo
5. Command Prompt:

   terraform --version
   ✅ Version dikhna chahiye (>= 1.5)
```

### Step 5: Domain Setup (EBC IT Team Se Pucho)

EBC ke DNS team se yeh mangwana padega:

```
1. Route53 hosted zone ID (domain manage karne ke liye)
2. Domain name (e.g., ai.ebc.co.in)

Agar yeh nahi hai, toh terraform apply ke baad ALB ka DNS milega
(bina domain ke bhi API chalega)
```

### Step 6: Terraform Apply Karo

```
1. Folder me jao:
   cd infra/aws

2. Initialize:
   terraform init

3. Variables edit karo (notepad variables.tf):
   - environment = "production"
   - domain_name = "ai.ebc.co.in"   (EBC team se lo)
   - route53_zone_id = "ZXXXXXXXX"  (EBC team se lo)

4. Check karo kya banega:
   terraform plan

5. Apply karo:
   terraform apply -auto-approve

6. 10-15 min wait karo...

7. Jab done ho, yeh dikhega:
   ✅ Outputs:
   api_url = "https://ai.ebc.co.in"
   ecr_repository = "xxxx.dkr.ecr.ap-south-1.amazonaws.com/ebc-ai-api"
```

### Step 7: Docker Image Build + Push

```
1. Wapas root folder me jao:
   cd ../..

2. Deploy script chalao:
   bash infra/scripts/deploy.sh

   Yeh karega:
   ✅ Docker build
   ✅ ECR push
   ✅ ECS update

3. 2-3 min me API chal raha hoga
```

### Step 8: Verify Ki Chal Raha Hai

```
Browser me kholo:
https://ai.ebc.co.in/api/health

Response aana chahiye:
{
  "ok": true,
  "service": "legal-evidence-rag",
  "corpus_documents": 9,
  "corpus_chunks": 13,
  ...
}
```

### Step 9: EBC Website Me Integration

EBC website team ko yeh code dena:

```html
<!-- EBC website ke HTML me yeh daal do -->
<script>
  window.EBC_AI_CONFIG = {
    apiUrl: "https://ai.ebc.co.in",
    userToken: "USER_JWT_HERE",  // EBC login se aayega
    userTier: "premium",         // free/basic/premium/enterprise
    position: "bottom-right"     // chat bubble position
  };
</script>
<script src="https://ai.ebc.co.in/widget.js"></script>
```

---

## Step 10: Database Create Karo

Pehli baar deploy ke baad, database tables banana hoga:

```
1. RDS endpoint pata karo:
   aws rds describe-db-instances --db-instance-identifier ebc-ai-production
   (mein se "Endpoint.Address" copy karo)

2. Connect karo:
   psql -h <endpoint> -U ebc_admin -d ebc_legal_ai
   (password terraform output me tha, ya RDS console me reset karo)

3. Yeh SQL chalao:
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

✅ Done! Database ready hai.
```

---

## Common Problems

| Problem | Solution |
|---------|----------|
| `terraform init` error | Check karo terraform installed hai ya nahi |
| `aws` command not found | AWS CLI install karo (Step 3) |
| Docker build slow | Pehli baar me 2-3 min lagte hain. Normal hai |
| ECS service stuck | Check karo ki Docker image ECR me push hui ya nahi |
| API 404 de raha | 2-3 min wait karo, ECS deploy time lagta hai |
| "insufficient_evidence" | Normal hai — corpus me sirf 9 demo docs hain |

---

## Ek Baar Sab Upar Ho Gaya Toh...

```
API URL:     https://ai.ebc.co.in
Health:      https://ai.ebc.co.in/api/health
Chat:        POST https://ai.ebc.co.in/api/chat
SLO Status:  https://ai.ebc.co.in/api/slo
```

EBC website me widget daalne ke baad, lawyer log SCC Online / EBC Reader me hi baith ke AI se poochh sakte hain. Har answer ke saath citation, har citation ke saath source link. Zero hallucination.
