const { Pool } = require('pg');

// Append sslmode=verify-full to the connection string for non-localhost DBs
// so pg v8.20+ doesn't emit the deprecation warning about SSL mode aliases.
const dbUrl = process.env.DATABASE_URL || '';
const isLocal = dbUrl.includes('localhost');
const connectionString = !isLocal && dbUrl
    ? dbUrl + (dbUrl.includes('?') ? '&' : '?') + 'sslmode=verify-full'
    : dbUrl;

const pool = new Pool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: true },
    max: 5,              // Neon free tier: 100 connection limit — keep headroom
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
    console.error('[DB] Unexpected pool error:', err.message);
});

// ── Compatibility shim: expose .run / .all / .get / .exec ─────────────────────
// All existing services use the sqlite3 callback API.
// These wrappers translate to pg so no other file needs to change.

/**
 * db.run(sql, params, callback)
 * Mirrors sqlite3 db.run — callback(err) with `this.lastID` / `this.changes`
 */
pool.run = function (sql, params, callback) {
    if (typeof params === 'function') { callback = params; params = []; }
    // Convert ? placeholders → $1, $2 …
    const { text, values } = toPositional(sql, params);
    pool.query(text, values)
        .then((res) => {
            if (typeof callback === 'function') {
                const ctx = {
                    lastID: res.rows?.[0]?.id ?? null,
                    changes: res.rowCount ?? 0,
                };
                callback.call(ctx, null);
            }
        })
        .catch((err) => {
            if (typeof callback === 'function') callback(err);
            else console.error('[DB] run error:', err.message, '\nSQL:', text);
        });
};

/**
 * db.all(sql, params, callback)
 * Mirrors sqlite3 db.all — callback(err, rows[])
 */
pool.all = function (sql, params, callback) {
    if (typeof params === 'function') { callback = params; params = []; }
    const { text, values } = toPositional(sql, params);
    pool.query(text, values)
        .then((res) => {
            if (typeof callback === 'function') callback(null, res.rows || []);
        })
        .catch((err) => {
            if (typeof callback === 'function') callback(err, []);
            else console.error('[DB] all error:', err.message, '\nSQL:', text);
        });
};

/**
 * db.get(sql, params, callback)
 * Mirrors sqlite3 db.get — callback(err, row|undefined)
 */
pool.get = function (sql, params, callback) {
    if (typeof params === 'function') { callback = params; params = []; }
    const { text, values } = toPositional(sql, params);
    pool.query(text, values)
        .then((res) => {
            if (typeof callback === 'function') callback(null, res.rows?.[0] ?? undefined);
        })
        .catch((err) => {
            if (typeof callback === 'function') callback(err, undefined);
            else console.error('[DB] get error:', err.message, '\nSQL:', text);
        });
};

/**
 * db.exec(sql, callback)
 * Mirrors sqlite3 db.exec — runs raw SQL (no params), callback(err)
 */
pool.exec = function (sql, callback) {
    pool.query(sql)
        .then(() => { if (typeof callback === 'function') callback(null); })
        .catch((err) => { if (typeof callback === 'function') callback(err); });
};

/**
 * db.prepare(sql) — returns a fake statement with .run() and .finalize()
 * sqlite3 prepared statements are used in several services.
 * We emulate them with immediate pg queries.
 */
pool.prepare = function (sql) {
    return {
        _sql: sql,
        run(...args) {
            // Last arg may be a callback
            let callback;
            let params = args;
            if (typeof args[args.length - 1] === 'function') {
                callback = args[args.length - 1];
                params = args.slice(0, -1);
            }
            const { text, values } = toPositional(this._sql, params);
            pool.query(text, values)
                .then((res) => {
                    if (typeof callback === 'function') {
                        const ctx = { lastID: res.rows?.[0]?.id ?? null, changes: res.rowCount ?? 0 };
                        callback.call(ctx, null);
                    }
                })
                .catch((err) => {
                    if (typeof callback === 'function') callback(err);
                    else console.error('[DB] prepare.run error:', err.message);
                });
        },
        finalize(callback) {
            if (typeof callback === 'function') callback(null);
        },
    };
};

// ── Placeholder converter: ? → $1, $2 … ──────────────────────────────────────
function toPositional(sql, params = []) {
    let i = 0;
    const text = sql.replace(/\?/g, () => `$${++i}`);
    return { text, values: params };
}

// Export the pool as the default db object
module.exports = pool;
