import { defineConfig } from 'vite';
export default defineConfig({server:{proxy:{'/socket':{target:'http://127.0.0.1:3001',ws:true,changeOrigin:false},'/api':{target:'http://127.0.0.1:3001'}}}});
