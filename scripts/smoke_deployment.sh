#!/bin/sh
# Build and exercise an isolated deployment with synthetic media and demo judging.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
test_dir=$(mktemp -d)
project="larple-smoke-$$"
port=${LARPLE_SMOKE_PORT:-18080}
compose() {
  docker compose -p "$project" --env-file "$test_dir/.env" -f "$root/compose.production.yaml" "$@"
}
cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    compose logs --tail=80 || true
  fi
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$test_dir"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT TERM
cat > "$test_dir/.env" <<ENV
SITE_ADDRESS=:80
LARP_GEMINI_API_KEY=unused-demo-test-key
LARP_GEMINI_MODEL=gemini-3.8-flash
LARP_INVITE_CODE=smoke-test-invite
LARP_JUDGE_MODE=demo
HTTP_BIND=127.0.0.1
HTTPS_BIND=127.0.0.1
HTTP_PORT=$port
HTTPS_PORT=18443
ENV
compose up --build --detach --wait --wait-timeout 180
compose exec -T api ffmpeg -hide_banner -loglevel error \
  -f lavfi -i color=c=navy:s=320x240:r=15 -f lavfi -i sine=frequency=440 \
  -t 1 -c:v libvpx -c:a libopus -f webm pipe:1 > "$test_dir/clip.webm"
python3 "$root/scripts/smoke_deployment.py" "http://127.0.0.1:$port" "$test_dir/clip.webm"
compose restart api worker
compose up --detach --wait --wait-timeout 60
python3 "$root/scripts/smoke_deployment.py" "http://127.0.0.1:$port" --check-persistence
# Explicit image COPY rules must exclude local secrets and local-only configuration.
compose exec -T api sh -c 'test ! -e /srv/backend/.env && test ! -e /srv/backend/.venv'
compose exec -T web sh -c 'test ! -e /srv/.env && test ! -e /srv/.env.local'
echo 'Deployment smoke test passed, including persistence after restart.'
