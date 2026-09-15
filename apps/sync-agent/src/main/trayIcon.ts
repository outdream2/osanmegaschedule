// apps/sync-agent/src/main/trayIcon.ts
// 2026-09-15 · Phase 3 · 트레이 아이콘 · 상태별 색상 · 코드로 생성 (PNG)
//   · idle · syncing · success · error · 4-state
//   · index.ts createTrayIconBuffer 를 확장 · 색상 매개변수 받음

import zlib from "zlib";

export interface Rgb { r: number; g: number; b: number }

/** 다운로드 화살표 심볼 · 32x32 · 색상 지정 가능 */
export function generateTrayIcon(bgColor: Rgb, arrowColor: Rgb = { r: 255, g: 255, b: 255 }): Buffer {
  const width = 32;
  const height = 32;
  const rowSize = 1 + width * 4;
  const raw = Buffer.alloc(rowSize * height);

  //  01234567890123456789012345678901
  const pattern = [
    "................................", // 0
    "................................", // 1
    "................................", // 2
    "................................", // 3
    "................................", // 4
    "............XXXXXXXX............", // 5
    "............XXXXXXXX............", // 6
    "............XXXXXXXX............", // 7
    "............XXXXXXXX............", // 8
    "............XXXXXXXX............", // 9
    "............XXXXXXXX............", // 10
    "............XXXXXXXX............", // 11
    "............XXXXXXXX............", // 12
    "............XXXXXXXX............", // 13
    "............XXXXXXXX............", // 14
    "............XXXXXXXX............", // 15
    "....XXXXXXXXXXXXXXXXXXXXXXXX....", // 16
    ".....XXXXXXXXXXXXXXXXXXXXXX.....", // 17
    "......XXXXXXXXXXXXXXXXXXXX......", // 18
    ".......XXXXXXXXXXXXXXXXXX.......", // 19
    "........XXXXXXXXXXXXXXXX........", // 20
    ".........XXXXXXXXXXXXXX.........", // 21
    "..........XXXXXXXXXXXX..........", // 22
    "...........XXXXXXXXXX...........", // 23
    "............XXXXXXXX............", // 24
    ".............XXXXXX.............", // 25
    "..............XXXX..............", // 26
    "...............XX...............", // 27
    "................................", // 28
    "................................", // 29
    "................................", // 30
    "................................", // 31
  ];

  for (let y = 0; y < height; y++) {
    raw[y * rowSize] = 0;
    for (let x = 0; x < width; x++) {
      const off = y * rowSize + 1 + x * 4;
      const isArrow = pattern[y]?.[x] === "X";
      if (isArrow) {
        raw[off]     = arrowColor.r;
        raw[off + 1] = arrowColor.g;
        raw[off + 2] = arrowColor.b;
        raw[off + 3] = 255;
      } else {
        raw[off]     = bgColor.r;
        raw[off + 1] = bgColor.g;
        raw[off + 2] = bgColor.b;
        raw[off + 3] = 255;
      }
    }
  }

  const compressed = zlib.deflateSync(raw);

  const crc32 = (buf: Buffer): number => {
    let c: number;
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = (crc ^ buf[i]) & 0xff;
      for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crc = (crc >>> 8) ^ c;
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const typeBuf = Buffer.from(type);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const crcInput = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(crcInput), 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  };

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8]  = 8;
  ihdrData[9]  = 6;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = chunk("IHDR", ihdrData);
  const idat = chunk("IDAT", compressed);
  const iend = chunk("IEND", Buffer.alloc(0));
  return Buffer.concat([signature, ihdr, idat, iend]);
}
