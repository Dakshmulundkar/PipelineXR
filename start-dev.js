#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
require('dotenv').config();

console.log('🚀 Starting Secure Flow DevOps Dashboard...\n');

// Validate environment variables
const requiredEnvVars = [
    'GITHUB_CLIENT_ID',
    'GITHUB_CLIENT_SECRET',
    'SESSION_SECRET',
    'FRONTEND_URL'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(varName => {
        console.error(`   - ${varName}`);
    });
    console.error('\nPlease check your .env file and ensure all variables are set.');
    console.error('See setup-github-oauth.md for configuration instructions.\n');
    process.exit(1);
}

// Check if GitHub Client Secret looks complete
if (process.env.GITHUB_CLIENT_SECRET.includes('PLACEHOLDER') || process.env.GITHUB_CLIENT_SECRET.length < 16) {
    console.error('❌ GITHUB_CLIENT_SECRET appears to be incomplete.');
    console.error('Please update your .env file with the complete client secret from GitHub.');
    console.error('See setup-github-oauth.md for instructions.\n');
    process.exit(1);
}

console.log('✅ Environment variables validated');
console.log(`📍 Frontend URL: ${process.env.FRONTEND_URL}`);
console.log(`🔑 GitHub Client ID: ${process.env.GITHUB_CLIENT_ID}`);
console.log(`🔐 GitHub Client Secret: ${'*'.repeat(process.env.GITHUB_CLIENT_SECRET.length)}`);
console.log('');

// Start the server
console.log('🌟 Starting server...');
const serverProcess = spawn('node', ['server/index.js'], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env
});

serverProcess.on('error', (error) => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
});

serverProcess.on('exit', (code) => {
    if (code !== 0) {
        console.error(`❌ Server exited with code ${code}`);
        process.exit(code);
    }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    serverProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down server...');
    serverProcess.kill('SIGTERM');
});