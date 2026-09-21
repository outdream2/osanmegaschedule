import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// 2026-09-21 · E-004 · Electron file:// 프로토콜 · 하얀 화면 근본 원인 fix
//   · Vite 는 module script/stylesheet 에 crossorigin 속성 자동 주입
//   · Electron file:// origin = null → crossorigin 있으면 CORS 실패 · script 로드 실패
//   · <script crossorigin> · <link crossorigin> · 속성 제거 필수
//   · 참고: https://github.com/vitejs/vite/issues/9552
function stripCrossoriginPlugin() {
  return {
    name: "sync-agent-strip-crossorigin",
    transformIndexHtml(html: string) {
      return html.replace(/\s+crossorigin(=("[^"]*"|'[^']*'))?/g, "");
    },
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/main/index.ts"),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/preload/index.ts"),
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    // 2026-09-18 · file:// 프로토콜 · 상대 경로 강제 · 하얀 화면 방지
    //   · 기본 · absolute '/' · Electron file:// 에서 파일 시스템 root 로 해석 · 404
    //   · './' · index.html 기준 상대 경로 · 배포 안정
    //   · 참고 · electron-vite production 자동 './' · 명시적 설정 · 안전망
    base: "./",
    resolve: {
      alias: {
        "@renderer": resolve(__dirname, "src/renderer/src"),
      },
    },
    plugins: [react(), stripCrossoriginPlugin()],
    build: {
      // 2026-09-21 · E-004 · module preload polyfill · file:// 에서 CORS 이슈 · 비활성화
      //   · Electron 최신 · esnext ES modules 네이티브 지원 · polyfill 불필요
      modulePreload: {
        polyfill: false,
      },
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/renderer/index.html"),
        },
      },
    },
  },
});
