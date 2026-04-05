'use strict';
/**
 * services/pdfReport.js
 * Generates a clean white-theme engineering health report PDF using pdfkit.
 */

function generateReport(doc, { repository, dora, sec, runs, tests }) {
    const PW = 595, PH = 842, ML = 48, MR = 48, CW = PW - ML - MR;

    // ── Design tokens — clean white theme ────────────────────────────────────
    const C = {
        white: '#FFFFFF', bg: '#F8F9FC', surface: '#FFFFFF', border: '#E2E8F0',
        text: '#1A202C', muted: '#64748B', faint: '#94A3B8',
        accent: '#3B82F6', green: '#059669', amber: '#D97706',
        red: '#DC2626', blue: '#2563EB', purple: '#7C3AED',
    };

    const statusColor = (rate) => rate >= 90 ? C.green : rate >= 70 ? C.amber : C.red;
    const statusLabel = (rate) => rate >= 90 ? 'Healthy' : rate >= 70 ? 'Needs Attention' : 'Failing';

    const rule = (y, color = C.border) => {
        doc.moveTo(ML, y).lineTo(PW - MR, y).strokeColor(color).lineWidth(0.5).stroke();
    };

    const sectionHead = (title, sub, iconColor = C.accent) => {
        const y = doc.y + 14;
        doc.rect(ML, y, 4, 16).fill(iconColor);
        doc.fillColor(C.text).fontSize(12).font('Helvetica-Bold').text(title, ML + 12, y + 1);
        if (sub) {
            doc.fillColor(C.muted).fontSize(8.5).font('Helvetica').text(sub, ML + 12, y + 16);
            doc.y = y + 32;
        } else {
            doc.y = y + 22;
        }
    };

    const badgeFn = (x, y, label, bgColor, textColor) => {
        doc.rect(x, y, 70, 18).fill(bgColor);
        doc.fillColor(textColor).fontSize(8).font('Helvetica-Bold')
           .text(label, x, y + 5, { width: 70, align: 'center' });
    };

    const kpiCard = (x, y, value, label, color, w = 98, h = 58) => {
        doc.rect(x, y, w, h).fill(C.surface);
        doc.rect(x, y, w, h).strokeColor(C.border).lineWidth(0.5).stroke();
        doc.rect(x, y, w, 3).fill(color);
        doc.fillColor(color).fontSize(20).font('Helvetica-Bold')
           .text(String(value), x + 8, y + 12, { width: w - 16 });
        doc.fillColor(C.muted).fontSize(7.5).font('Helvetica')
           .text(label.toUpperCase(), x + 8, y + 38, { width: w - 16, characterSpacing: 0.3 });
    };

    const checkPageBreak = (needed = 60) => {
        if (doc.y + needed > PH - 40) {
            doc.addPage();
            doc.rect(0, 0, PW, PH).fill(C.bg);
            doc.y = 40;
        }
    };

    // ── Page 1 header ─────────────────────────────────────────────────────────
    doc.rect(0, 0, PW, PH).fill(C.bg);
    doc.rect(0, 0, PW, 80).fill(C.accent);
    doc.rect(0, 76, PW, 4).fill(C.blue);
    doc.rect(ML, 18, 40, 40).fill('rgba(255,255,255,0.2)');
    doc.fillColor(C.white).fontSize(14).font('Helvetica-Bold').text('PXR', ML + 7, 30);
    doc.fillColor(C.white).fontSize(22).font('Helvetica-Bold')
       .text('Engineering Health Report', ML + 54, 18, { width: CW - 54 });
    doc.fillColor('rgba(255,255,255,0.8)').fontSize(10).font('Helvetica')
       .text(repository || 'All Repositories', ML + 54, 46, { width: CW - 54 });
    doc.fillColor('rgba(255,255,255,0.65)').fontSize(8).font('Helvetica')
       .text(
           `Generated: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}   ·   Period: Last 30 days`,
           ML + 54, 62, { width: CW - 54 }
       );
    doc.y = 96;

    // ── Computed values ───────────────────────────────────────────────────────
    const successRate  = dora.successRate ?? dora.success_rate ?? null;
    const avgBuild     = dora.avgBuildDuration ?? dora.avg_build_duration ?? null;
    const totalDeploys = parseInt(dora.totalDeployments ?? dora.total_deployments ?? 0, 10);
    const grade        = dora.performanceGrade || dora.performance_grade || '—';
    const critical     = parseInt(sec.critical || 0, 10);
    const high         = parseInt(sec.high     || 0, 10);
    const medium       = parseInt(sec.medium   || 0, 10);
    const low          = parseInt(sec.low      || 0, 10);
    const secTotal     = critical + high + medium + low;
    const total        = runs.length;
    const succRuns     = runs.filter(r => r.conclusion === 'success').length;
    const failRuns     = runs.filter(r => r.conclusion === 'failure').length;
    const gradeColors  = { Elite: C.green, High: C.blue, Medium: C.amber, Low: C.red };

    let testTotal = 0, testPassed = 0, testFailed = 0;
    for (const t of tests) {
        testTotal  += parseInt(t.total_tests, 10) || 0;
        testPassed += parseInt(t.passed,      10) || 0;
        testFailed += parseInt(t.failed,      10) || 0;
    }
    const testRate = testTotal > 0 ? Math.round((testPassed / testTotal) * 100) : null;

    // ── Executive Summary ─────────────────────────────────────────────────────
    doc.fillColor(C.muted).fontSize(8).font('Helvetica-Bold')
       .text('EXECUTIVE SUMMARY', ML, doc.y + 8, { characterSpacing: 1 });
    doc.y += 20;

    const kpiY = doc.y, kpiW = 98, kpiGap = 5;
    kpiCard(ML,                   kpiY, totalDeploys, 'Deployments', C.blue, kpiW);
    kpiCard(ML + (kpiW+kpiGap),   kpiY, successRate != null ? `${Math.round(successRate)}%` : '—', 'Success Rate', statusColor(successRate ?? 0), kpiW);
    kpiCard(ML + (kpiW+kpiGap)*2, kpiY, avgBuild != null ? `${Math.round(avgBuild)}m` : '—', 'Avg Build', C.purple, kpiW);
    kpiCard(ML + (kpiW+kpiGap)*3, kpiY, grade, 'DORA Grade', gradeColors[grade] || C.muted, kpiW);
    kpiCard(ML + (kpiW+kpiGap)*4, kpiY, secTotal > 0 ? secTotal : '✓', 'Open Vulns', secTotal > 0 ? C.red : C.green, kpiW);
    doc.y = kpiY + 68;

    const healthScore = Math.round(
        (successRate ?? 50) * 0.4 +
        (testRate ?? 50) * 0.2 +
        (secTotal === 0 ? 100 : Math.max(0, 100 - secTotal * 3)) * 0.4
    );
    const healthColor = healthScore >= 80 ? C.green : healthScore >= 60 ? C.amber : C.red;
    const healthLbl   = healthScore >= 80 ? 'Good' : healthScore >= 60 ? 'Needs Attention' : 'At Risk';

    doc.rect(ML, doc.y, CW, 30).fill(C.surface);
    doc.rect(ML, doc.y, CW, 30).strokeColor(C.border).lineWidth(0.5).stroke();
    doc.rect(ML, doc.y, 4, 30).fill(healthColor);
    doc.fillColor(C.text).fontSize(9).font('Helvetica-Bold')
       .text('Overall Health Score', ML + 14, doc.y + 8);
    doc.fillColor(healthColor).fontSize(16).font('Helvetica-Bold')
       .text(`${healthScore}/100 — ${healthLbl}`, ML + 180, doc.y - 8, { width: CW - 190 });
    doc.y += 42;
    rule(doc.y); doc.y += 4;

    // ── DORA ──────────────────────────────────────────────────────────────────
    sectionHead('DORA Performance Metrics', 'Industry-standard DevOps benchmarks · Last 30 days', C.blue);

    const doraRows = [
        ['Deployment Frequency', totalDeploys > 0 ? `${totalDeploys} deployments` : 'No data',
            totalDeploys > 0 ? C.green : C.muted,
            totalDeploys >= 10 ? 'Elite' : totalDeploys >= 5 ? 'High' : totalDeploys >= 1 ? 'Medium' : 'Low'],
        ['Pipeline Success Rate', successRate != null ? `${Math.round(successRate)}%` : 'No data',
            statusColor(successRate ?? 0),
            successRate >= 95 ? 'Elite' : successRate >= 80 ? 'High' : successRate >= 60 ? 'Medium' : 'Low'],
        ['Average Build Duration', avgBuild != null ? `${Math.round(avgBuild)} minutes` : 'No data',
            avgBuild < 10 ? C.green : avgBuild < 20 ? C.amber : C.red,
            avgBuild < 10 ? 'Elite' : avgBuild < 20 ? 'High' : 'Medium'],
        ['DORA Performance Grade', grade, gradeColors[grade] || C.muted, grade],
    ];

    const dh = doc.y;
    doc.rect(ML, dh, CW, 16).fill('#EFF6FF');
    let dtx = ML;
    [['METRIC', 185], ['VALUE', 165], ['BENCHMARK', 100]].forEach(([h, w]) => {
        doc.fillColor(C.blue).fontSize(7.5).font('Helvetica-Bold')
           .text(h, dtx + 4, dh + 4, { width: w, characterSpacing: 0.5 });
        dtx += w + 15;
    });
    doc.y = dh + 20;

    doraRows.forEach(([label, value, color, bench], i) => {
        const y = doc.y;
        if (i % 2 === 0) doc.rect(ML, y - 2, CW, 18).fill('#F8FAFF');
        doc.fillColor(C.text).fontSize(9).font('Helvetica').text(label, ML + 8, y + 2, { width: 185 });
        doc.fillColor(color).fontSize(9).font('Helvetica-Bold').text(value, ML + 210, y + 2, { width: 165 });
        const bColor = bench === 'Elite' ? C.green : bench === 'High' ? C.blue : bench === 'Medium' ? C.amber : C.red;
        badgeFn(ML + 390, y, bench, bColor + '22', bColor);
        doc.moveDown(0.9);
    });
    doc.y += 6; rule(doc.y); doc.y += 4;

    // ── Security ──────────────────────────────────────────────────────────────
    checkPageBreak(120);
    sectionHead('Security Posture', 'Open vulnerabilities by severity', C.red);

    const posture = critical > 0 ? 'CRITICAL' : high > 0 ? 'AT RISK' : secTotal > 0 ? 'MONITOR' : 'SECURE';
    const postureColor = critical > 0 ? C.red : high > 0 ? C.amber : secTotal > 0 ? C.amber : C.green;
    const pbY = doc.y;
    doc.rect(ML, pbY, 90, 22).fill(postureColor + '18');
    doc.rect(ML, pbY, 90, 22).strokeColor(postureColor).lineWidth(0.5).stroke();
    doc.fillColor(postureColor).fontSize(10).font('Helvetica-Bold')
       .text(posture, ML, pbY + 6, { width: 90, align: 'center' });
    doc.fillColor(C.muted).fontSize(8.5).font('Helvetica')
       .text(`${secTotal} total open vulnerabilities`, ML + 100, pbY + 7);
    doc.y = pbY + 32;

    const maxSev = Math.max(critical, high, medium, low, 1);
    [
        { label: 'Critical', count: critical, color: C.red,    desc: 'Immediate action required' },
        { label: 'High',     count: high,     color: C.amber,  desc: 'Fix within 24 hours' },
        { label: 'Medium',   count: medium,   color: '#F59E0B', desc: 'Fix this sprint' },
        { label: 'Low',      count: low,      color: C.blue,   desc: 'Low priority' },
    ].forEach(({ label, count, color, desc }) => {
        const y = doc.y;
        const barW = Math.max(count > 0 ? 4 : 0, Math.round((count / maxSev) * (CW - 220)));
        doc.fillColor(C.text).fontSize(9).font('Helvetica-Bold').text(label, ML, y + 2, { width: 60 });
        doc.fillColor(C.muted).fontSize(8).font('Helvetica').text(desc, ML + 65, y + 3, { width: 130 });
        doc.rect(ML + 200, y + 4, CW - 240, 8).fill('#F1F5F9');
        if (barW > 0) doc.rect(ML + 200, y + 4, barW, 8).fill(color);
        doc.fillColor(count > 0 ? color : C.faint).fontSize(10).font('Helvetica-Bold')
           .text(String(count), ML + 200 + (CW - 240) + 8, y, { width: 30 });
        doc.moveDown(1.1);
    });
    doc.y += 4; rule(doc.y); doc.y += 4;

    // ── Test Results ──────────────────────────────────────────────────────────
    checkPageBreak(80);
    sectionHead('Test Results', 'From recorded workflow runs', C.purple);

    if (testTotal === 0) {
        doc.fillColor(C.muted).fontSize(9).font('Helvetica')
           .text('No test data recorded. Sync reports to populate test results.', ML, doc.y + 4);
        doc.y += 20;
    } else {
        const tKpiY = doc.y, tW = 118;
        kpiCard(ML,            tKpiY, testTotal,  'Total Tests', C.blue,   tW);
        kpiCard(ML + tW + 6,   tKpiY, testPassed, 'Passed',      C.green,  tW);
        kpiCard(ML + (tW+6)*2, tKpiY, testFailed, 'Failed',      testFailed > 0 ? C.red : C.green, tW);
        kpiCard(ML + (tW+6)*3, tKpiY, testRate != null ? `${testRate}%` : '—', 'Pass Rate', statusColor(testRate ?? 0), tW);
        doc.y = tKpiY + 70;
    }
    rule(doc.y); doc.y += 4;

    // ── Pipeline Reliability ──────────────────────────────────────────────────
    checkPageBreak(100);
    sectionHead('Pipeline Reliability', `Based on last ${total} runs`, C.green);

    const byWorkflow = {};
    for (const r of runs) {
        const wfName = r.workflow_name || 'Unknown';
        if (!byWorkflow[wfName]) byWorkflow[wfName] = { total: 0, success: 0 };
        byWorkflow[wfName].total++;
        if (r.conclusion === 'success') byWorkflow[wfName].success++;
    }
    const workflows = Object.entries(byWorkflow)
        .map(([name, d]) => ({ name, total: d.total, rate: Math.round((d.success / d.total) * 100) }))
        .sort((a, b) => a.rate - b.rate);

    if (workflows.length > 0) {
        const wh = doc.y;
        doc.rect(ML, wh, CW, 16).fill('#F0FDF4');
        const wCols = [220, 60, 80, 100];
        let wtx = ML;
        ['Workflow', 'Runs', 'Pass Rate', 'Health'].forEach((h, i) => {
            doc.fillColor(C.green).fontSize(7.5).font('Helvetica-Bold')
               .text(h, wtx + 4, wh + 4, { width: wCols[i], characterSpacing: 0.3 });
            wtx += wCols[i];
        });
        doc.y = wh + 20;

        workflows.forEach((w, idx) => {
            checkPageBreak(20);
            wtx = ML;
            const ty2 = doc.y;
            if (idx % 2 === 0) doc.rect(ML, ty2 - 2, CW, 16).fill('#F8FFF8');
            const wColor = statusColor(w.rate);
            [w.name.slice(0, 32), String(w.total), `${w.rate}%`, statusLabel(w.rate)].forEach((cell, i) => {
                doc.fillColor(i < 2 ? C.text : wColor)
                   .fontSize(8.5).font(i >= 2 ? 'Helvetica-Bold' : 'Helvetica')
                   .text(cell, wtx + 4, ty2, { width: wCols[i] });
                wtx += wCols[i];
            });
            doc.moveDown(0.85);
        });
    }
    doc.y += 8; rule(doc.y); doc.y += 4;

    // ── Recent Builds ─────────────────────────────────────────────────────────
    checkPageBreak(80);
    sectionHead('Recent Builds', 'Last 20 pipeline runs', C.muted);

    const bCols = [50, 185, 85, 65, 75];
    const bh = doc.y;
    doc.rect(ML, bh, CW, 16).fill('#F8F9FC');
    let tx3 = ML;
    ['Build', 'Commit / Workflow', 'Branch', 'Duration', 'Date'].forEach((h, i) => {
        doc.fillColor(C.muted).fontSize(7.5).font('Helvetica-Bold')
           .text(h, tx3 + 4, bh + 4, { width: bCols[i], characterSpacing: 0.3 });
        tx3 += bCols[i];
    });
    doc.y = bh + 20;

    runs.slice(0, 20).forEach((r, idx) => {
        checkPageBreak(18);
        tx3 = ML;
        const ty4 = doc.y;
        if (idx % 2 === 0) doc.rect(ML, ty4 - 2, CW, 16).fill('#FAFAFA');
        const cColor = r.conclusion === 'success' ? C.green : r.conclusion === 'failure' ? C.red : C.amber;
        const commitMsg = (r.head_commit_message || r.workflow_name || '—').split('\n')[0].slice(0, 34);
        const dur = r.duration_seconds ? `${Math.round(r.duration_seconds / 60)}m ${r.duration_seconds % 60}s` : '—';
        const date = r.run_started_at ? new Date(r.run_started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
        [`#${r.run_number || '—'}`, commitMsg, r.head_branch || '—', dur, date].forEach((cell, i) => {
            doc.fillColor(i === 0 ? cColor : i === 1 ? C.text : C.muted)
               .fontSize(8.5).font(i === 0 ? 'Helvetica-Bold' : 'Helvetica')
               .text(cell, tx3 + 4, ty4, { width: bCols[i] });
            tx3 += bCols[i];
        });
        doc.moveDown(0.85);
    });

    // ── Footer on every page ──────────────────────────────────────────────────
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc.rect(0, PH - 30, PW, 30).fill('#F1F5F9');
        doc.moveTo(0, PH - 30).lineTo(PW, PH - 30).strokeColor(C.border).lineWidth(0.5).stroke();
        doc.fillColor(C.muted).fontSize(7.5).font('Helvetica')
           .text(`PipelineXR  ·  ${repository || 'All Repositories'}  ·  ${new Date().toISOString().split('T')[0]}`, ML, PH - 18, { width: CW - 60 });
        doc.fillColor(C.muted).fontSize(7.5).font('Helvetica')
           .text(`Page ${i + 1} of ${pageCount}`, PW - MR - 50, PH - 18, { width: 50, align: 'right' });
    }
}

module.exports = { generateReport };
