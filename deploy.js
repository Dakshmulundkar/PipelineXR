#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class DeploymentManager {
    constructor() {
        this.projectRoot = __dirname;
        this.logFile = path.join(this.projectRoot, 'deployment.log');
    }

    log(message) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}\n`;
        console.log(message);
        fs.appendFileSync(this.logFile, logMessage);
    }

    async runCommand(command, args = [], options = {}) {
        return new Promise((resolve, reject) => {
            this.log(`Running: ${command} ${args.join(' ')}`);
            
            const process = spawn(command, args, {
                cwd: options.cwd || this.projectRoot,
                stdio: 'pipe',
                shell: true,
                ...options
            });

            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                const output = data.toString();
                stdout += output;
                this.log(`STDOUT: ${output.trim()}`);
            });

            process.stderr.on('data', (data) => {
                const output = data.toString();
                stderr += output;
                this.log(`STDERR: ${output.trim()}`);
            });

            process.on('close', (code) => {
                if (code === 0) {
                    resolve({ stdout, stderr, code });
                } else {
                    reject(new Error(`Command failed with code ${code}: ${stderr}`));
                }
            });

            process.on('error', (error) => {
                reject(error);
            });
        });
    }

    async checkPrerequisites() {
        this.log('Checking prerequisites...');
        
        try {
            // Check Node.js version
            const nodeVersion = await this.runCommand('node', ['--version']);
            this.log(`Node.js version: ${nodeVersion.stdout.trim()}`);

            // Check npm
            const npmVersion = await this.runCommand('npm', ['--version']);
            this.log(`npm version: ${npmVersion.stdout.trim()}`);

            // Check if package.json exists
            if (!fs.existsSync(path.join(this.projectRoot, 'package.json'))) {
                throw new Error('package.json not found');
            }

            this.log('Prerequisites check passed');
            return true;
        } catch (error) {
            this.log(`Prerequisites check failed: ${error.message}`);
            throw error;
        }
    }

    async installDependencies() {
        this.log('Installing dependencies...');
        
        try {
            await this.runCommand('npm', ['install']);
            this.log('Dependencies installed successfully');
        } catch (error) {
            this.log(`Dependency installation failed: ${error.message}`);
            throw error;
        }
    }

    async runTests() {
        this.log('Running tests...');
        
        try {
            // Create a simple test if none exists
            const testScript = `
console.log('Running basic health checks...');

// Test 1: Check if server file exists
const fs = require('fs');
const path = require('path');

if (!fs.existsSync(path.join(__dirname, 'server', 'index.js'))) {
    console.error('❌ Server file not found');
    process.exit(1);
}
console.log('✅ Server file exists');

// Test 2: Check if public files exist
if (!fs.existsSync(path.join(__dirname, 'public', 'index.html'))) {
    console.error('❌ Public HTML file not found');
    process.exit(1);
}
console.log('✅ Public files exist');

// Test 3: Check if services exist
if (!fs.existsSync(path.join(__dirname, 'services', 'github.js'))) {
    console.error('❌ GitHub service not found');
    process.exit(1);
}
console.log('✅ Services exist');

console.log('🎉 All health checks passed!');
`;

            const testFile = path.join(this.projectRoot, 'test-health.js');
            fs.writeFileSync(testFile, testScript);

            await this.runCommand('node', ['test-health.js']);
            
            // Clean up test file
            fs.unlinkSync(testFile);
            
            this.log('Tests passed successfully');
        } catch (error) {
            this.log(`Tests failed: ${error.message}`);
            throw error;
        }
    }

    async buildProject() {
        this.log('Building project...');
        
        try {
            // For this project, we don't have a build step, but we can validate files
            const requiredFiles = [
                'server/index.js',
                'public/index.html',
                'public/js/app.js',
                'public/js/charts.js',
                'public/js/data-integration.js',
                'services/github.js',
                'services/pipeline.js',
                'services/runner.js',
                'services/analytics.js'
            ];

            for (const file of requiredFiles) {
                const filePath = path.join(this.projectRoot, file);
                if (!fs.existsSync(filePath)) {
                    throw new Error(`Required file missing: ${file}`);
                }
            }

            this.log('Project build validation passed');
        } catch (error) {
            this.log(`Build failed: ${error.message}`);
            throw error;
        }
    }

    async startServer() {
        this.log('Starting server...');
        
        try {
            // Start the server in the background
            const serverProcess = spawn('node', ['server/index.js'], {
                cwd: this.projectRoot,
                detached: true,
                stdio: 'ignore'
            });

            serverProcess.unref();

            // Wait a moment for server to start
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Test if server is responding
            const testResponse = await this.testServerHealth();
            if (testResponse) {
                this.log('Server started successfully and is responding');
                return serverProcess.pid;
            } else {
                throw new Error('Server started but is not responding');
            }
        } catch (error) {
            this.log(`Server start failed: ${error.message}`);
            throw error;
        }
    }

    async testServerHealth() {
        try {
            const http = require('http');
            
            return new Promise((resolve) => {
                const req = http.get('http://localhost:3001', (res) => {
                    resolve(res.statusCode === 200);
                });
                
                req.on('error', () => {
                    resolve(false);
                });
                
                req.setTimeout(5000, () => {
                    req.destroy();
                    resolve(false);
                });
            });
        } catch (error) {
            return false;
        }
    }

    async deploy() {
        this.log('🚀 Starting deployment process...');
        
        try {
            // Step 1: Check prerequisites
            await this.checkPrerequisites();

            // Step 2: Install dependencies
            await this.installDependencies();

            // Step 3: Run tests
            await this.runTests();

            // Step 4: Build project
            await this.buildProject();

            // Step 5: Start server
            const serverPid = await this.startServer();

            this.log('✅ Deployment completed successfully!');
            this.log(`🌐 Application is running at: http://localhost:3001`);
            this.log(`📊 Dashboard available at: http://localhost:3001/#trends`);
            this.log(`🔧 Server PID: ${serverPid}`);
            
            // Create a status file
            const statusInfo = {
                status: 'deployed',
                timestamp: new Date().toISOString(),
                pid: serverPid,
                url: 'http://localhost:3001',
                version: require('./package.json').version
            };
            
            fs.writeFileSync(
                path.join(this.projectRoot, 'deployment-status.json'), 
                JSON.stringify(statusInfo, null, 2)
            );

            return statusInfo;

        } catch (error) {
            this.log(`❌ Deployment failed: ${error.message}`);
            throw error;
        }
    }

    async stop() {
        this.log('Stopping deployment...');
        
        try {
            const statusFile = path.join(this.projectRoot, 'deployment-status.json');
            
            if (fs.existsSync(statusFile)) {
                const status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
                
                if (status.pid) {
                    try {
                        process.kill(status.pid, 'SIGTERM');
                        this.log(`Stopped server with PID: ${status.pid}`);
                    } catch (error) {
                        this.log(`Could not stop process ${status.pid}: ${error.message}`);
                    }
                }
                
                fs.unlinkSync(statusFile);
            }
            
            this.log('Deployment stopped');
        } catch (error) {
            this.log(`Error stopping deployment: ${error.message}`);
        }
    }

    async status() {
        const statusFile = path.join(this.projectRoot, 'deployment-status.json');
        
        if (fs.existsSync(statusFile)) {
            const status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
            const isHealthy = await this.testServerHealth();
            
            return {
                ...status,
                healthy: isHealthy,
                uptime: Date.now() - new Date(status.timestamp).getTime()
            };
        }
        
        return { status: 'not deployed' };
    }
}

// CLI Interface
if (require.main === module) {
    const deployment = new DeploymentManager();
    const command = process.argv[2] || 'deploy';

    switch (command) {
        case 'deploy':
            deployment.deploy()
                .then((status) => {
                    console.log('\n🎉 Deployment Summary:');
                    console.log(`Status: ${status.status}`);
                    console.log(`URL: ${status.url}`);
                    console.log(`PID: ${status.pid}`);
                    console.log(`Time: ${status.timestamp}`);
                })
                .catch((error) => {
                    console.error('\n❌ Deployment failed:', error.message);
                    process.exit(1);
                });
            break;

        case 'stop':
            deployment.stop()
                .then(() => {
                    console.log('✅ Deployment stopped');
                })
                .catch((error) => {
                    console.error('❌ Stop failed:', error.message);
                    process.exit(1);
                });
            break;

        case 'status':
            deployment.status()
                .then((status) => {
                    console.log('📊 Deployment Status:');
                    console.log(JSON.stringify(status, null, 2));
                })
                .catch((error) => {
                    console.error('❌ Status check failed:', error.message);
                    process.exit(1);
                });
            break;

        default:
            console.log('Usage: node deploy.js [deploy|stop|status]');
            process.exit(1);
    }
}

module.exports = DeploymentManager;