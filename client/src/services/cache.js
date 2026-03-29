/**
 * Session-scoped data cache.
 * Data persists across React navigation (page switches) but clears when the tab closes.
 * Keys are namespaced by page + repo + range so different repos/ranges don't collide.
 */

const TTL_MS = 5 * 60 * 1000; // 5 minutes — after this, background refresh kicks in

function cacheKey(namespace, repo, extra = '') {
    return `pxr_cache:${namespace}:${repo || 'all'}:${extra}`;
}

export function cacheGet(namespace, repo, extra = '') {
    try {
        const raw = sessionStorage.getItem(cacheKey(namespace, repo, extra));
        if (!raw) return null;
        const { data, ts } = JSON.parse(raw);
        return { data, stale: Date.now() - ts > TTL_MS };
    } catch {
        return null;
    }
}

export function cacheSet(namespace, repo, data, extra = '') {
    try {
        sessionStorage.setItem(cacheKey(namespace, repo, extra), JSON.stringify({ data, ts: Date.now() }));
    } catch {
        // sessionStorage full — ignore
    }
}

export function cacheClear(namespace, repo, extra = '') {
    try {
        sessionStorage.removeItem(cacheKey(namespace, repo, extra));
    } catch {}
}
