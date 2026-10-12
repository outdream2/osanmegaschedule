// Program.cs
// 2026-10-03 · Iregen SOAP 응답 디코더 · STEP 1 재실행
//
// Iregen 원본 ServiceCommon.DecompressDataSet() 완전 재현 (dnSpy 확인)
//   public DataSet DecompressDataSet(byte[] bytDs) {
//     DataSet dataSet = new DataSet();
//     MemoryStream memoryStream = new MemoryStream(bytDs);
//     memoryStream.Seek(0L, SeekOrigin.Begin);
//     DeflateStream deflateStream = new DeflateStream(memoryStream, CompressionMode.Decompress, true);
//     byte[] buffer = this.ReadFullStream(deflateStream);
//     deflateStream.Flush();
//     deflateStream.Close();
//     MemoryStream memoryStream2 = new MemoryStream(buffer);
//     memoryStream2.Seek(0L, SeekOrigin.Begin);
//     dataSet.RemotingFormat = SerializationFormat.Binary;
//     return (DataSet)new BinaryFormatter().Deserialize(memoryStream2, null);
//   }
//
// 금지 (사용자 지시):
//   - AES/XOR 시도
//   - GZip 변경
//   - header skip
//   - byte 제거/추가
//   - UTF-8 JSON/XML 가정
//   - padding 보정
//
// 보안: Iregen 응답 전용 · 외부 입력 금지

using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Formatters.Binary;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Xml.Linq;

namespace IregenBridge
{
    internal static class Program
    {
        public static int Main(string[] args)
        {
            try
            {
                // ─── 입력 처리 ─────────────────────────────────────
                string input;
                string sourceName;
                if (args.Length >= 2 && args[0] == "-f")
                {
                    var path = args[1];
                    if (!File.Exists(path))
                    {
                        Console.Error.WriteLine("[iregen-decoder] 파일 없음 · " + path);
                        return 1;
                    }
                    input = File.ReadAllText(path).Trim();
                    sourceName = Path.GetFileNameWithoutExtension(path);
                    Console.Error.WriteLine("[iregen-decoder] 파일 입력 · " + path);
                    Console.Error.WriteLine("[iregen-decoder]   파일 크기 · " + new FileInfo(path).Length + " bytes");
                    Console.Error.WriteLine("[iregen-decoder]   읽은 문자 · " + input.Length + " chars");
                }
                else
                {
                    Console.Error.WriteLine("[iregen-decoder] stdin 입력 대기 (Ctrl+Z Enter 종료)");
                    input = Console.In.ReadToEnd().Trim();
                    sourceName = "stdin";
                    Console.Error.WriteLine("[iregen-decoder] stdin · " + input.Length + " chars");
                }

                if (string.IsNullOrWhiteSpace(input))
                {
                    Console.Error.WriteLine("[iregen-decoder] 입력 비어 있음");
                    return 1;
                }

                // debug · output 디렉토리
                var baseDir = Environment.CurrentDirectory;
                var debugDir = Path.Combine(baseDir, "debug");
                var outputDir = Path.Combine(baseDir, "output");
                Directory.CreateDirectory(debugDir);
                Directory.CreateDirectory(outputDir);
                var prefix = sourceName.Replace("inventory-response", "inventory").Replace("buy-response", "buy");

                // ─── 1. XML 무결성 검증 ─────────────────────────────
                Console.Error.WriteLine();
                Console.Error.WriteLine("[STEP 1] XML 무결성 검증");

                string base64;
                string resultElementName;
                if (input.TrimStart().StartsWith("<"))
                {
                    XDocument doc;
                    try
                    {
                        doc = XDocument.Parse(input);
                        Console.Error.WriteLine("  XML parse · OK");
                    }
                    catch (Exception ex)
                    {
                        Console.Error.WriteLine("  XML parse · 실패 · " + ex.Message);
                        return 10;
                    }

                    var resultEl = doc.Descendants().FirstOrDefault(e => e.Name.LocalName.EndsWith("Result"));
                    if (resultEl == null)
                    {
                        Console.Error.WriteLine("  *Result element · 없음");
                        return 11;
                    }
                    resultElementName = resultEl.Name.LocalName;
                    base64 = resultEl.Value.Trim();
                    Console.Error.WriteLine("  <" + resultElementName + "> · 발견");
                    Console.Error.WriteLine("  Base64 추출 · " + base64.Length + " chars");

                    // 닫는 태그 확인
                    bool hasResultClose = input.Contains("</" + resultElementName + ">");
                    bool hasEnvelopeClose = input.Contains("</soap:Envelope>") || input.Contains("</Envelope>");
                    Console.Error.WriteLine("  </" + resultElementName + "> · " + (hasResultClose ? "OK" : "없음"));
                    Console.Error.WriteLine("  </soap:Envelope> · " + (hasEnvelopeClose ? "OK" : "없음"));
                    if (!hasResultClose || !hasEnvelopeClose)
                    {
                        Console.Error.WriteLine("  무결성 실패 · 중단");
                        return 12;
                    }
                }
                else
                {
                    base64 = input;
                    resultElementName = "raw";
                    Console.Error.WriteLine("  입력 · XML 아님 · raw base64 로 처리");
                }

                // Save debug · base64
                var base64Path = Path.Combine(debugDir, prefix + "-base64.txt");
                File.WriteAllText(base64Path, base64);
                Console.Error.WriteLine("  → " + base64Path);

                // ─── 2. Base64 decode ─────────────────────────────
                Console.Error.WriteLine();
                Console.Error.WriteLine("[STEP 2] Base64 decode");

                byte[] compressed;
                try
                {
                    compressed = Convert.FromBase64String(base64);
                }
                catch (FormatException ex)
                {
                    Console.Error.WriteLine("  실패 · " + ex.Message);
                    return 20;
                }

                var compressedPath = Path.Combine(debugDir, prefix + "-compressed.bin");
                File.WriteAllBytes(compressedPath, compressed);
                Console.Error.WriteLine("  byte length · " + compressed.Length);
                Console.Error.WriteLine("  SHA-256     · " + Sha256(compressed));
                Console.Error.WriteLine("  first 64    · " + HexBytes(compressed, 0, Math.Min(64, compressed.Length)));
                Console.Error.WriteLine("  last 64     · " + HexBytes(compressed, Math.Max(0, compressed.Length - 64), Math.Min(64, compressed.Length)));
                Console.Error.WriteLine("  → " + compressedPath);

                // ─── 3. DeflateStream decompress (원본 재현) ──────
                Console.Error.WriteLine();
                Console.Error.WriteLine("[STEP 3] Deflate decompress (ServiceCommon.DecompressDataSet 재현)");

                byte[] serialized;
                try
                {
                    using (var memoryStream = new MemoryStream(compressed))
                    {
                        memoryStream.Seek(0L, SeekOrigin.Begin);
                        using (var deflateStream = new DeflateStream(memoryStream, CompressionMode.Decompress, leaveOpen: true))
                        {
                            serialized = ReadFullStream(deflateStream);
                            deflateStream.Flush();
                        }
                    }
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine("  실패 · " + ex.GetType().FullName + " · " + ex.Message);
                    Console.Error.WriteLine(ex.StackTrace);
                    return 30;
                }

                var decompressedPath = Path.Combine(debugDir, prefix + "-decompressed.bin");
                File.WriteAllBytes(decompressedPath, serialized);
                Console.Error.WriteLine("  byte length · " + serialized.Length);
                Console.Error.WriteLine("  SHA-256     · " + Sha256(serialized));
                Console.Error.WriteLine("  first 64    · " + HexBytes(serialized, 0, Math.Min(64, serialized.Length)));
                Console.Error.WriteLine("  last 64     · " + HexBytes(serialized, Math.Max(0, serialized.Length - 64), Math.Min(64, serialized.Length)));
                Console.Error.WriteLine("  → " + decompressedPath);

                // ─── 4. BinaryFormatter.Deserialize (원본 재현) ────
                Console.Error.WriteLine();
                Console.Error.WriteLine("[STEP 4] BinaryFormatter.Deserialize");

                object obj;
                try
                {
                    using (var memoryStream2 = new MemoryStream(serialized))
                    {
                        memoryStream2.Seek(0L, SeekOrigin.Begin);
                        var dataSet = new DataSet();
                        dataSet.RemotingFormat = SerializationFormat.Binary;
                        var formatter = new BinaryFormatter();
                        obj = formatter.Deserialize(memoryStream2, null);
                    }
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine("  실패");
                    Console.Error.WriteLine("  Exception type · " + ex.GetType().FullName);
                    Console.Error.WriteLine("  Message        · " + ex.Message);
                    if (ex.InnerException != null)
                    {
                        Console.Error.WriteLine("  InnerException · " + ex.InnerException.GetType().FullName + " · " + ex.InnerException.Message);
                    }
                    Console.Error.WriteLine("  StackTrace:");
                    Console.Error.WriteLine(ex.StackTrace);
                    return 40;
                }

                Console.Error.WriteLine("  Object Type · " + obj.GetType().FullName);

                if (!(obj is DataSet))
                {
                    Console.Error.WriteLine("  DataSet 아님 · 중단");
                    return 41;
                }

                var ds = (DataSet)obj;
                Console.Error.WriteLine("  DataSetName · " + ds.DataSetName);
                Console.Error.WriteLine("  Tables.Count · " + ds.Tables.Count);

                // ─── 5. Schema 분석 + 전체 JSON 저장 ──────────────
                Console.Error.WriteLine();
                Console.Error.WriteLine("[STEP 5] Schema 분석");

                var schemaReport = new List<object>();
                var fullJsonTables = new List<object>();
                int ti = 0;
                foreach (DataTable t in ds.Tables)
                {
                    ti++;
                    Console.Error.WriteLine();
                    Console.Error.WriteLine("  Table " + ti + " · " + t.TableName);
                    Console.Error.WriteLine("    Rows.Count    · " + t.Rows.Count);
                    Console.Error.WriteLine("    Columns.Count · " + t.Columns.Count);
                    Console.Error.WriteLine("    Columns:");
                    var cols = new List<object>();
                    foreach (DataColumn c in t.Columns)
                    {
                        Console.Error.WriteLine("      · " + c.ColumnName + " : " + c.DataType.Name + " (AllowDBNull=" + c.AllowDBNull + ")");
                        cols.Add(new { name = c.ColumnName, type = c.DataType.FullName, allowDBNull = c.AllowDBNull });
                    }

                    // 콘솔 · 첫 5 row
                    var sampleRows = new List<Dictionary<string, object>>();
                    int rowLimit = Math.Min(5, t.Rows.Count);
                    for (int r = 0; r < rowLimit; r++)
                    {
                        var row = new Dictionary<string, object>();
                        foreach (DataColumn c in t.Columns)
                        {
                            var v = t.Rows[r][c];
                            row[c.ColumnName] = v == DBNull.Value ? null : SafeValue(v);
                        }
                        sampleRows.Add(row);
                    }

                    schemaReport.Add(new
                    {
                        tableName = t.TableName,
                        rowCount = t.Rows.Count,
                        columnCount = t.Columns.Count,
                        columns = cols,
                        sampleRows = sampleRows,
                    });

                    // output JSON · 전체 row
                    var allRows = new List<Dictionary<string, object>>();
                    foreach (DataRow r in t.Rows)
                    {
                        var row = new Dictionary<string, object>();
                        foreach (DataColumn c in t.Columns)
                        {
                            var v = r[c];
                            row[c.ColumnName] = v == DBNull.Value ? null : SafeValue(v);
                        }
                        allRows.Add(row);
                    }
                    fullJsonTables.Add(new
                    {
                        name = t.TableName,
                        rowCount = t.Rows.Count,
                        columns = cols,
                        rows = allRows,
                    });
                }

                // 전체 DataSet JSON 저장
                var fullJsonPath = Path.Combine(outputDir, prefix + "-full.json");
                var opts = new JsonSerializerOptions
                {
                    WriteIndented = true,
                    Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
                };
                var fullJson = JsonSerializer.Serialize(new
                {
                    datasetName = ds.DataSetName,
                    tableCount = ds.Tables.Count,
                    tables = fullJsonTables,
                }, opts);
                File.WriteAllText(fullJsonPath, fullJson, new UTF8Encoding(false));
                Console.Error.WriteLine();
                Console.Error.WriteLine("  전체 DataSet JSON · " + fullJsonPath);

                // stdout · schema 요약 (JSON)
                var summary = new
                {
                    source = sourceName,
                    datasetName = ds.DataSetName,
                    tableCount = ds.Tables.Count,
                    tables = schemaReport,
                };
                Console.OutputEncoding = Encoding.UTF8;
                Console.WriteLine(JsonSerializer.Serialize(summary, opts));
                return 0;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("[iregen-decoder FATAL] " + ex.GetType().FullName + " · " + ex.Message);
                Console.Error.WriteLine(ex.StackTrace);
                return 99;
            }
        }

        // Iregen 원본 ReadFullStream 재현 · 4KB buffer · ms append
        private static byte[] ReadFullStream(Stream stream)
        {
            var buffer = new byte[4096];
            using (var ms = new MemoryStream())
            {
                int read;
                while ((read = stream.Read(buffer, 0, buffer.Length)) > 0)
                {
                    ms.Write(buffer, 0, read);
                }
                return ms.ToArray();
            }
        }

        private static object SafeValue(object v)
        {
            if (v == null || v == DBNull.Value) return null;
            if (v is string s) return s;
            if (v is DateTime dt) return dt.ToString("O");
            if (v is byte[] b) return Convert.ToBase64String(b);
            return v.ToString();
        }

        private static string Sha256(byte[] data)
        {
            using (var sha = SHA256.Create())
            {
                var hash = sha.ComputeHash(data);
                return BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();
            }
        }

        private static string HexBytes(byte[] data, int offset, int length)
        {
            if (length <= 0) return "";
            return BitConverter.ToString(data, offset, length);
        }
    }
}
