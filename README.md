# website-cavedrepa

Infraestructura y contenido de **cavedrepa.smartravelevents.com** en S3 + CloudFront, con API REST, Lambda y DynamoDB.

El sitio se sirve como export estático de WordPress (HTML). PHP, MySQL y el admin quedan fuera de AWS. La Lambda `cavedrepa-web` está desplegada como stub; la lógica se programa en un paso posterior.

## Quick path

1. En GitHub, confirma los secrets `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY` (Settings → Secrets and variables → Actions → Secrets).
2. Haz push a `main` o ejecuta **Actions → Deploy infrastructure → Run workflow**.
3. Revisa los outputs del stack: bucket S3, `SiteUrl` (`https://cavedrepa.smartravelevents.com`) y `ApiUrl`.
4. El DNS y el certificado ACM se crean en la hosted zone de `smartravelevents.com` (misma cuenta).

## Qué crea el stack

| Recurso | Nombre |
|---|---|
| Stack CloudFormation | `website-cavedrepa-prod` |
| Bucket S3 | `cavedrepa-org-prod` |
| CloudFront | distribución con OAC y alias `cavedrepa.smartravelevents.com` |
| DNS / ACM | registro A/AAAA en Route 53 + certificado en us-east-1 |
| API Gateway REST | `cavedrepa-web-api` (stage `v1`) |
| Lambda | `cavedrepa-web` |
| DynamoDB | `cavedrepa-web-core` |
| Región | `us-east-1` |

```text
Internet → cavedrepa.smartravelevents.com → CloudFront (HTTPS) → OAC → S3 privado
Internet → API Gateway (cavedrepa-web-api) → Lambda (cavedrepa-web) → DynamoDB (cavedrepa-web-core)
```

El stack busca la hosted zone `smartravelevents.com` en Route 53, pide el certificado ACM y crea el alias hacia CloudFront. S3 sigue siendo privado (`cavedrepa-org-prod`).

## Secrets de GitHub

Solo necesitas estos dos **repository secrets**:

| Secret | Uso |
|---|---|
| `AWS_ACCESS_KEY_ID` | Credencial IAM |
| `AWS_SECRET_ACCESS_KEY` | Credencial IAM |

Si los guardaste dentro de un **Environment** de GitHub (por ejemplo `production`), añade esto al job en `.github/workflows/deploy-infra.yml`:

```yaml
jobs:
  deploy:
    environment: production
```

## Deploy local (opcional)

```bash
sam validate --lint -t templates/template.yaml --region us-east-1
sam build -t templates/template.yaml --region us-east-1

sam deploy \
  --template-file .aws-sam/build/template.yaml \
  --stack-name website-cavedrepa-prod \
  --region us-east-1 \
  --capabilities CAPABILITY_IAM \
  --resolve-s3
```

## Subir contenido (fase siguiente)

```bash
aws s3 sync ./export/ s3://cavedrepa-org-prod --delete

aws cloudfront create-invalidation \
  --distribution-id <CloudFrontDistributionId> \
  --paths "/*"
```

## Permisos IAM mínimos

El usuario IAM necesita, como mínimo:

* CloudFormation sobre el stack `website-cavedrepa-prod`
* S3 (bucket del sitio + bucket temporal de SAM con `--resolve-s3`)
* CloudFront (distribución, OAC, functions)
* ACM (certificado en us-east-1) y Route 53 (hosted zone `smartravelevents.com`)
* Lambda, API Gateway, DynamoDB y CloudWatch Logs
* IAM (crear roles que pida CloudFormation)
