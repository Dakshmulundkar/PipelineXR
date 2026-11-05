/* eslint-disable no-undef */
/**
 * Netlify Function: auth-github
 * Redirects to GitHub OAuth authorization page.
 * GET /.netlify/functions/auth-github
 */
export default async () => {
    const clientId    = Netlify.env.get('GITHUB_CLIENT_ID');
    const siteUrl     = Netlify.env.get('URL') || 'https://pipelinexr.netlify.app';
    const callbackUrl = `${siteUrl}/.netlify/functions/auth-callback`;

    if (!clientId) {
        return new Response('GITHUB_CLIENT_ID not configured', { status: 500 });
    }

    const githubUrl = [
        'https://github.com/login/oauth/authorize',
        `?client_id=${clientId}`,
        `&scope=repo,user:email`,
        `&redirect_uri=${encodeURIComponent(callbackUrl)}`,
    ].join('');

    return new Response(null, {
        status: 302,
        headers: { Location: githubUrl },
    });
};
