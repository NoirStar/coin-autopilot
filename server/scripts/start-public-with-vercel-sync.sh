#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared가 설치되어 있지 않습니다."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node가 설치되어 있지 않습니다."
  exit 1
fi

: "${VERCEL_TOKEN:?VERCEL_TOKEN 환경변수가 필요합니다}"
: "${VERCEL_PROJECT_ID:?VERCEL_PROJECT_ID 환경변수가 필요합니다}"

VERCEL_ENV="${VERCEL_ENV:-production}"
VERCEL_VAR_NAME="${VERCEL_VAR_NAME:-VITE_API_URL}"
VERCEL_TEAM_ID="${VERCEL_TEAM_ID:-}"

SERVER_LOG="/tmp/coin-autopilot-server.log"
TUNNEL_LOG="/tmp/coin-autopilot-cloudflared.log"

TEAM_QUERY=""
if [[ -n "$VERCEL_TEAM_ID" ]]; then
  TEAM_QUERY="teamId=$VERCEL_TEAM_ID"
fi

append_query() {
  local base="$1"
  local query="$2"
  if [[ -z "$query" ]]; then
    printf '%s' "$base"
  elif [[ "$base" == *"?"* ]]; then
    printf '%s&%s' "$base" "$query"
  else
    printf '%s?%s' "$base" "$query"
  fi
}

cleanup() {
  if [[ -n "${TUNNEL_PID:-}" ]] && kill -0 "$TUNNEL_PID" 2>/dev/null; then
    kill "$TUNNEL_PID" 2>/dev/null || true
  fi
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "[1/5] 서버 시작"
: > "$SERVER_LOG"
npx tsx --env-file=.env src/index.ts >> "$SERVER_LOG" 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3001/health >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS http://127.0.0.1:3001/health >/dev/null 2>&1; then
  echo "서버 시작 실패. 로그: $SERVER_LOG"
  exit 1
fi

echo "[2/5] Quick Tunnel 시작"
: > "$TUNNEL_LOG"
cloudflared tunnel --url http://localhost:3001 --no-autoupdate >> "$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

TUNNEL_URL=""
for _ in $(seq 1 60); do
  TUNNEL_URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | tail -n 1 || true)
  if [[ -n "$TUNNEL_URL" ]]; then
    break
  fi
  sleep 1
done

if [[ -z "$TUNNEL_URL" ]]; then
  echo "터널 URL 추출 실패. 로그: $TUNNEL_LOG"
  exit 1
fi

echo "[3/5] 기존 Vercel env 정리"
LIST_URL="https://api.vercel.com/v9/projects/$VERCEL_PROJECT_ID/env"
LIST_URL="$(append_query "$LIST_URL" "$TEAM_QUERY")"
ENV_LIST_JSON=$(curl -fsS -H "Authorization: Bearer $VERCEL_TOKEN" "$LIST_URL")

export VERCEL_VAR_NAME VERCEL_ENV
ENV_IDS=$(printf '%s' "$ENV_LIST_JSON" | node -e "
let data = '';
process.stdin.on('data', (c) => data += c);
process.stdin.on('end', () => {
  const parsed = JSON.parse(data);
  const envs = Array.isArray(parsed.envs) ? parsed.envs : [];
  const ids = envs
    .filter((e) => e.key === process.env.VERCEL_VAR_NAME)
    .filter((e) => {
      const target = Array.isArray(e.target) ? e.target : [];
      return target.includes(process.env.VERCEL_ENV);
    })
    .map((e) => e.id)
    .filter(Boolean);
  process.stdout.write(ids.join('\n'));
});
")

if [[ -n "$ENV_IDS" ]]; then
  while IFS= read -r env_id; do
    [[ -z "$env_id" ]] && continue
    DELETE_URL="https://api.vercel.com/v9/projects/$VERCEL_PROJECT_ID/env/$env_id"
    DELETE_URL="$(append_query "$DELETE_URL" "$TEAM_QUERY")"
    curl -fsS -X DELETE -H "Authorization: Bearer $VERCEL_TOKEN" "$DELETE_URL" >/dev/null
  done <<< "$ENV_IDS"
fi

echo "[4/5] 새 Vercel env 반영: $VERCEL_VAR_NAME=$TUNNEL_URL"
CREATE_URL="https://api.vercel.com/v10/projects/$VERCEL_PROJECT_ID/env"
CREATE_URL="$(append_query "$CREATE_URL" "$TEAM_QUERY")"
PAYLOAD=$(cat <<JSON
{
  "key": "$VERCEL_VAR_NAME",
  "value": "$TUNNEL_URL",
  "target": ["$VERCEL_ENV"],
  "type": "plain"
}
JSON
)

curl -fsS -X POST \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  --data "$PAYLOAD" \
  "$CREATE_URL" >/dev/null

echo "[5/5] 완료"
echo "- Tunnel URL: $TUNNEL_URL"
echo "- Server log: $SERVER_LOG"
echo "- Tunnel log: $TUNNEL_LOG"
echo "- Ctrl+C로 서버/터널 종료"

wait "$SERVER_PID"
