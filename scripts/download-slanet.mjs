// scripts/download-slanet.mjs
// SLANet-plus.onnx (6.8MB) 다운로드 — 표 구조 검출 (한국 거래명세표용)
//
// 실행: node scripts/download-slanet.mjs
// 저장: server/models/slanet-plus.onnx + slanet-vocab.txt
//
// 출처: RapidAI/RapidTable (Apache 2.0)
//   1st: HuggingFace mirror
//   2nd: ModelScope 원본 (중국 서버, 미국·한국에서 느릴 수 있음)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = path.join(__dirname, "..", "server", "models");
if (!fs.existsSync(MODELS_DIR)) fs.mkdirSync(MODELS_DIR, { recursive: true });

// SLANet-plus 배포처 (2026-04 확인)
//   - HuggingFace: PaddlePaddle 공식 SLANet_plus 저장소
//   - ModelScope: RapidAI/RapidTable (커뮤니티 재배포)
// 두 곳 다 실패 시 수동 다운로드 안내
const TARGETS = [
  {
    name: "slanet-plus.onnx",
    urls: [
      "https://huggingface.co/PaddlePaddle/SLANet_plus/resolve/main/SLANet_plus.onnx",
      "https://huggingface.co/RapidAI/RapidTable/resolve/main/slanet-plus.onnx",
      "https://modelscope.cn/models/RapidAI/RapidTable/resolve/master/slanet-plus.onnx",
    ],
    expectedMinBytes: 5_000_000,
  },
  {
    name: "slanet-vocab.txt",
    urls: [
      "https://huggingface.co/PaddlePaddle/SLANet_plus/resolve/main/table_structure_dict.txt",
      "https://huggingface.co/RapidAI/RapidTable/resolve/main/dict.txt",
      "https://modelscope.cn/models/RapidAI/RapidTable/resolve/master/dict.txt",
    ],
    expectedMinBytes: 200,
  },
];

async function download({ name, urls, expectedMinBytes }) {
  const dst = path.join(MODELS_DIR, name);
  if (fs.existsSync(dst)) {
    const size = fs.statSync(dst).size;
    if (size >= expectedMinBytes) {
      console.log(`✓ ${name} 이미 존재 (${(size / 1024 / 1024).toFixed(2)} MB)`);
      return;
    }
    console.log(`! ${name} 이 손상됨 (크기 ${size}), 재다운로드`);
  }

  for (const url of urls) {
    try {
      console.log(`  다운로드 시도: ${url}`);
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) { console.log(`  실패 (${res.status}), 다음 URL 시도...`); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < expectedMinBytes) {
        console.log(`  파일 크기 부족 (${buf.length} < ${expectedMinBytes}), 다음 URL 시도...`);
        continue;
      }
      fs.writeFileSync(dst, buf);
      console.log(`✓ ${name} 저장 완료 (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);
      return;
    } catch (e) {
      console.log(`  네트워크 오류: ${e?.message ?? e}`);
    }
  }
  console.error(`✗ ${name} 다운로드 실패 — 모든 URL 실패`);
  console.error(`  수동 다운로드 안내:`);
  console.error(`    1) https://huggingface.co/RapidAI/RapidTable → files 탭 → ${name} 다운로드`);
  console.error(`    2) 또는 pip install huggingface_hub 후:`);
  console.error(`       huggingface-cli download RapidAI/RapidTable --local-dir server/models`);
  console.error(`    3) 저장 위치: ${MODELS_DIR}`);
  console.error(`  네트워크 사유일 수 있음. VPN/방화벽 확인 후 재시도 권장.`);
  process.exit(1);
}

console.log("SLANet-plus (표 구조 검출) 다운로드 시작");
console.log(`저장 위치: ${MODELS_DIR}`);
console.log("");

for (const t of TARGETS) await download(t);

console.log("");
console.log("완료. server/ocr/slanetTable.ts 에서 자동 로드됩니다.");
