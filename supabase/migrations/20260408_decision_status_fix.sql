-- decision_status enum에 approved, rejected 값 추가
-- approve/reject API 라우트에서 사용하는 상태값

ALTER TYPE decision_status ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE decision_status ADD VALUE IF NOT EXISTS 'rejected';

-- live_positions에 exit_price 컬럼 추가
-- 포트폴리오 거래 내역 API에서 청산 가격 표시용

ALTER TABLE live_positions ADD COLUMN IF NOT EXISTS exit_price numeric;
