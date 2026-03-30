/* eslint-disable no-undef */
/**
 * Netlify Function: auth-callback
 * Exchanges GitHub OAuth code for access token, then calls Railway
 * to create a session and get user info.
 *
 * GET /.netlify/functions/auth-callback?code=xxx
 */
exports.handler = async (event) => {
    const frontendUrl   = process.env.URL || process.env.DEPLOY_URL || 'https://pipelinexr.netlify.app';
    const clientId      = process.env.GITHUB_CLIENT_ID;
    const clientSecret  = process.env.GITHUB_CLIENT_SECRET;
    const railwayUrl    = (process.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

    const code  = event.queryStringParameters?.code;
    const error = event.queryStringParameters?.error;

    if (error) {
        return redirect(`${frontendUrl}/login?error=oauth_denied`);
    }
    if (!code) {
        return redirect(`${frontendUrl}/login?error=no_code`);
    }

    // 1. Exchange code for GitHub access token
    let accessToken;
    try {
        const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
        });
        const tokenData = await tokenRes.json();
        if (tokenData.error || !tokenData.access_token) {
            console.error('Token exchange failed:', tokenData);
            return redirect(`${frontendUrl}/login?error=token_error`);
        }
        accessToken = tokenData.access_token;
    } catch (e) {
        console.error('Token exchange error:', e.message);
        return redirect(`${frontendUrl}/login?error=token_error`);
    }

    // 2. Fetch GitHub user info
    let userInfo;
    try {
        const userRes = await fetch('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'PipelineXR' },
        });
        userInfo = await userRes.json();
        if (!userInfo.login) throw new Error('No login in user response');
    } catch (e) {
        console.error('User fetch error:', e.message);
        return redirect(`${frontendUrl}/login?error=user_error`);
    }

    // 3. Register/sync user with Railway backend (fire-and-forget, non-fatal)
    if (railwayUrl) {
        try {
            await fetch(`${railwayUrl}/api/auth/sync-user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    github_id:  userInfo.id?.toString(),
                    login:      userInfo.login,
                    name:       userInfo.name || userInfo.login,
                    email:      userInfo.email || null,
                    avatar_url: userInfo.avatar_url,
                    token:      accessToken,
                }),
            });
        } catch (e) {
            console.warn('Railway user sync failed (non-fatal):', e.message);
        }
    }

    // 4. Store auth in a secure httpOnly cookie and redirect to dashboard
    // We encode minimal user info + token in a signed cookie via Railway,
    // or simply store in a short-lived cookie the frontend reads once.
    const userPayload = Buffer.from(JSON.stringify({
        login:      userInfo.login,
        name:       userInfo.name || userInfo.login,
        email:      userInfo.email || null,
        avatar_url: userInfo.avatar_url,
        id:         userInfo.id,
        token:      accessToken,
    })).toString('base64');

    return {
        statusCode: 302,
        headers: {
            Location: `${frontendUrl}/auth/callback?status=success`,
            // Store token in a session cookie — JS-readable so the frontend can pick it up
            'Set-Cookie': `pxr_session=${userPayload}; Path=/; SameSite=Lax; Max-Age=86400`,
        },
        body: '',
    };
};

const redirect = (url) => ({
    statusCode: 302,
    headers: { Location: url },
    body: '',
});
