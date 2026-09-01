import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

// 어드민 화면. 빌드 결과는 dist/web 로 가고, 서버(admin.ts)가 /__admin/ 에서 서빙한다.
export default defineConfig({
  root: here,
  base: '/__admin/',
  plugins: [react()],
  build: { outDir: fileURLToPath(new URL('../../dist/web', import.meta.url)), emptyOutDir: true },
  server: {
    port: 5173,
    // 개발 중엔 API 만 실제 mock 서버로 넘긴다 (기본 4000. ADMIN_API 환경변수로 변경)
    proxy: { '^/__admin/api/': process.env.ADMIN_API ?? 'http://localhost:4000' }
  }
});
