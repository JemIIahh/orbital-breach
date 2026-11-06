import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';
const children=[spawn(process.execPath,['server/index.js'],{stdio:'inherit'}),spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','0.0.0.0','--strictPort'],{stdio:'inherit'})];
let closing=false;function stop(){if(closing)return;closing=true;children.forEach(p=>p.kill('SIGTERM'))}
for(const p of children){p.on('error',e=>{console.error(e.message);stop();process.exitCode=1});p.on('exit',code=>{if(!closing){stop();process.exitCode=code||0}})}
for(const s of ['SIGINT','SIGTERM'])process.on(s,stop);
for(const n of Object.values(networkInterfaces()).flat())if(n.family==='IPv4'&&!n.internal)console.log(`LAN play: http://${n.address}:5173 (same Wi-Fi; use this address on every device)`);
