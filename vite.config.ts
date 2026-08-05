import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import compression from 'vite-plugin-compression';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      // T28 · Brotli 압축 (2026-08-05) · 청크 크기 15~25% 추가 감소 (gzip 대비)
      //   · 프로덕션 빌드만 · .br 파일 생성 (Render/Nginx 자동 서빙)
      compression({ algorithm: 'brotliCompress', ext: '.br', threshold: 10240, deleteOriginFile: false }),
      compression({ algorithm: 'gzip',           ext: '.gz', threshold: 10240, deleteOriginFile: false }),
    ],
    optimizeDeps: {
      exclude: ["@undecaf/zbar-wasm", "@ericblade/quagga2"],
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      // 초기 번들 크기 감소 · 브라우저 캐시 효율 극대화 (2026-07-15 · C)
      //   무거운 라이브러리를 별도 chunk 로 분리 → 앱 코드 변경 시 라이브러리 캐시 유지
      chunkSizeWarningLimit: 3000,
      rollupOptions: {
        output: {
          manualChunks: (id: string) => {
            if (!id.includes("node_modules")) return;
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "vendor-react";
            if (/[\\/]node_modules[\\/](@supabase|@tanstack)[\\/]/.test(id)) return "vendor-data";
            if (/[\\/]node_modules[\\/](recharts|d3)[\\/]/.test(id)) return "vendor-charts";
            if (/[\\/]node_modules[\\/](@ericblade|@undecaf|onnxruntime|@zxing)[\\/]/.test(id)) return "vendor-ocr";
            if (/[\\/]node_modules[\\/](xlsx|papaparse)[\\/]/.test(id)) return "vendor-xlsx";
            if (/[\\/]node_modules[\\/](lucide-react)[\\/]/.test(id)) return "vendor-icons";
            return "vendor-misc";
          },
        },
      },
    },
  };
});
