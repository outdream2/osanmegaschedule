// tools/iregen-decoder/Program.cs
// 2026-10-05 · System.Formats.Nrbf 기반 Iregen SOAP 응답 cross-platform decoder
//
// 설계:
//   · BinaryFormatter.Deserialize 사용 금지 (.NET 5+ obsolete / Linux 미지원)
//   · DataSet RemotingFormat.Binary 객체 복원 방식 사용 금지
//   · 대신 System.Formats.Nrbf.NrbfDecoder 로 NRBF payload 를 직접 파싱
//
// 호환성:
//   · 기존 tools/iregen-bridge/Program.cs 와 **output JSON contract 100% 동일**
//     - datasetName (string)
//     - tableCount (int)
//     - tables[] {
//         name (string)
//         rowCount (int)
//         columns[] { name, type, allowDBNull }
//         rows[] { "colName": value, ... }
//       }
//   · stdin 입력 · `-f <path>` 파일 입력 지원
//   · output/stdin-full.json (또는 output/<sourceName>-full.json) 파일 저장
//
// Target:
//   · .NET 8 cross-platform console app
//   · Self-contained Linux publish 가능 (Render 에 .NET runtime 불필요)
//
// Steps:
//   1 · XML parse → <...Result> element → base64 추출
//   2 · Base64 decode → compressed bytes
//   3 · DeflateStream decompress → serialized NRBF bytes
//   4 · NrbfDecoder.Decode(stream) → root ClassRecord (System.Data.DataSet)
//   5 · DataSet.Tables_N byte[] 재귀 Decode → DataTable 구조 복원
//   6 · DataTable_N.Records._items (object[]) → column-oriented data arrays
//   7 · column-oriented → row-oriented 변환 → JSON

using System.Formats.Nrbf;
using System.IO.Compression;
using System.Text;
using System.Text.Json;
using System.Xml.Linq;

namespace IregenDecoder;

internal static class Program
{
    public static int Main(string[] args)
    {
        try
        {
            string input;
            string sourceName;
            if (args.Length >= 2 && args[0] == "-f")
            {
                var path = args[1];
                if (!File.Exists(path)) { Console.Error.WriteLine($"[iregen-decoder] 파일 없음 · {path}"); return 1; }
                input = File.ReadAllText(path).Trim();
                sourceName = Path.GetFileNameWithoutExtension(path);
                Console.Error.WriteLine($"[iregen-decoder] 파일 입력 · {path}");
                Console.Error.WriteLine($"[iregen-decoder]   파일 크기 · {new FileInfo(path).Length} bytes");
                Console.Error.WriteLine($"[iregen-decoder]   읽은 문자 · {input.Length} chars");
            }
            else
            {
                Console.Error.WriteLine("[iregen-decoder] stdin 입력 대기");
                input = Console.In.ReadToEnd().Trim();
                sourceName = "stdin";
                Console.Error.WriteLine($"[iregen-decoder] stdin · {input.Length} chars");
            }
            if (string.IsNullOrWhiteSpace(input))
            {
                Console.Error.WriteLine("[iregen-decoder] 입력 비어 있음");
                return 1;
            }

            var baseDir = Environment.CurrentDirectory;
            var outputDir = Path.Combine(baseDir, "output");
            Directory.CreateDirectory(outputDir);
            var prefix = sourceName.Replace("inventory-response", "inventory").Replace("buy-response", "buy");

            // ─── STEP 1 · XML parse → <...Result> → base64 ─────────────
            Console.Error.WriteLine("\n[STEP 1] XML 무결성 검증");
            string base64;
            if (input.TrimStart().StartsWith("<"))
            {
                XDocument doc;
                try { doc = XDocument.Parse(input); Console.Error.WriteLine("  XML parse · OK"); }
                catch (Exception ex) { Console.Error.WriteLine($"  XML parse · 실패 · {ex.Message}"); return 10; }
                var resultEl = doc.Descendants().FirstOrDefault(e => e.Name.LocalName.EndsWith("Result"));
                if (resultEl is null) { Console.Error.WriteLine("  *Result element · 없음"); return 11; }
                base64 = resultEl.Value.Trim();
                Console.Error.WriteLine($"  <{resultEl.Name.LocalName}> · 발견 · base64 {base64.Length} chars");
            }
            else
            {
                base64 = input;
                Console.Error.WriteLine("  입력 · XML 아님 · raw base64 로 처리");
            }

            // ─── STEP 2 · Base64 decode ──────────────────────────────
            Console.Error.WriteLine("\n[STEP 2] Base64 decode");
            byte[] compressed;
            try { compressed = Convert.FromBase64String(base64); }
            catch (FormatException ex) { Console.Error.WriteLine($"  실패 · {ex.Message}"); return 20; }
            Console.Error.WriteLine($"  byte length · {compressed.Length}");

            // ─── STEP 3 · Deflate decompress ─────────────────────────
            Console.Error.WriteLine("\n[STEP 3] Deflate decompress");
            byte[] serialized;
            try
            {
                using var ms = new MemoryStream(compressed);
                using var dsStream = new DeflateStream(ms, CompressionMode.Decompress);
                using var outMs = new MemoryStream();
                dsStream.CopyTo(outMs);
                serialized = outMs.ToArray();
            }
            catch (Exception ex) { Console.Error.WriteLine($"  실패 · {ex.GetType().Name} · {ex.Message}"); return 30; }
            Console.Error.WriteLine($"  byte length · {serialized.Length}");

            // ─── STEP 4 · NrbfDecoder → DataSet root ───────────────────
            Console.Error.WriteLine("\n[STEP 4] NrbfDecoder.Decode (DataSet)");
            SerializationRecord dsRoot;
            try
            {
                using var nrbfMs = new MemoryStream(serialized);
                dsRoot = NrbfDecoder.Decode(nrbfMs);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"  실패 · {ex.GetType().FullName} · {ex.Message}");
                Console.Error.WriteLine(ex.StackTrace);
                return 40;
            }
            if (dsRoot is not ClassRecord ds || !(ds.TypeName.FullName?.Contains("DataSet") ?? false))
            {
                Console.Error.WriteLine($"  DataSet 아님 · {dsRoot.TypeName?.FullName}");
                return 41;
            }
            var datasetName = ds.GetString("DataSet.DataSetName") ?? "";
            var tablesCount = ds.GetInt32("DataSet.Tables.Count");
            Console.Error.WriteLine($"  DataSetName  · {datasetName}");
            Console.Error.WriteLine($"  Tables.Count · {tablesCount}");

            // ─── STEP 5·6·7 · Tables 재귀 decode + rows 복원 + JSON ────────
            Console.Error.WriteLine("\n[STEP 5] Tables 재귀 decode + Rows 복원");
            var fullJsonTables = new List<object>();
            for (int ti = 0; ti < tablesCount; ti++)
            {
                Console.Error.WriteLine($"\n  Table {ti + 1}");
                // DataSet.Tables_N 는 byte[] (nested NRBF payload)
                var tableBytes = ((ArrayRecord)ds.GetRawValue($"DataSet.Tables_{ti}")!).GetArray(typeof(byte[])) as byte[];
                if (tableBytes is null) { Console.Error.WriteLine($"    Tables_{ti} byte[] null"); continue; }

                using var tableMs = new MemoryStream(tableBytes);
                var dtRoot = NrbfDecoder.Decode(tableMs);
                if (dtRoot is not ClassRecord dt)
                {
                    Console.Error.WriteLine($"    DataTable 아님 · {dtRoot.TypeName?.FullName}");
                    continue;
                }
                var tableName = dt.GetString("DataTable.TableName") ?? "";
                var colCount = dt.GetInt32("DataTable.Columns.Count");
                var rowsCount = ds.GetInt32($"DataTable_{ti}.Rows.Count");
                Console.Error.WriteLine($"    TableName     · {tableName}");
                Console.Error.WriteLine($"    Columns.Count · {colCount}");
                Console.Error.WriteLine($"    Rows.Count    · {rowsCount}");

                // column metadata (name · allowDBNull)
                var colNames = new string[colCount];
                var colAllowNull = new bool[colCount];
                for (int c = 0; c < colCount; c++)
                {
                    colNames[c] = dt.GetString($"DataTable.DataColumn_{c}.ColumnName") ?? $"Col{c}";
                    colAllowNull[c] = dt.GetBoolean($"DataTable.DataColumn_{c}.AllowDBNull");
                }

                // Records._items (object[]) → column-oriented data
                var records = ds.GetRawValue($"DataTable_{ti}.Records") as ClassRecord;
                if (records is null) { Console.Error.WriteLine("    Records null"); continue; }
                var itemsArr = records.GetRawValue("_items") as ArrayRecord;
                if (itemsArr is null) { Console.Error.WriteLine("    Records._items null"); continue; }
                var items = itemsArr.GetArray(typeof(object[])) as object?[];
                var itemsSize = records.GetInt32("_size");

                var colData = new object?[colCount][];
                var colTypes = new string[colCount];
                for (int c = 0; c < colCount; c++)
                {
                    if (c >= itemsSize || items is null)
                    {
                        colData[c] = new object?[rowsCount];
                        colTypes[c] = "System.Object";
                        continue;
                    }
                    var colArr = items[c] as ArrayRecord;
                    if (colArr is null)
                    {
                        colData[c] = new object?[rowsCount];
                        colTypes[c] = "System.Object";
                        continue;
                    }
                    // ArrayRecord.TypeName.FullName = "System.String[]" / "System.Int32[]" / "System.Decimal[]" ...
                    var fullTypeName = colArr.TypeName.FullName ?? "";
                    var elementType = fullTypeName.EndsWith("[]") ? fullTypeName[..^2] : fullTypeName;
                    colTypes[c] = elementType;
                    colData[c] = ExtractColumnData(colArr, elementType, rowsCount);
                }

                // columns (JSON · { name, type, allowDBNull })
                var cols = new List<object>();
                for (int c = 0; c < colCount; c++)
                {
                    cols.Add(new
                    {
                        name = colNames[c],
                        type = colTypes[c],
                        allowDBNull = colAllowNull[c],
                    });
                }

                // column-oriented → row-oriented · 기존 decoder 와 동일하게 SafeValue 적용
                var allRows = new List<Dictionary<string, object?>>();
                for (int r = 0; r < rowsCount; r++)
                {
                    var row = new Dictionary<string, object?>();
                    for (int c = 0; c < colCount; c++)
                    {
                        var val = colData[c].Length > r ? colData[c][r] : null;
                        row[colNames[c]] = SafeValue(val);
                    }
                    allRows.Add(row);
                }

                fullJsonTables.Add(new
                {
                    name = tableName,
                    rowCount = rowsCount,
                    columns = cols,
                    rows = allRows,
                });
            }

            // ─── JSON output ───────────────────────────────────────
            var opts = new JsonSerializerOptions
            {
                WriteIndented = true,
                Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
            };
            var fullJsonObj = new
            {
                datasetName = datasetName,
                tableCount = tablesCount,
                tables = fullJsonTables,
            };
            var fullJson = JsonSerializer.Serialize(fullJsonObj, opts);

            // output 파일 · 기존 decoder 와 동일한 명명 규칙
            //   · stdin → output/stdin-full.json
            //   · file  → output/<basename>-full.json
            var fullJsonPath = Path.Combine(outputDir, prefix + "-full.json");
            File.WriteAllText(fullJsonPath, fullJson, new UTF8Encoding(false));
            Console.Error.WriteLine($"\n  전체 DataSet JSON · {fullJsonPath}");

            // stdout · schema 요약 (BrokenPipe 발생 가능 · caller 가 stdout 안읽을 수 있음)
            try
            {
                Console.OutputEncoding = Encoding.UTF8;
                Console.WriteLine(fullJson);
            }
            catch (IOException) { /* stdout pipe closed · 파일은 이미 저장됨 */ }
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[iregen-decoder FATAL] {ex.GetType().FullName} · {ex.Message}");
            Console.Error.WriteLine(ex.StackTrace);
            return 99;
        }
    }

    // ArrayRecord → native array · element type 별 분기 (DataSet.RemotingFormat.Binary 가 사용하는 타입만 지원)
    private static object?[] ExtractColumnData(ArrayRecord colArr, string elementType, int rowsCount)
    {
        var result = new object?[rowsCount];
        try
        {
            switch (elementType)
            {
                case "System.String":
                {
                    var src = colArr.GetArray(typeof(string[])) as string[];
                    for (int i = 0; i < rowsCount && src is not null && i < src.Length; i++) result[i] = src[i];
                    break;
                }
                case "System.Int32":
                {
                    var src = colArr.GetArray(typeof(int[])) as int[];
                    for (int i = 0; i < rowsCount && src is not null && i < src.Length; i++) result[i] = src[i];
                    break;
                }
                case "System.Int64":
                {
                    var src = colArr.GetArray(typeof(long[])) as long[];
                    for (int i = 0; i < rowsCount && src is not null && i < src.Length; i++) result[i] = src[i];
                    break;
                }
                case "System.Int16":
                {
                    var src = colArr.GetArray(typeof(short[])) as short[];
                    for (int i = 0; i < rowsCount && src is not null && i < src.Length; i++) result[i] = src[i];
                    break;
                }
                case "System.Decimal":
                {
                    var src = colArr.GetArray(typeof(decimal[])) as decimal[];
                    for (int i = 0; i < rowsCount && src is not null && i < src.Length; i++) result[i] = src[i];
                    break;
                }
                case "System.Double":
                {
                    var src = colArr.GetArray(typeof(double[])) as double[];
                    for (int i = 0; i < rowsCount && src is not null && i < src.Length; i++) result[i] = src[i];
                    break;
                }
                case "System.Single":
                {
                    var src = colArr.GetArray(typeof(float[])) as float[];
                    for (int i = 0; i < rowsCount && src is not null && i < src.Length; i++) result[i] = src[i];
                    break;
                }
                case "System.Boolean":
                {
                    var src = colArr.GetArray(typeof(bool[])) as bool[];
                    for (int i = 0; i < rowsCount && src is not null && i < src.Length; i++) result[i] = src[i];
                    break;
                }
                case "System.DateTime":
                {
                    var src = colArr.GetArray(typeof(DateTime[])) as DateTime[];
                    for (int i = 0; i < rowsCount && src is not null && i < src.Length; i++) result[i] = src[i];
                    break;
                }
                case "System.Byte":
                {
                    var src = colArr.GetArray(typeof(byte[])) as byte[];
                    for (int i = 0; i < rowsCount && src is not null && i < src.Length; i++) result[i] = src[i];
                    break;
                }
                default:
                    Console.Error.WriteLine($"    [WARN] 타입 '{elementType}' 미지원 · null fill");
                    break;
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"    [ERR] column extract · {elementType} · {ex.Message}");
        }
        return result;
    }

    // 기존 Windows decoder 의 SafeValue 와 동일 변환
    //   · 모든 numeric 값은 ToString() → string 으로 저장 (서버 parseErpNum 과 호환)
    //   · null / DBNull → null
    //   · DateTime → ISO 8601 ("O")
    //   · byte[] → base64
    private static object? SafeValue(object? v)
    {
        if (v is null) return null;
        if (v is string s) return s;
        if (v is DateTime dt) return dt.ToString("O");
        if (v is byte[] b) return Convert.ToBase64String(b);
        return v.ToString();
    }
}
