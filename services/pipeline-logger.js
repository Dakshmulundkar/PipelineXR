// CI/CD Pipeline Monitoring Logger
const fs = require('fs');
const path = require('path');

class PipelineLogger {
    constructor() {
        this.logFile = path.join(__dirname, '../pipeline-monitoring.log');
        this.isDebugEnabled = process.env.DEBUG_PIPELINE || false;
    }

    // Log webhook events
    webhook(eventType, deliveryId, status, details = '') {
        const timestamp = new Date().toISOString();
        const message = `[WEBHOOK] ${timestamp} | ${eventType} | ${deliveryId} | ${status} ${details}`;
        this.log(message);
        if (this.isDebugEnabled) {
            console.log(`\n📥 WEBHOOK: ${eventType}`);
            console.log(`   🆔 Delivery ID: ${deliveryId}`);
            console.log(`   📊 Status: ${status}`);
            if (details) console.log(`   📝 Details: ${details}`);
        }
    }

    // Log pipeline events
    pipeline(event, workflowName, runNumber, status, details = '') {
        const timestamp = new Date().toISOString();
        const message = `[PIPELINE] ${timestamp} | ${event} | ${workflowName} #${runNumber} | ${status} ${details}`;
        this.log(message);
        if (this.isDebugEnabled) {
            console.log(`\n🏗️  PIPELINE: ${event}`);
            console.log(`   📋 Workflow: ${workflowName} #${runNumber}`);
            console.log(`   📊 Status: ${status}`);
            if (details) console.log(`   📝 Details: ${details}`);
        }
    }

    // Log job events
    job(jobName, status, duration = null, details = '') {
        const timestamp = new Date().toISOString();
        const durationStr = duration ? `(${duration}s)` : '';
        const message = `[JOB] ${timestamp} | ${jobName} | ${status} ${durationStr} ${details}`;
        this.log(message);
        if (this.isDebugEnabled) {
            console.log(`\n💼 JOB: ${jobName}`);
            console.log(`   📊 Status: ${status} ${durationStr}`);
            if (details) console.log(`   📝 Details: ${details}`);
        }
    }

    // Log step events
    step(stepName, jobName, status, duration = null, details = '') {
        const timestamp = new Date().toISOString();
        const durationStr = duration ? `(${duration}s)` : '';
        const message = `[STEP] ${timestamp} | ${stepName} | ${jobName} | ${status} ${durationStr} ${details}`;
        this.log(message);
        if (this.isDebugEnabled) {
            console.log(`\n📋 STEP: ${stepName}`);
            console.log(`   💼 Job: ${jobName}`);
            console.log(`   📊 Status: ${status} ${durationStr}`);
            if (details) console.log(`   📝 Details: ${details}`);
        }
    }

    // Log database operations
    database(operation, table, status, details = '') {
        const timestamp = new Date().toISOString();
        const message = `[DATABASE] ${timestamp} | ${operation} | ${table} | ${status} ${details}`;
        this.log(message);
        if (this.isDebugEnabled) {
            console.log(`\n💾 DATABASE: ${operation}`);
            console.log(`   📋 Table: ${table}`);
            console.log(`   📊 Status: ${status}`);
            if (details) console.log(`   📝 Details: ${details}`);
        }
    }

    // Log API calls
    api(method, endpoint, status, duration = null, details = '') {
        const timestamp = new Date().toISOString();
        const durationStr = duration ? `(${duration}ms)` : '';
        const message = `[API] ${timestamp} | ${method} ${endpoint} | ${status} ${durationStr} ${details}`;
        this.log(message);
        if (this.isDebugEnabled) {
            console.log(`\n🌐 API: ${method} ${endpoint}`);
            console.log(`   📊 Status: ${status} ${durationStr}`);
            if (details) console.log(`   📝 Details: ${details}`);
        }
    }

    // Log errors
    error(source, error, context = '') {
        const timestamp = new Date().toISOString();
        const message = `[ERROR] ${timestamp} | ${source} | ${error.message} ${context}`;
        this.log(message);
        console.error(`\n❌ ERROR: ${source}`);
        console.error(`   📝 Message: ${error.message}`);
        if (context) console.error(`   📋 Context: ${context}`);
        if (this.isDebugEnabled) {
            console.error(`   🐛 Stack: ${error.stack}`);
        }
    }

    // Log connection events
    connection(type, clientId, status, details = '') {
        const timestamp = new Date().toISOString();
        const message = `[CONNECTION] ${timestamp} | ${type} | ${clientId} | ${status} ${details}`;
        this.log(message);
        if (this.isDebugEnabled) {
            console.log(`\n🔌 CONNECTION: ${type}`);
            console.log(`   🆔 Client: ${clientId}`);
            console.log(`   📊 Status: ${status}`);
            if (details) console.log(`   📝 Details: ${details}`);
        }
    }

    // Log analytics events
    analytics(metric, value, repository = '', details = '') {
        const timestamp = new Date().toISOString();
        const repoStr = repository ? `(${repository})` : '';
        const message = `[ANALYTICS] ${timestamp} | ${metric} | ${value} ${repoStr} ${details}`;
        this.log(message);
        if (this.isDebugEnabled) {
            console.log(`\n📈 ANALYTICS: ${metric}`);
            console.log(`   📊 Value: ${value} ${repoStr}`);
            if (details) console.log(`   📝 Details: ${details}`);
        }
    }

    // Generic log method
    log(message) {
        const logEntry = `${message}\n`;
        
        // Write to file
        fs.appendFileSync(this.logFile, logEntry);
        
        // Also log to console in development
        if (process.env.NODE_ENV !== 'production') {
            console.log(message);
        }
    }

    // Get recent logs
    getRecentLogs(count = 50) {
        try {
            if (!fs.existsSync(this.logFile)) return [];
            
            const content = fs.readFileSync(this.logFile, 'utf8');
            const lines = content.split('\n').filter(line => line.trim());
            return lines.slice(-count);
        } catch (error) {
            console.error('Failed to read log file:', error);
            return [];
        }
    }

    // Clear log file
    clearLogs() {
        try {
            fs.writeFileSync(this.logFile, '');
            console.log('Pipeline monitoring logs cleared');
        } catch (error) {
            console.error('Failed to clear logs:', error);
        }
    }

    // Get log file path
    getLogFilePath() {
        return this.logFile;
    }
}

// Create singleton instance
const pipelineLogger = new PipelineLogger();

// Export for use in other modules
module.exports = pipelineLogger;