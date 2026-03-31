/* eslint-disable no-undef */
/**
 * Netlify Function: auth-callback
 * Handles GitHub OAuth callback — exchanges code for token, fetches user info,
 * then redirects to the frontend with everything stored in the URL fragment.
 *
 * GET /.netlify/functions/auth-callback?code=xxx
 */
exports.handler = async (event) => {
    const siteUrl      = process.env.URL || 'https://pipelinexr.netlify.app';
    const clientId     = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    const code  = event.queryStringParameters && event.queryStringParameters.code;
    const error = event.queryStringParameters && event.queryStringParameters.error;

    if (error || !code) {
        return redirect(`${siteUrl}/auth/callback?error=oauth_denied`);
    }

    // 1. Exchange code for GitHub access token
    let accessToken;
    try {
        const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                client_id:     clientId,
                client_secret: clientSecret,
                code,
            }),
        });
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) {
            console.error('Token exchange failed:', JSON.stringify(tokenData));
            return redirect(`${siteUrl}/auth/callback?error=token_error`);
        }
        accessToken = tokenData.access_token;
    } catch (e) {
        console.error('Token exchange error:', e.message);
        return redirect(`${siteUrl}/auth/callback?error=token_error`);
    }

    // 2. Fetch GitHub user info
    let userInfo;
    try {
        const userRes = await fetch('https://api.github.com/user', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'User-Agent': 'PipelineXR',
            },
        });
        userInfo = await userRes.json();
        if (!userInfo.login) throw new Error('No login in response');
    } catch (e) {
        console.error('User fetch error:', e.message);
        return redirect(`${siteUrl}/auth/callback?error=user_error`);
    }

    // 3. Sync user with Railway backend (fire-and-forget)
    // NOTE: RAILWAY_BACKEND_URL is a plain server-side env var set in the Netlify dashboard.
    // VITE_API_BASE_URL is a Vite build-time variable — it is NOT available in Netlify Functions.
    const railwayUrl = process.env.RAILWAY_BACKEND_URL || '';
    if (railwayUrl) {
        try {
            await fetch(`${railwayUrl}/api/auth/sync-user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    github_id:  String(userInfo.id),
                    login:      userInfo.login,
                    name:       userInfo.name || userInfo.login,
                    email:      userInfo.email || null,
                    avatar_url: userInfo.avatar_url,
                    token:      accessToken,
                }),
            });
        } catch (e) {
            console.warn('Railway sync failed (non-fatal):', e.message);
        }
    }

    // 4. Redirect to frontend with user data + token in URL params
    // The frontend reads these, stores in localStorage, then cleans the URL.
    const payload = encodeURIComponent(JSON.stringify({
        login:      userInfo.login,
        name:       userInfo.name || userInfo.login,
        email:      userInfo.email || null,
        avatar_url: userInfo.avatar_url,
        id:         userInfo.id,
        token:      accessToken,
    }));

    return redirect(`${siteUrl}/auth/callback?status=success&payload=${payload}`);
};

function redirect(url) {
    return { statusCode: 302, headers: { Location: url }, body: '' };
}
