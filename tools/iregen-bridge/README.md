# iregen-decoder · Iregen SOAP 응답 디코더 (C#)

**목적** · Iregen ERP SOAP (`Inventory_StatusResult` 등) 응답을 복원하여 Table 구조·샘플 row 를 JSON 으로 출력.

## 디코딩 flow (ILSpy 확정)
```
<Inventory_StatusResult>7Z1Nj...</Inventory_StatusResult>
  ↓ (XML 래퍼 추출)
Base64 string
  ↓ Convert.FromBase64String
compressed bytes
  ↓ DeflateStream (CompressionMode.Decompress)
serialized bytes (BinaryFormatter payload)
  ↓ BinaryFormatter.Deserialize
System.Data.DataSet
  ↓ 샘플 row + 컬럼 추출
JSON
```

## 전제 조건

### .NET 8 SDK 설치
```powershell
# https://dotnet.microsoft.com/download
dotnet --version
# 8.0.x 확인
```

## 빌드

```powershell
cd D:\antigravity_projects\megatown-staff-scheduler\tools\iregen-bridge
dotnet build
```

## 실행

### 방법 1 · base64 파일 입력
Fiddler 응답 세션 → Response Body → 저장 (.b64 or .txt) · `<Inventory_StatusResult>...</>` 전체 저장 OK (XML 래퍼 자동 추출).

```powershell
dotnet run -- -f sample.b64
```

### 방법 2 · stdin 파이프
```powershell
type sample.b64 | dotnet run
```

## 출력 예시 (성공 시)

```json
{
  "datasetName": "NewDataSet",
  "tableCount": 1,
  "tables": [
    {
      "name": "Table",
      "rowCount": 157,
      "columns": [
        { "name": "ProductCode", "type": "String" },
        { "name": "ProductName", "type": "String" },
        { "name": "NowStock", "type": "Int32" },
        { "name": "UnitSale", "type": "Decimal" }
      ],
      "sampleRows": [
        {
          "ProductCode": "10001",
          "ProductName": "타이레놀 500mg 10정",
          "NowStock": "25",
          "UnitSale": "5000"
        }
      ]
    }
  ]
}
```

## stderr 로그 (진행 상황)

```
[iregen-decoder] 파일 입력 · sample.b64 · 311760 chars
[iregen-decoder] XML 래퍼 추출 · 내부 311720 chars
[iregen-decoder] base64 decode OK · 233790 bytes
[iregen-decoder] 매직 bytes · ED-DD-07-5C-14-69-F2
[iregen-decoder] decompress OK · 850432 bytes
[iregen-decoder] 압축해제 매직 bytes · 00-01-00-00-00-FF-FF-FF
[iregen-decoder] DataSet 복원 OK · DataSetName=NewDataSet · 테이블 1개
```

## 실패 시 Exit Code

| Code | 의미 |
|---:|---|
| 0 | 성공 |
| 1 | 입력 없음 or 파일 없음 |
| 2 | base64 decode 실패 |
| 3 | DeflateStream + GZipStream 둘 다 실패 |
| 4 | Deserialize 결과 · DataSet 아닌 다른 타입 |
| 5 | BinaryFormatter.Deserialize 예외 |
| 99 | 예상 못한 fatal |

## 보안 주의

- `BinaryFormatter` · .NET 5+ obsolete · gadget chain / RCE 위험
- **Iregen 응답 전용** · 외부 untrusted 입력 금지
- 서버 배포 시 · 인증된 소스만 호출

## 다음 단계 (테스트 성공 후)

1. **자동 SOAP 호출** · C# HttpClient · SOAP XML 생성 · Iregen 호출
2. **주기 Supabase 동기화** · GitHub Actions cron or Render Worker
3. **운영 환경 결정**:
   - GitHub Actions (매일 1회 · 서버리스 · 무료)
   - Render Docker (통합 · $7/월)
   - 매장 PC Task Scheduler (로컬 · 무료 · PC 켜져 있어야)

## 샘플 데이터 저장 위치 (gitignore 됨)

```
tools/iregen-bridge/samples/*.b64   ← Fiddler 응답 저장
```
