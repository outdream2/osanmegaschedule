# VENDOR ANOMALIES · ERP ↔ Supabase 비교 (2026-10-07)

## 요약

총 2 건 anomaly 발견. 각 case 사용자 수동 검토.

| 코드 | 패턴 | 건수 |
|---|---|---:|
| E | ERP 쪽 중복 CtCode (같은 이름) | 1 |
| G | ERP CtCode 가 DB 미매핑 | 1 |

---

## [E] ERP 쪽 중복 CtCode (같은 이름) (1)

| DB id | DB name | DB bizno | ERP CtCode | ERP name | ERP bizno | 참고 |
|---|---|---|---|---|---|---|
| - | - | - | 1034, 1091 | 코리아헬스 | - | ERP 쪽 중복 등록 (2 CtCode 동일 이름) · DB 매핑: 131, none |

## [G] ERP CtCode 가 DB 미매핑 (1)

| DB id | DB name | DB bizno | ERP CtCode | ERP name | ERP bizno | 참고 |
|---|---|---|---|---|---|---|
| - | - | - | 1091 | 코리아헬스 | - | ERP CtCode 가 DB 어디에도 매핑 안 됨 |

