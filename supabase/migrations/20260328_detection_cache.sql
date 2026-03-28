-- 알트코인 탐지 스캔 결과 캐시 테이블
-- 1시간마다 자동 스캔 결과 저장, 30일 보존

CREATE TABLE IF NOT EXISTS detection_cache (
  id BIGSERIAL PRIMARY KEY,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_scanned INT NOT NULL,
  detected INT NOT NULL,
  results JSONB NOT NULL,
  scan_duration_ms INT,
  created_by TEXT DEFAULT 'system'
);

-- 인덱스: 최신 결과 빠른 조회
CREATE INDEX idx_detection_cache_scanned_at ON detection_cache (scanned_at DESC);

-- RLS: 공개 읽기 허용
ALTER TABLE detection_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_detection_cache" ON detection_cache
  FOR SELECT USING (true);
