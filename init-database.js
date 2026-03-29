require('dotenv').config();
const { initializeDatabase } = require('./services/db-init');

console.log('🔧 Initializing Neon PostgreSQL database...');

if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set.');
    process.exit(1);
}

initializeDatabase()
    .then(() => {
        console.log('✅ Database initialized successfully');
        process.exit(0);
    })
    .catch((err) => {
        console.error('❌ Database initialization failed:', err.message);
        process.exit(1);
    });
