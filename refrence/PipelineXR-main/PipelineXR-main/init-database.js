const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'devops.sqlite');
const schemaPath = path.join(__dirname, 'schema.sql');

console.log('🔧 Initializing database...');
console.log(`📁 Database path: ${dbPath}`);

// Create database connection
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Error opening database:', err);
        process.exit(1);
    }
    console.log('✅ Database connection established');
});

// Read schema file
const schema = fs.readFileSync(schemaPath, 'utf8');

// Split schema into individual statements
const statements = schema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

console.log(`📋 Found ${statements.length} SQL statements to execute`);

// Execute statements serially to avoid index-before-table race conditions
db.serialize(() => {
    let errors = 0;
    statements.forEach((statement, index) => {
        db.run(statement, (err) => {
            if (err) {
                // Ignore "already exists" — safe to re-run
                if (!err.message.includes('already exists')) {
                    console.error(`❌ Error executing statement ${index + 1}:`, err.message);
                    errors++;
                }
            }
        });
    });

    // Verify tables after all statements complete
    db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", (err, tables) => {
        if (err) {
            console.error('❌ Error listing tables:', err);
        } else {
            console.log('✅ Database initialized successfully!');
            console.log(`\n📊 Database contains ${tables.length} tables:`);
            tables.forEach(table => console.log(`   - ${table.name}`));
        }
        db.close();
    });
});
