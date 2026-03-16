#!/usr/bin/env node

const { spawn, exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
require('dotenv').config();

console.log('🚀 Starting PipelineXR DevOps Dashboard...\n');

async function killPort(port) {
    try {
        const { stdout } = await execPromise(`netstat -ano | findstr :${port}`);
        const lines = stdout.trim().split('\n');
        const pids = new Set();
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && pid !== '0' && !isNaN(pid)) pids.add(pid);
        }
        for (const pid of pids) {
            await execPromise(`taskkill /PID ${pid} /F`).catch(() => {});
        }
        if (pids.size > 0) console.log(`✅ Cleared port ${port}`);
    } catch (e) {
        // Port was already free
    }
}

async function main() {
    console.log('🔍 Checking for port conflicts...');
    await killPort(3001);
    await new Promise(r => setTimeout(r, 800));

    console.log('🌟 Starting backend server on port 3001...');
    const serverProcess = spawn('node', ['server/index.js'], {
        cwd: process.cwd(),
        stdio: 'inherit',
        env: process.env
    });

    await new Promise(r => setTimeout(r, 2000));

    console.log('\n🎨 Starting React client on port 5174...');
    const clientProcess = spawn('npm', ['run', 'dev'], {
        cwd: './client',
        stdio: 'inherit',
        shell: true,
        env: process.env
    });

    clientProcess.on('error', (err) => console.error('❌ Client error:', err));
    serverProcess.on('error', (err) => { console.error('❌ Server error:', err); process.exit(1); });

    serverProcess.on('exit', (code) => {
        if (code !== 0 && code !== null) console.error(`❌ Server exited with code ${code}`);
        clientProcess.kill();
        process.exit(code || 0);
    });

    process.on('SIGINT', () => {
        console.log('\n🛑 Shutting down...');
        exec(`taskkill /pid ${clientProcess.pid} /T /F`, () => {});
        exec(`taskkill /pid ${serverProcess.pid} /T /F`, () => {});
        setTimeout(() => process.exit(0), 1000);
    });

    console.log('\n✅ Both services starting...');
    console.log('📍 Backend API: http://localhost:3001');
    console.log('📍 Frontend App: http://localhost:5174');
    console.log('\n💡 Open http://localhost:5174 in your browser\n');
}

main().catch(console.error);
