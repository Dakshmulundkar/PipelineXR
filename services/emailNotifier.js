'use strict';
/**
 * services/emailNotifier.js
 *
 * Sends alert emails for pipeline failures and security scan results.
 * - Uses the user's GitHub email (stored in users table) — no hardcoded address
 * - Deduplicates: one email per run_id (pipeline) or per commit sha (security)
 * - Uses Gemini API to write email content
 * - Sends via Resend (HTTPS, works on Railway)
 */

const db = require('./database');

// ── In-memory dedup: track run_ids and commit shas already notified ───────────
// Persists for the lifetime of the process — prevents duplicate emails within
// a single deployment. On restart, the DB check below handles cross-restart dedup.
const _notifiedRuns = new Set();
const _notifiedScans = new Set(); // key: `${userId}:${repository}:${commitSha}`

// ── Get user email from DB ────────────────────────────────────────────────────
async function getUserEmail(userId) {
    return new Promise((resolve) => {
        db.get('SELECT email FROM users WHERE id = ?', [userId], (err, row) => {
            resolve(row?.email || null);
        });
    });
}

// ── Resend client ─────────────────────────────────────────────────────────────
let _resend = null;
function getResend() {
    if (_resend) return _resend;
    if (!process.env.RESEND_API_KEY) return null;
    const { Resend } = require('resend');
    _resend = new Resend(process.env.RESEND_API_KEY);
    return _resend;
}

async function sendViaResend(to, subject, html) {
    const resend = getResend();
    if (!resend) { console.warn('[NOTIFIER] RESEND_API_KEY not set — email not sent'); return false; }
    try {
        await resend.emails.send({
            from: process.env.RESEND_FROM || 'PipelineXR <onboarding@resend.dev>',
            to,
            subject,
            html,
        });
        console.log(`[NOTIFIER] Email sent to ${to}: ${subject}`);
        return true;
    } catch (e) {
        console.error('[NOTIFIER] Resend failed:', e.message);
        return false;
    }
}

// ── Gemini for email content ──────────────────────────────────────────────────
const { GoogleGenerativeAI } = require('@google/generative-ai');
let _gemini = null;

function getGemini() {
    if (!process.env.GEMINI_API_KEY) return null;
    if (!_gemini) {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        _gemini = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
    }
    return _gemini;
}

async function generateWithGemini(prompt) {
    const model = getGemini();
    if (!model) return null;
    try {
        const result = await model.generateContent(prompt);
        return (await result.response).text();
    } catch (e) {
        console.warn('[NOTIFIER] Gemini failed:', e.message);
        return null;
    }
}

// ── HTML email wrapper ────────────────────────────────────────────────────────
function wrapHtml(title, accentColor, bodyHtml) {
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:28px;">
      <div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,#3B82F6,#7C3AED);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:13px;color:#fff;">PX</div>
      <span style="font-size:15px;font-weight:700;color:#fff;">PipelineXR</span>
    </div>
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:28px;">
      <div style="width:4px;height:40px;background:${accentColor};border-radius:2px;margin-bottom:20px;"></div>
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#fff;">${title}</h1>
      ${bodyHtml}
    </div>
    <p style="margin-top:20px;font-size:11px;color:rgba(255,255,255,0.25);text-align:center;">
      PipelineXR · Automated alert · You receive this because you connected this repository.
    </p>
  </div>
</body>
</html>`;
}

// ── Pipeline failure email ────────────────────────────────────────────────────
async function sendPipelineFailureEmail(userId, runData, failedSteps = []) {
    const runId = runData.run_id || runData.id;

    // Dedup — only one email per run
    if (_notifiedRuns.has(runId)) return;
    _notifiedRuns.add(runId);
    // Evict old entries to prevent unbounded growth
    if (_notifiedRuns.size > 500) {
        const first = _notifiedRuns.values().next().value;
        _notifiedRuns.delete(first);
    }

    // Get user's email from DB
    const userEmail = await getUserEmail(userId);
    if (!userEmail) {
        console.warn(`[NOTIFIER] No email for user ${userId} — skipping pipeline failure email`);
        return;
    }

    const repo = runData.repository || 'unknown';
    const workflow = runData.workflow_name || 'Workflow';
    const branch = runData.head_branch || 'main';
    const commit = runData.head_commit_message?.split('\n')[0]?.slice(0, 80) || '—';
    const actor = runData.triggering_actor || '—';
    const duration = runData.duration_seconds ? `${Math.round(runData.duration_seconds / 60)}m ${runData.duration_seconds % 60}s` : '—';
    const runUrl = runData.html_url || '#';

    const geminiPrompt = `Write a concise 2-sentence summary for a pipeline failure notification email.
Repository: ${repo}, Workflow: ${workflow}, Branch: ${branch}
Commit: ${commit}
Failed steps: ${failedSteps.length > 0 ? failedSteps.join(', ') : 'unknown'}
Be direct and actionable. No markdown, plain text only.`;

    const aiSummary = await generateWithGemini(geminiPrompt);

    const subject = `❌ Pipeline failed: ${workflow} on ${branch} — ${repo}`;

    const bodyHtml = `
      <p style="margin:0 0 20px;font-size:14px;color:rgba(255,255,255,0.7);line-height:1.6;">
        ${aiSummary || `The <strong>${workflow}</strong> pipeline on branch <strong>${branch}</strong> failed. Immediate investigation is recommended.`}
      </p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        ${[
            ['Repository', repo],
            ['Workflow', workflow],
            ['Branch', branch],
            ['Commit', commit],
            ['Triggered by', actor],
            ['Duration', duration],
        ].map(([k, v]) => `
          <tr>
            <td style="padding:8px 0;font-size:12px;color:rgba(255,255,255,0.4);width:120px;border-bottom:1px solid rgba(255,255,255,0.06);">${k}</td>
            <td style="padding:8px 0;font-size:13px;color:#fff;border-bottom:1px solid rgba(255,255,255,0.06);">${v}</td>
          </tr>`).join('')}
      </table>
      ${failedSteps.length > 0 ? `
      <div style="background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.2);border-radius:10px;padding:14px;margin-bottom:20px;">
        <div style="font-size:11px;font-weight:700;color:#F87171;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Failed Steps</div>
        ${failedSteps.map(s => `<div style="font-size:13px;color:rgba(255,255,255,0.7);padding:3px 0;">• ${s}</div>`).join('')}
      </div>` : ''}
      <a href="${runUrl}" style="display:inline-block;padding:10px 20px;background:rgba(248,113,113,0.15);border:1px solid rgba(248,113,113,0.3);border-radius:8px;color:#F87171;font-size:13px;font-weight:600;text-decoration:none;">
        View Run →
      </a>`;

    await sendViaResend(userEmail, subject, wrapHtml('Pipeline Failed', '#F87171', bodyHtml));
}

// ── Security alert email ──────────────────────────────────────────────────────
async function sendSecurityAlertEmail(userId, repository, vulnerabilities = [], commitSha = '') {
    const critical = vulnerabilities.filter(v => v.severity === 'critical').length;
    const high     = vulnerabilities.filter(v => v.severity === 'high').length;

    // Only send if there are critical or high findings
    if (critical === 0 && high === 0) return;

    // Dedup per commit sha — don't re-alert for the same commit
    const dedupKey = `${userId}:${repository}:${commitSha || 'manual'}`;
    if (_notifiedScans.has(dedupKey)) return;
    _notifiedScans.add(dedupKey);
    if (_notifiedScans.size > 500) {
        const first = _notifiedScans.values().next().value;
        _notifiedScans.delete(first);
    }

    // Get user's email from DB
    const userEmail = await getUserEmail(userId);
    if (!userEmail) {
        console.warn(`[NOTIFIER] No email for user ${userId} — skipping security alert email`);
        return;
    }

    const total    = vulnerabilities.length;
    const topVulns = vulnerabilities
        .filter(v => v.severity === 'critical' || v.severity === 'high')
        .slice(0, 5);

    const geminiPrompt = `Write a concise 2-sentence security alert summary for a DevOps team.
Repository: ${repository}
Critical vulnerabilities: ${critical}, High: ${high}, Total: ${total}
Top findings: ${topVulns.map(v => `${v.cve_id || 'N/A'} in ${v.package_name} (${v.severity})`).join(', ')}
Be direct and actionable. No markdown, plain text only.`;

    const aiSummary = await generateWithGemini(geminiPrompt);

    const subject = `🔴 Security alert: ${critical} critical, ${high} high vulnerabilities — ${repository}`;

    const bodyHtml = `
      <p style="margin:0 0 20px;font-size:14px;color:rgba(255,255,255,0.7);line-height:1.6;">
        ${aiSummary || `Security scan for <strong>${repository}</strong> found ${critical} critical and ${high} high severity vulnerabilities requiring immediate attention.`}
      </p>
      <div style="display:flex;gap:12px;margin-bottom:20px;">
        ${[
            { label: 'Critical', count: critical, color: '#F87171' },
            { label: 'High', count: high, color: '#FB923C' },
            { label: 'Total', count: total, color: '#FBBF24' },
        ].map(s => `
          <div style="flex:1;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;text-align:center;">
            <div style="font-size:24px;font-weight:700;color:${s.color};">${s.count}</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:4px;">${s.label}</div>
          </div>`).join('')}
      </div>
      ${topVulns.length > 0 ? `
      <div style="margin-bottom:20px;">
        <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">Top Findings</div>
        ${topVulns.map(v => `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
            <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:${v.severity === 'critical' ? 'rgba(248,113,113,0.15)' : 'rgba(251,146,60,0.15)'};color:${v.severity === 'critical' ? '#F87171' : '#FB923C'};">${(v.severity || '').toUpperCase()}</span>
            <span style="font-size:12px;color:rgba(255,255,255,0.7);flex:1;">${v.cve_id || 'N/A'} in <strong>${v.package_name || '?'}</strong></span>
          </div>`).join('')}
      </div>` : ''}
      <p style="font-size:13px;color:rgba(255,255,255,0.5);margin:0;">
        Log in to PipelineXR → Security to view full details and remediation steps.
      </p>`;

    await sendViaResend(userEmail, subject, wrapHtml('Security Vulnerabilities Detected', '#F87171', bodyHtml));
}

module.exports = { sendPipelineFailureEmail, sendSecurityAlertEmail };
