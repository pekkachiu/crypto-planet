import { defineConfig } from 'vite';

export default defineConfig({
  // 相對路徑，讓 GitHub Pages 的 /crypto-planet/ 子路徑也能正常載入
  base: './',
  // three.js 本身約 480 kB，無法再拆
  build: { chunkSizeWarningLimit: 800 },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      // 3D 渲染（scenes、kit）交給 E2E 驗證；單元測試覆蓋純邏輯模組
      include: ['src/data/**/*.js', 'src/sim/**/*.js', 'src/i18n/**/*.js', 'src/ui/format.js', 'src/ui/theme.js'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
