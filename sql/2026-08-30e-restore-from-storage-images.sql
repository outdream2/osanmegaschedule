아 -- 2026-08-30 · 사용자 지시 · storage1_description · storage2_description 이미지 참조 · 복원
-- src/sample/storage1_description.png · storage2_description1.png · storage2_description2.png
-- zone_defs.detailed_category 재입력

BEGIN;

-- ── 창고1 (storage1_description.png) ──
-- 24, 25, 26, 27 · 파스류
-- 7B · 한방제제
-- 8A · 경옥고 등
UPDATE zone_defs SET detailed_category = '파스 · 제일 / 녹십자 A / 한독(케토톱) A' WHERE zone = '벽면 24';
UPDATE zone_defs SET detailed_category = '파스 · 신신 / 지오영' WHERE zone = '벽면 25';
UPDATE zone_defs SET detailed_category = '뿌리는 파스 · 바르는 파스 · 지오영 A' WHERE zone = '벽면 26';
UPDATE zone_defs SET detailed_category = '파스 · 일동 A / 조아 B' WHERE zone = '벽면 27';
UPDATE zone_defs SET detailed_category = '한방제제모음 · 경방 C / 한풍 C / 광원 C / 한국신약 C / 한솔 C' WHERE zone = '진열대 7B';
UPDATE zone_defs SET detailed_category = '경옥고/공진단/태반/우황청심원/안정액/수면유도제 · 광동 A / 익수 C / 인풍 C / 원광(보화) C / 동화 / 한국신약 C / 일양 B / 경남 B / 녹십자·지오영' WHERE zone = '진열대 8A';

-- ── 창고2 왼쪽측면 (storage2_description1.png) ──
UPDATE zone_defs SET detailed_category = '의료기구 / 혈당체크 / 혈압계 / 체온계 · 보호대 / 스포츠테이핑 · 관절보호 · 모기물리기 전/후 (위탁)' WHERE zone = '벽면 28';
UPDATE zone_defs SET detailed_category = '반창고 / 거즈 / 붕대 · 응급 / 구급 / 소독약 / 살충제' WHERE zone = '벽면 29';
UPDATE zone_defs SET detailed_category = '화상 / 습윤밴드' WHERE zone = '벽면 30';
UPDATE zone_defs SET detailed_category = '염색약 / 제모기 / 립케어 / 생리대 / 생리컵 / 생' WHERE zone = '벽면 31';
UPDATE zone_defs SET detailed_category = '반려동물 용품 / 의약품 / 영양제 / 간식 / 사료 (위탁)' WHERE zone = '벽면 34';
UPDATE zone_defs SET detailed_category = '반려동물 용품 / 의약품 / 영양제 / 간식 / 사료 (위탁)' WHERE zone = '벽면 35';
UPDATE zone_defs SET detailed_category = '동물의약품 (위탁) · 기타건강식품' WHERE zone = '프로모션';  -- num=36 · 위탁+기타건강식품
UPDATE zone_defs SET detailed_category = '기타건강식품' WHERE zone = '기능성화장품';  -- num=37
UPDATE zone_defs SET detailed_category = '기타건강식품' WHERE zone = '조제실';  -- num=38
UPDATE zone_defs SET detailed_category = '브랜드관 (뉴케어) · 해외식품관' WHERE zone = '화장실';  -- num=39
UPDATE zone_defs SET detailed_category = '이벤트존 · 드림크냉장고 (창고1/창고2 공용)' WHERE zone = '계산대';  -- num=40

-- ── 창고2 화장품 (storage2_description2.png) ──
UPDATE zone_defs SET detailed_category = '기미 / 미백 / 잡티케어 · 여드름 / 트러블 케어 · 진정 / 민감케어 · 탄력 / 주름 케어 · 모공피부 / 케어' WHERE zone = '벽면 32';
UPDATE zone_defs SET detailed_category = '기초케어 · 클린징케어 · 마스크팩 / 집중팩 · 여행용화장품 / 메디아이프 약통 / 커터 / 복약' WHERE zone = '벽면 33';

-- 확인
SELECT cell_id, zone, category,
       LEFT(COALESCE(detailed_category, ''), 80) AS detail_preview,
       CASE WHEN detailed_category IS NOT NULL THEN '✅' ELSE '⚠️' END AS status
FROM zone_defs
ORDER BY cell_id;

-- 카운트
SELECT COUNT(*) AS total, COUNT(detailed_category) AS restored, COUNT(*) - COUNT(detailed_category) AS empty
FROM zone_defs;

COMMIT;
