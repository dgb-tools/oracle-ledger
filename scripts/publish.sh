#!/usr/bin/env bash
# Aggregate the walk, render the page, deploy to dgbinsights, record the snapshot in the repo.
# Usage: scripts/publish.sh            (after `npm run walk` has finished)
set -euo pipefail
cd "$(dirname "$0")/.."
SITE="${SITE:-/Users/michael/Library/CloudStorage/Dropbox/Windsurf/DGB Tools/dgbinsights/site}"
TMP="$(mktemp -d)"
echo "== aggregate"; node src/aggregate.js 2> "$TMP/agg.json"
ID=$(python3 -c "import json;print(json.load(open('data/latest.json'))['snapshot_id'])")
echo "snapshot $ID"
echo "== render"; node src/render.js "data/snapshots/$ID" "$TMP/site"
echo "== stage into site/oracles"; rm -rf "$SITE/oracles"; cp -R "$TMP/site/oracles" "$SITE/oracles"
du -sh "$SITE/oracles"; find "$SITE/oracles" -size +20M -print | sed 's/^/TOO BIG FOR PAGES: /'
echo "== deploy from a local copy (the site dir is a Dropbox cloud path; uploading from it served stale files)"; LOCAL="$(mktemp -d)/site"; rsync -a --exclude ".DS_Store" "$SITE/" "$LOCAL/"; ( cd "$SITE/.." && CLOUDFLARE_ACCOUNT_ID=d5ca89fa8e14b07774666aa1d637ec6b CLOUDFLARE_API_TOKEN=$(cat ~/.cf_dgbinsights_deploy_token) npx --yes wrangler@3 pages deploy "$LOCAL" --project-name dgbinsights --commit-dirty=true 2>&1 | grep -E "Deployment complete|rror|Uploaded" )
echo "== verify live"; for p in "oracles/" "oracles/latest.json" "oracles/schema.json" "oracles/snapshots/$ID/manifest.json" "oracles/snapshots/$ID/SHA256SUMS"; do printf "%-70s " "$p"; curl -s -o /dev/null -w "%{http_code}\n" "https://dgbinsights.com/$p"; done
echo "== record in repo"; mkdir -p "snapshots/$ID"; cp "data/snapshots/$ID/manifest.json" "data/snapshots/$ID/SHA256SUMS" "snapshots/$ID/"; cp data/latest.json snapshots/latest.json
git add snapshots && git commit -q -m "snapshot $ID (preview)" && git push -q origin main && git log --format='%h %s' -1
echo "== manifest sha256"; shasum -a 256 "snapshots/$ID/manifest.json"
