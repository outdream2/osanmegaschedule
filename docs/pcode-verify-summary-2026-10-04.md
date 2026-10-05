# PCode 매핑 사전 검증 리포트 (2026-10-04)

## 📊 Counts

| | 수 | 비율 |
|---|---:|---:|
| ERP Product_List rows | 4,007 | 100.0% |
| ERP · duplicate BarCode | 0 | 0.0% |
| ERP · duplicate PCode | 0 | 0.0% |
| DB products rows | 7,079 | — |
| **BarCode match** | **3733** | 93.2% |
| ERP unmatched (ERP only · DB 미등록) | 274 | 6.8% |
| DB-only (ERP 에 없음) | 3,346 | 47.3% of DB |
| PCode 이미 동일 (SKIP) | 0 | — |
| PCode conflict (DB 에 다른 값 · SKIP) | 0 | — |
| **UPDATE 예정 rows** | **3,733** | — |

## 🧪 UPDATE 예정 rows 품질 검증

| 지표 | 결과 |
|---|---|
| ProductName 완전 일치 (DB == ERP) | 2,540 / 3,733 (68.0%) |
| ProductName 불일치 | 1,193 |
| PCode 범위 | 10001 ~ 15350 |
| PCode 숫자 open (ascending integer) | yes |

## 📁 산출 파일 (tmp/)

| 파일 | 설명 | row 수 |
|---|---|---:|
| pcode-verify-unmatched.csv | ERP 에만 있는 상품 (DB 미등록 · WRITE 대상 아님) | 274 |
| pcode-verify-update-sample.csv | UPDATE 예정 전수 (BarCode · PCode · 상품명 비교) | 3733 |
| pcode-verify-db-only.csv | DB 에만 있는 상품 샘플 (ERP 에 없음 · 500 상위) | 500 |
| pcode-verify-conflict.csv | DB.pcode 가 이미 다른 값인 경우 | 0 |

## ⚠️ WRITE 전 확인 포인트

1. **unmatched ERP 274 rows** · ERP 에만 있는 상품 → **UPDATE 안 됨 (INSERT 금지)** · 신규 상품이면 Supabase 수동 추가 필요
2. **DB-only 3346 rows** · ERP 에 없는 DB 상품 → **pcode NULL 유지** · ERP 매칭 불가능 상품 (삭제/legacy)
3. **PCode conflict 0** · 지금은 0 · 안전
4. **ProductName mismatch 1193 rows** · DB/ERP 상품명 다름 · 아마 BarCode 는 같은데 상품명 변경된 경우 → UPDATE 후 ERP sync 로 ProductName 도 반영될 예정 (별도 작업)

## ✅ WRITE 실행 조건

위 검증 결과 사용자 승인 후:
```
WRITE_FLAG=1 node scripts/fill-pcode-from-product-list-2026-10-04.mjs
```

생성일: 2026-10-04T02:41:55.372Z
