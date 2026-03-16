const { spawn } = require('child_process');
const path = require('path');

// Simple CI Runner that executes a command
const runJob = (command, args, io) => {
    console.log(`Starting Job: ${command} ${args.join(' ')}`);
    io.emit('ci_update', { status: 'RUNNING', command: `${command} ${args.join(' ')}` });

    const job = spawn(command, args, { shell: true });

    job.stdout.on('data', (data) => {
        const line = data.toString();
        // Stream logs to frontend
        io.emit('log_stream', { source: 'CI', message: line, level: 'INFO', timestamp: new Date().toISOString() });
    });

    job.stderr.on('data', (data) => {
        const line = data.toString();
        io.emit('log_stream', { source: 'CI', message: line, level: 'ERROR', timestamp: new Date().toISOString() });
    });

    job.on('close', (code) => {
        console.log(`Job exited with code ${code}`);
        const status = code === 0 ? 'SUCCESS' : 'FAILED';
        io.emit('ci_update', { status, code });
    });
};

module.exports = { runJob };
