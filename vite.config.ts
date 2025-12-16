import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages用のbase設定
  // リポジトリ名に応じて変更してください（例: /NewYearsCard/）
  // ルートドメインの場合は '/' のままで構いません
  base: './',
})
