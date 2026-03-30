/* eslint-disable no-undef */
/**
 * Netlify Function: auth-github
 * Redirects to GitHub OAuth authorization page.
 * GET /.netlify/functions/auth-github
 */
exports.handler = async () => {
    const clientId    = process.env.GITHUB_CLIENT_ID;
    const siteUrl     = process.env.URL || 'https://pipelinexr.netlify.app';
    const callbackUrl = `${siteUrl}/.netlify/functions/auth-callback`;

    if (!clientId) {
        return { statusCode: 500, body: 'GITHUB_CLIENT_ID not configured' };
    }

    const githubUrl = [
        'https://github.com/login/oauth/authorize',
        `?client_id=${clientId}`,
        `&scope=repo,user:email`,
        `&redirect_uri=${encodeURIComponent(callbackUrl)}`,
    ].join('');

    return {
        statusCode: 302,
        headers: { Location: githubUrl },
        body: '',
    };
};
