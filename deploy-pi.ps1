# Deployt den Familienplaner auf den Raspberry Pi und startet ihn in pm2.
# Aufruf (im Projektordner):
#   .\deploy-pi.ps1                 # normales Update
#   .\deploy-pi.ps1 -Port 3003      # anderer Port
# Baut lokal (der Pi hat zu wenig RAM für `next build`) und überträgt nur das Ergebnis.
# Supabase-Zugangsdaten (NEXT_PUBLIC_*) werden beim Build eingebettet, es muss also keine .env auf den Pi.
param(
    [string]$Target = "pi@pi.local",
    [string]$AppDir = "~/family-planner",
    [int]$Port = 3003
)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$src   = Join-Path $env:TEMP "family-src.tgz"
$build = Join-Path $env:TEMP "family-build.tgz"
Remove-Item $src, $build -ErrorAction SilentlyContinue

Write-Host "==> Packe Quellen" -ForegroundColor Cyan
tar -czf $src --exclude=./node_modules --exclude=./.next --exclude=./.git --exclude=./.claude `
    --exclude=./.playwright-mcp --exclude=./.superpowers --exclude=./docs --exclude=./.github `
    --exclude=*.tsbuildinfo --exclude=./deploy-pi.ps1 --exclude=./.env.local --exclude=./.env.example .
if ($LASTEXITCODE) { throw "tar (Quellen) fehlgeschlagen" }

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
scp $src $build scripts/pi-install.sh "${Target}:/tmp/"
if ($LASTEXITCODE) { throw "scp fehlgeschlagen" }

Write-Host "==> Installiere auf dem Pi" -ForegroundColor Cyan
ssh -t $Target "APP_DIR=$AppDir APP_PORT=$Port bash /tmp/pi-install.sh /tmp/family-src.tgz /tmp/family-build.tgz"
if ($LASTEXITCODE) { throw "Installation auf dem Pi fehlgeschlagen" }

Remove-Item $src, $build -ErrorAction SilentlyContinue
