/* eslint-disable no-undef */
/**
 * Netlify Function: auth-github
 * Handles GitHub OAuth — initiates the OAuth flow.
 * GET /.netlify/functions/auth-github  →  redirect to GitHub
 */
exports.handler = async () => {
    const clientId     = process.env.GITHUB_CLIENT_ID;
    const frontendUrl  = process.env.URL || process.env.DEPLOY_URL || 'https://pipelinexr.netlify.app';
    const callbackUrl  = `${frontendUrl}/.netlify/functions/auth-callback`;

    if (!clientId) {
        return { statusCode: 500, body: 'GITHUB_CLIENT_ID not configured' };
    }

    const githubUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=repo,user:email&redirect_uri=${encodeURIComponent(callbackUrl)}`;

    return {
        statusCode: 302,
        headers: { Location: githubUrl },
        body: '',
    };
};
