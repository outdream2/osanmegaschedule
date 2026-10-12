# ERP → Supabase vendors upsert · 2026-10-07

**Mode**: DRY_RUN

## Summary

| 지표 | 값 |
|---|---|
| ERP vendors | 108 |
| Supabase vendors | 166 |
| ct_code 매칭 성공 → UPDATE | 0 |
| ct_code 매칭 없음 → INSERT (ERP 신규) | 1 |
| 매칭됐지만 변경 없음 | 107 |
| 수기 등록 (ERP 매칭 불가) · touch 안 함 | 59 |

## UPDATE sample (max 10)

_없음_

## INSERT sample (max 10)

| ct_code | company_name | business_number | phone | email | category |
|---|---|---|---|---|---|
| 1091 | 코리아헬스 | - | - | - | - |
