# website-cavedrepa

Infraestructura y contenido de **cavedrepa.org** en S3 + CloudFront.

El sitio se sirve como export estático de WordPress (HTML). PHP, MySQL y el admin quedan fuera de AWS.

## Quick path

1. En GitHub, confirma las variables `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY` (Settings → Secrets and variables → Actions → Variables).
2. Haz push a `main` o ejecuta **Actions → Deploy infrastructure → Run workflow**.
3. Revisa los outputs del stack: bucket S3 y dominio CloudFront (`*.cloudfront.net`).
4. Cuando tengas el export HTML, súbelo al bucket e invalida CloudFront.

## Qué crea el stack

| Recurso | Nombre |
|---|---|
| Stack CloudFormation | `website-cavedrepa-prod` |
| Bucket S3 | `cavedrepa-org-prod` |
| CloudFront | distribución con OAC |
| Región | `us-east-1` |

```text
Internet → CloudFront (HTTPS) → OAC → S3 privado
```

Sin hosted zone ni certificado configurados, el sitio queda en `https://xxxx.cloudfront.net`. El dominio `cavedrepa.org` se conecta después añadiendo DNS y certificado ACM.

## Variables de GitHub

Solo necesitas estas dos **variables** (no secrets):

| Variable | Uso |
|---|---|
| `AWS_ACCESS_KEY_ID` | Credencial IAM |
| `AWS_SECRET_ACCESS_KEY` | Credencial IAM |

Si las guardaste dentro de un **Environment** de GitHub (por ejemplo `production`), añade esto al job en `.github/workflows/deploy-infra.yml`:

```yaml
jobs:
  deploy:
    environment: production
```

## Deploy local (opcional)

```bash
sam validate --lint -t templates/template.yaml

sam deploy \
  --template-file templates/template.yaml \
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
* IAM (crear roles que pida CloudFormation)
