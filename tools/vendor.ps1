# Re-downloads the vendored runtime libraries (PowerShell 5.1 compatible – no && / ?: operators).
# Versions are pinned here and documented in docs/DECISIONS.md (ADR-013/014).
# Usage:  powershell -ExecutionPolicy Bypass -File tools\vendor.ps1
# Requires curl.exe (ships with Windows 10+). Cloudflare-fronted CDNs need a browser User-Agent.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$threeVersion = "0.185.1"
$rapierVersion = "0.20.0"
$ua = "Mozilla/5.0"

function Fetch($url, $target) {
  $dir = Split-Path -Parent $target
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
  Write-Host "  $url"
  & curl.exe -sL -A $ua $url -o $target
  if ($LASTEXITCODE -ne 0) { throw "download failed: $url" }
  if ((Get-Item $target).Length -lt 100) { throw "suspiciously small file: $target" }
}

Write-Host "three.js $threeVersion"
Fetch "https://cdn.jsdelivr.net/npm/three@$threeVersion/build/three.module.js" "$root\vendor\three\three.module.js"
Fetch "https://cdn.jsdelivr.net/npm/three@$threeVersion/build/three.core.js"   "$root\vendor\three\three.core.js"
Fetch "https://cdn.jsdelivr.net/npm/three@$threeVersion/LICENSE"               "$root\vendor\three\LICENSE"
# Addons (examples/jsm) are added here one file at a time when needed, e.g.:
# Fetch "https://cdn.jsdelivr.net/npm/three@$threeVersion/examples/jsm/postprocessing/EffectComposer.js" "$root\vendor\three\addons\postprocessing\EffectComposer.js"

Write-Host "@dimforge/rapier3d-compat $rapierVersion (ES build, WASM inlined as base64 – no relative imports)"
Fetch "https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@$rapierVersion/dist/rapier.mjs" "$root\vendor\rapier\rapier.mjs"
Fetch "https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@$rapierVersion/LICENSE"         "$root\vendor\rapier\LICENSE"

Write-Host "done. Verify in the browser: network tab must show only 127.0.0.1 requests."
