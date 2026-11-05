# Deployt den Familienplaner auf den Raspberry Pi und startet ihn in pm2.
# Aufruf (im Projektordner):
#   .\deploy-pi.ps1                 # normales Update
#   .\deploy-pi.ps1 -Port 3003      # anderer Port
# Baut lokal (der Pi hat zu wenig RAM für `next build`) und überträgt nur das Ergebnis.
# Supabase-Zugangsdaten (NEXT_PUBLIC_*) werden beim Build eingebettet.
# Reine Server-Secrets (FAMILY_LOGIN_EMAIL, RECIPES_*) werden NICHT eingebettet: sie werden aus .env.local
# gefiltert und auf dem Pi als .env.production.local (chmod 600) abgelegt. Alle .env*-Dateien bleiben
# aus dem Quell-Archiv draußen.
param(
    [string]$Target = "pi@pi.local",
    [string]$AppDir = "~/family-planner",
    [int]$Port = 3003
)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$src   = Join-Path $env:TEMP "family-src.tgz"
$build = Join-Path $env:TEMP "family-build.tgz"
$envf  = Join-Path $env:TEMP "family-server.env"
Remove-Item $src, $build, $envf -ErrorAction SilentlyContinue

Write-Host "==> Packe Quellen" -ForegroundColor Cyan
tar -czf $src --exclude=./node_modules --exclude=./.next --exclude=./.git --exclude=./.claude `
    --exclude=./.playwright-mcp --exclude=./.superpowers --exclude=./docs --exclude=./.github `
    --exclude=*.tsbuildinfo --exclude=./deploy-pi.ps1 --exclude=./.env* --exclude=*.sql .
if ($LASTEXITCODE) { throw "tar (Quellen) fehlgeschlagen" }
if (tar -tzf $src | Select-String -Pattern '(^|/)\.env') { throw "Quell-Archiv enthält .env-Dateien – Abbruch" }

Write-Host "==> Server-Secrets aus .env.local" -ForegroundColor Cyan
$serverKeys = '^(FAMILY_LOGIN_EMAIL|RECIPES_NEXT_PUBLIC_SUPABASE_URL|RECIPES_NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY|RECIPES_SUPABASE_SERVICE_ROLE_KEY)='
$serverLines = @(Get-Content .env.local | Where-Object { $_ -match $serverKeys })
if ($serverLines.Count -eq 0) { throw "Keine Server-Secrets in .env.local gefunden" }
# LF, UTF-8 ohne BOM – wird auf dem Pi von Next.js gelesen
[IO.File]::WriteAllText($envf, (($serverLines -join "`n") + "`n"), [Text.UTF8Encoding]::new($false))
Write-Host ("    " + (($serverLines | ForEach-Object { ($_ -split '=')[0] }) -join ", "))

Write-Host "==> Baue lokal (pnpm build)" -ForegroundColor Cyan
# pnpm-Shim kann kaputt sein -> testen, sonst corepack.
$pnpmOk = $false
if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    pnpm --version *> $null
    $pnpmOk = ($LASTEXITCODE -eq 0)
}
if (-not $pnpmOk) {
    if (-not (Get-Command corepack -ErrorAction SilentlyContinue)) { throw "pnpm defekt/nicht gefunden und corepack fehlt" }
    function pnpm { corepack pnpm @args }
}
pnpm build
if ($LASTEXITCODE) { throw "Lokaler Build fehlgeschlagen" }
tar -czf $build -C .next --exclude=./cache .
if ($LASTEXITCODE) { throw "tar (Build) fehlgeschlagen" }

Write-Host "==> Kopiere nach $Target" -ForegroundColor Cyan
try {
    scp $src $build $envf scripts/pi-install.sh "${Target}:/tmp/"
    if ($LASTEXITCODE) { throw "scp fehlgeschlagen" }
} finally {
    Remove-Item $envf -ErrorAction SilentlyContinue
}

Write-Host "==> Installiere auf dem Pi" -ForegroundColor Cyan
ssh -t $Target "chmod 600 /tmp/family-server.env; APP_DIR=$AppDir APP_PORT=$Port bash /tmp/pi-install.sh /tmp/family-src.tgz /tmp/family-build.tgz /tmp/family-server.env"
if ($LASTEXITCODE) { throw "Installation auf dem Pi fehlgeschlagen" }

Remove-Item $src, $build -ErrorAction SilentlyContinue
