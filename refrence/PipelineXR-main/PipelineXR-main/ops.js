const http = require('http');

const command = process.argv[2];
const arg = process.argv[3];

if (!command) {
    console.log("Usage: node ops.js [simulate|deploy|fail]");
    process.exit(1);
}

const sendWebhook = (data) => {
    const req = http.request({
        hostname: 'localhost',
        port: 3001,
        path: '/api/webhook',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    }, (res) => {
        console.log(`Status: ${res.statusCode}`);
    });

    req.write(JSON.stringify(data));
    req.end();
};

if (command === 'simulate') {
    console.log("Simulating Traffic Spike...");
    sendWebhook({ type: 'ALERT', msg: 'Traffic Spike detected on Load Balancer', severity: 'WARNING' });
} else if (command === 'fail') {
    console.log("Simulating Critical Failure...");
    sendWebhook({ type: 'INCIDENT', msg: 'Database Connection Lost (Master Node)', severity: 'CRITICAL' });
} else if (command === 'deploy') {
    console.log("Triggering Deployment...");
    // Trigger the CI endpoint
    const req = http.request({
        hostname: 'localhost',
        port: 3001,
        path: '/api/ci/run',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, (res) => {
        console.log("Deployment Triggered via API");
    });
    req.write(JSON.stringify({ command: 'echo "Deploying to Staging..." && ping 127.0.0.1 -n 3 > nul && echo "Success"' }));
    req.end();
} else if (command === 'monitor') {
    console.log("Starting Live Monitor (Ctrl+C to stop)...");
    setInterval(() => {
        const type = Math.random() > 0.7 ? 'ALERT' : 'LOG';
        if (type === 'ALERT') {
            const severities = ['INFO', 'WARNING', 'CRITICAL'];
            const msg = `Random event # ${Math.floor(Math.random() * 1000)}`;
            sendWebhook({ type: 'ALERT', msg, severity: severities[Math.floor(Math.random() * 3)] });
            console.log(`> Sent Alert: ${msg}`);
        } else {
            // Simulate CI Log
            const req = http.request({
                hostname: 'localhost',
                port: 3001,
                path: '/api/logs',
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' }
            });
            req.write(`[System] Background task processing item ${Math.floor(Math.random() * 500)}...`);
            req.end();
            console.log("> Sent Log");
        }
    }, 3000);
} else {
    console.log("Unknown command");
}
