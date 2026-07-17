import { defineConfig } from 'vite';

// GitHub Pages는 https://<user>.github.io/<repo>/ 하위 경로로 서빙되므로
// base를 './'(상대 경로)로 두어야 빌드 산출물의 자산 링크가 깨지지 않는다.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
});
