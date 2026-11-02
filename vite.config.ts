import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
export default defineConfig({ plugins: [react()], base: './', resolve:{alias:{'@techstark/opencv-js':fileURLToPath(new URL('./src/worker-only-opencv.ts',import.meta.url))}}, build: { target: 'es2022', chunkSizeWarningLimit: 1600 } });
