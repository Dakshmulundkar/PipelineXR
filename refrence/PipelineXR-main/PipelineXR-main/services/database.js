const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'devops.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Failed to connect to database:', err.message);
        process.exit(1);
    }
});

// Enable Write-Ahead Logging for better concurrent read performance
db.run('PRAGMA journal_mode=WAL');
db.run('PRAGMA busy_timeout=5000');

module.exports = db;
