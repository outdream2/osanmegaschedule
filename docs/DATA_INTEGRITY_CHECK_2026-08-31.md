# 데이터 정합성 스냅샷 · 2026-08-31

> #10 · 전체 프로젝트 데이터 정합성 확인 · 자동 검증

## 1. products 테이블 (샘플 1000 rows)

| 필드 | 값 있음 | 비율 |
|---|---|---|
| location | 650 | 65% |
| display_location | 649 | 65% |
| real_map | 428 | 43% |

**충돌 검사 · 3-way 정합성**
| 비교 | 충돌 수 |
|---|---|
| location ↔ display_location | **0** ✅ |
| location ↔ real_map | **0** ✅ |
| display_location ↔ real_map | **0** ✅ |

→ **완전 정합** · 값이 있는 경우 모두 동일 · 3개 필드가 같은 정보를 중복 저장

**결론**:
- 데이터는 안전 (기존 파생 컬럼 3중이지만 값 일치)
- real_map (43%) < location (65%) · 최근 데이터는 location 위주로 기록
- #13 real_map → location 통합 · **안전하게 진행 가능** (충돌 없음)

## 2. vendors 테이블 (156 rows)

- 접두어 있음 · 45건 (28.8%)
- "(주)" · "(유)" · "주식회사" · "유한회사"
- **matchesSupplierExact / displayVendorName** 정규화 필요
- 이미 통합 로직 존재 (lib/supplierMatch.ts)

## 3. zone_defs 테이블 (54 rows · 2026-08-30 정리 후)

- location 100% · zone 100% · category 대부분
- assignee 17건 (31%) · zone_assignments 에서 이관
- 카테고리 검색 프리미티브 (ZoneCategoryPicker) 사용 가능

## 4. 확인된 문제 · 조치 완료

- ✅ zone_defs · Set A/B 중복 (커밋 · 2026-08-30h SQL)
- ✅ zone_defs · assignee 컬럼 신규 + 이관
- ✅ vendors 정규화 · matchesSupplierQuery 확산
- ⚠ products · 3-way 필드 통합 · #13 진행중 (helper 있음 · 파일별 마이그레이션)

## 5. 다음 단계

- **#13 real_map → location 순차** · 47 파일 · 안전 (충돌 0 확인)
- purchase_details 12,933 rows vs orders · 별도 검증 필요 (매입-발주 일치)
- inventory 파생 컬럼 (창고1/2/매장1/2/3) 정합성 · 별도 검증
