'use strict';
/**
 * services/pdfReport.js
 * Professional Engineering Health Report — PipelineXR
 *
 * Page flow:
 *   Page 1 — Cover + Executive Summary (KPIs + health score + period-over-period)
 *   Page 2 — DORA Metrics (detailed + comparison table)
 *   Page 2+ — Security Posture
 *   Page 2+ — Pipeline Reliability (workflow breakdown)
 *   Page 2+ — Test Results
 *   Page 2+ — Recent Builds log
 *   Every page — consistent header band + footer
 */

function generateReport(doc, { repository, dora, doraPrev = {}, sec, runs, tests }) {
    const PW = 595, PH = 842, ML = 48, MR = 48, CW = PW - ML - MR;

    // ── Design tokens ─────────────────────────────────────────────────────────
    const C = {
        white:       '#FFFFFF',
        bg:          '#F7F8FA',
        surface:     '#FFFFFF',
        border:      '#DDE3ED',
        text:        '#1A202C',
        muted:       '#5A6A85',
        faint:       '#9AAABB',
        accent:      '#2563EB',
        green:       '#16A34A', greenLight: '#DCFCE7', greenText: '#15803D',
        amber:       '#B45309', amberLight: '#FEF3C7', amberText: '#92400E',
        red:         '#DC2626', redLight:   '#FEE2E2', redText:   '#991B1B',
        blue:        '#1D4ED8', blueLight:  '#DBEAFE', blueText:  '#1E40AF',
        purple:      '#6D28D9', purpleLight:'#EDE9FE', purpleText:'#5B21B6',
        rowAlt:      '#F9FAFB',
        headerBg:    '#F1F5F9',
        coverAccent: '#1E3A8A',
    };

    // ── Helpers ───────────────────────────────────────────────────────────────
    const statusColor     = (r) => r >= 90 ? C.green  : r >= 70 ? C.amber  : C.red;
    const statusColorText = (r) => r >= 90 ? C.greenText : r >= 70 ? C.amberText : C.redText;
    const statusLabel     = (r) => r >= 90 ? 'Healthy' : r >= 70 ? 'Needs Attention' : 'Failing';

    const rule = (y, color = C.border, lw = 0.5) =>
        doc.moveTo(ML, y).lineTo(PW - MR, y).strokeColor(color).lineWidth(lw).stroke();

    const fullRule = (y, color = C.border) =>
        doc.moveTo(0, y).lineTo(PW, y).strokeColor(color).lineWidth(0.5).stroke();

    // Trend arrow + delta — returns { arrow, color, delta }
    const trend = (curr, prev) => {
        if (prev == null || prev === 0 || curr == null) return null;
        const delta = Math.round(((curr - prev) / Math.abs(prev)) * 100);
        if (delta === 0) return { arrow: '→', color: C.muted, delta: '0%' };
        return delta > 0
            ? { arrow: '↑', color: C.greenText, delta: `+${delta}%` }
            : { arrow: '↓', color: C.redText,   delta: `${delta}%` };
    };

    const checkPageBreak = (needed = 60) => {
        if (doc.y + needed > PH - 50) {
            doc.addPage();
            doc.rect(0, 0, PW, PH).fill(C.bg);
            // Continuation header band
            doc.rect(0, 0, PW, 28).fill(C.accent);
            doc.fillColor(C.white).fontSize(7.5).font('Helvetica-Bold')
               .text('PipelineXR  ·  Engineering Health Report', ML, 10, { width: CW - 100 });
            doc.fillColor('#93C5FD').fontSize(7.5).font('Helvetica')
               .text(repository || 'All Repositories', PW - MR - 160, 10, { width: 160, align: 'right' });
            doc.y = 44;
        }
    };

    const sectionHead = (title, sub, iconColor = C.accent) => {
        checkPageBreak(50);
        const y = doc.y + 10;
        doc.rect(ML, y, 4, sub ? 28 : 18).fill(iconColor);
        doc.fillColor(C.text).fontSize(11).font('Helvetica-Bold').text(title, ML + 12, y + 1);
        if (sub) {
            doc.fillColor(C.muted).fontSize(8).font('Helvetica').text(sub, ML + 12, y + 15);
            doc.y = y + 34;
        } else {
            doc.y = y + 24;
        }
    };

    // Badge with solid light bg + dark text
    const badge = (x, y, label, bgColor, textColor, w = 68) => {
        doc.rect(x, y, w, 16).fill(bgColor);
        doc.fillColor(textColor).fontSize(7.5).font('Helvetica-Bold')
           .text(label, x, y + 4, { width: w, align: 'center' });
    };

    // KPI card: top color bar, large value, label
    const kpiCard = (x, y, value, label, barColor, valColor, w = 98, h = 56) => {
        doc.rect(x, y, w, h).fill(C.surface);
        doc.rect(x, y, w, h).strokeColor(C.border).lineWidth(0.5).stroke();
        doc.rect(x, y, w, 3).fill(barColor);
        doc.fillColor(valColor).fontSize(19).font('Helvetica-Bold')
           .text(String(value), x + 8, y + 11, { width: w - 16 });
        doc.fillColor(C.muted).fontSize(7).font('Helvetica')
           .text(label.toUpperCase(), x + 8, y + 36, { width: w - 16, characterSpacing: 0.3 });
    };

    // Comparison row: metric | current | prev | delta
    const compRow = (label, curr, prev, currColor, trendObj, i) => {
        const y = doc.y;
        if (i % 2 === 0) doc.rect(ML, y - 2, CW, 18).fill(C.rowAlt);
        doc.fillColor(C.text).fontSize(8.5).font('Helvetica')
           .text(label, ML + 8, y + 2, { width: 170 });
        doc.fillColor(currColor).fontSize(8.5).font('Helvetica-Bold')
           .text(curr, ML + 185, y + 2, { width: 110 });
        doc.fillColor(C.muted).fontSize(8.5).font('Helvetica')
           .text(prev || '—', ML + 300, y + 2, { width: 110 });
        if (trendObj) {
            doc.fillColor(trendObj.color).fontSize(9).font('Helvetica-Bold')
               .text(`${trendObj.arrow} ${trendObj.delta}`, ML + 415, y + 2, { width: 80 });
        } else {
            doc.fillColor(C.faint).fontSize(8.5).font('Helvetica')
               .text('—', ML + 415, y + 2, { width: 80 });
        }
        doc.moveDown(0.9);
    };

    // ── Computed values ───────────────────────────────────────────────────────
    const successRate  = dora.successRate     ?? dora.success_rate     ?? null;
    const avgBuild     = dora.avgBuildDuration ?? dora.avg_build_duration ?? null;
    const totalDeploys = parseInt(dora.totalDeployments ?? dora.total_deployments ?? 0, 10);
    const deployFreq   = dora.deploymentFrequency ?? dora.deployment_frequency ?? null;
    const grade        = dora.performanceGrade || dora.performance_grade || '—';

    // Previous period
    const prevSuccessRate  = doraPrev.successRate     ?? doraPrev.success_rate     ?? null;
    const prevAvgBuild     = doraPrev.avgBuildDuration ?? doraPrev.avg_build_duration ?? null;
    const prevTotalDeploys = parseInt(doraPrev.totalDeployments ?? doraPrev.total_deployments ?? 0, 10);
    const prevDeployFreq   = doraPrev.deploymentFrequency ?? doraPrev.deployment_frequency ?? null;

    const critical = parseInt(sec.critical || 0, 10);
    const high     = parseInt(sec.high     || 0, 10);
    const medium   = parseInt(sec.medium   || 0, 10);
    const low      = parseInt(sec.low      || 0, 10);
    const secTotal = critical + high + medium + low;

    const total    = runs.length;
    const failRuns = runs.filter(r => r.conclusion === 'failure').length;

    let testTotal = 0, testPassed = 0, testFailed = 0;
    for (const t of tests) {
        testTotal  += parseInt(t.total_tests, 10) || 0;
        testPassed += parseInt(t.passed,      10) || 0;
        testFailed += parseInt(t.failed,      10) || 0;
    }
    const testRate = testTotal > 0 ? Math.round((testPassed / testTotal) * 100) : null;

    const healthScore = Math.round(
        (successRate ?? 50) * 0.4 +
        (testRate    ?? 50) * 0.2 +
        (secTotal === 0 ? 100 : Math.max(0, 100 - secTotal * 3)) * 0.4
    );
    const healthColor     = healthScore >= 80 ? C.green  : healthScore >= 60 ? C.amber  : C.red;
    const healthColorText = healthScore >= 80 ? C.greenText : healthScore >= 60 ? C.amberText : C.redText;
    const healthLbl       = healthScore >= 80 ? 'Good'   : healthScore >= 60 ? 'Needs Attention' : 'At Risk';

    const gradeColors     = { Elite: C.green,     High: C.blue,     Medium: C.amber,     Low: C.red };
    const gradeTextColors = { Elite: C.greenText, High: C.blueText, Medium: C.amberText, Low: C.redText };

    const now      = new Date();
    const dateStr  = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const isoDate  = now.toISOString().split('T')[0];
    const periodEnd   = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const periodStart = new Date(now - 30 * 864e5).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const prevStart   = new Date(now - 60 * 864e5).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const prevEnd     = new Date(now - 31 * 864e5).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    // ═══════════════════════════════════════════════════════════════════════════
    // PAGE 1 — COVER + EXECUTIVE SUMMARY
    // ═══════════════════════════════════════════════════════════════════════════
    doc.rect(0, 0, PW, PH).fill(C.bg);

    // Cover header band
    doc.rect(0, 0, PW, 110).fill(C.accent);
    doc.rect(0, 106, PW, 4).fill(C.coverAccent);

    // Logo box
    doc.rect(ML, 22, 44, 44).fill('rgba(255,255,255,0.12)');
    doc.rect(ML, 22, 44, 44).strokeColor('rgba(255,255,255,0.2)').lineWidth(0.5).stroke();
    doc.fillColor(C.white).fontSize(13).font('Helvetica-Bold').text('PXR', ML + 8, 36);

    // Title block
    doc.fillColor(C.white).fontSize(24).font('Helvetica-Bold')
       .text('Engineering Health Report', ML + 58, 22, { width: CW - 58 });
    doc.fillColor('#93C5FD').fontSize(11).font('Helvetica')
       .text(repository || 'All Repositories', ML + 58, 52, { width: CW - 58 });
    doc.fillColor('#BFDBFE').fontSize(8.5).font('Helvetica')
       .text(`Generated: ${dateStr}`, ML + 58, 70, { width: CW - 58 });
    doc.fillColor('#BFDBFE').fontSize(8.5).font('Helvetica')
       .text(`Report Period: ${periodStart} – ${periodEnd}  ·  Comparison: ${prevStart} – ${prevEnd}`, ML + 58, 84, { width: CW - 58 });

    doc.y = 126;

    // ── Section: Executive Summary ────────────────────────────────────────────
    doc.fillColor(C.muted).fontSize(7.5).font('Helvetica-Bold')
       .text('EXECUTIVE SUMMARY', ML, doc.y, { characterSpacing: 1.2 });
    doc.y += 14;

    // 5 KPI cards
    const kpiY = doc.y, kpiW = 97, kpiGap = 5;
    kpiCard(ML,                    kpiY, totalDeploys,
        'Total Deployments', C.blue, C.blueText, kpiW);
    kpiCard(ML + (kpiW+kpiGap),    kpiY, successRate != null ? `${Math.round(successRate)}%` : '—',
        'Pipeline Success', statusColor(successRate ?? 0), statusColorText(successRate ?? 0), kpiW);
    kpiCard(ML + (kpiW+kpiGap)*2,  kpiY, avgBuild != null ? `${Math.round(avgBuild)}m` : '—',
        'Avg Build Time', C.purple, C.purpleText, kpiW);
    kpiCard(ML + (kpiW+kpiGap)*3,  kpiY, grade,
        'DORA Grade', gradeColors[grade] || C.muted, gradeTextColors[grade] || C.muted, kpiW);
    kpiCard(ML + (kpiW+kpiGap)*4,  kpiY, secTotal > 0 ? secTotal : '✓',
        'Open Vulnerabilities', secTotal > 0 ? C.red : C.green, secTotal > 0 ? C.redText : C.greenText, kpiW);
    doc.y = kpiY + 66;

    // Overall health score bar
    const hY = doc.y + 8;
    doc.rect(ML, hY, CW, 34).fill(C.surface);
    doc.rect(ML, hY, CW, 34).strokeColor(C.border).lineWidth(0.5).stroke();
    doc.rect(ML, hY, 4, 34).fill(healthColor);
    doc.fillColor(C.muted).fontSize(7.5).font('Helvetica-Bold')
       .text('OVERALL HEALTH SCORE', ML + 14, hY + 6, { characterSpacing: 0.8 });
    doc.fillColor(healthColorText).fontSize(18).font('Helvetica-Bold')
       .text(`${healthScore} / 100`, ML + 14, hY + 16);
    doc.fillColor(healthColorText).fontSize(9).font('Helvetica-Bold')
       .text(`— ${healthLbl}`, ML + 90, hY + 20);
    // Mini progress bar
    const barX = ML + 220, barW2 = CW - 240, barH = 8;
    doc.rect(barX, hY + 13, barW2, barH).fill(C.headerBg);
    doc.rect(barX, hY + 13, Math.round((healthScore / 100) * barW2), barH).fill(healthColor);
    doc.fillColor(C.muted).fontSize(7.5).font('Helvetica')
       .text(`${failRuns} failed runs  ·  ${secTotal} open vulns  ·  ${testRate != null ? testRate + '% test pass rate' : 'no test data'}`,
           barX, hY + 24, { width: barW2 });
    doc.y = hY + 50;

    rule(doc.y); doc.y += 10;

    // ── Section: Period-over-Period Comparison ────────────────────────────────
    doc.fillColor(C.muted).fontSize(7.5).font('Helvetica-Bold')
       .text('PERIOD-OVER-PERIOD COMPARISON', ML, doc.y, { characterSpacing: 1.2 });
    doc.y += 14;

    // Table header
    const compY = doc.y;
    doc.rect(ML, compY, CW, 18).fill(C.headerBg);
    doc.rect(ML, compY, CW, 18).strokeColor(C.border).lineWidth(0.5).stroke();
    doc.fillColor(C.muted).fontSize(7.5).font('Helvetica-Bold')
       .text('METRIC',                ML + 8,   compY + 5, { width: 170, characterSpacing: 0.4 });
    doc.fillColor(C.accent).fontSize(7.5).font('Helvetica-Bold')
       .text(`THIS PERIOD (${periodStart}–${periodEnd})`, ML + 185, compY + 5, { width: 110, characterSpacing: 0.3 });
    doc.fillColor(C.muted).fontSize(7.5).font('Helvetica-Bold')
       .text(`PREV PERIOD (${prevStart}–${prevEnd})`,     ML + 300, compY + 5, { width: 110, characterSpacing: 0.3 });
    doc.fillColor(C.muted).fontSize(7.5).font('Helvetica-Bold')
       .text('CHANGE', ML + 415, compY + 5, { width: 80, characterSpacing: 0.4 });
    doc.y = compY + 22;

    const compRows = [
        {
            label: 'Total Deployments',
            curr: totalDeploys > 0 ? `${totalDeploys} deploys` : 'No data',
            prev: prevTotalDeploys > 0 ? `${prevTotalDeploys} deploys` : '—',
            currColor: totalDeploys > 0 ? C.blueText : C.muted,
            trendObj: trend(totalDeploys, prevTotalDeploys),
        },
        {
            label: 'Pipeline Success Rate',
            curr: successRate != null ? `${Math.round(successRate)}%` : 'No data',
            prev: prevSuccessRate != null ? `${Math.round(prevSuccessRate)}%` : '—',
            currColor: statusColorText(successRate ?? 0),
            trendObj: trend(successRate, prevSuccessRate),
        },
        {
            label: 'Avg Build Duration',
            curr: avgBuild != null ? `${Math.round(avgBuild)} min` : 'No data',
            prev: prevAvgBuild != null ? `${Math.round(prevAvgBuild)} min` : '—',
            currColor: avgBuild != null ? (avgBuild < 10 ? C.greenText : avgBuild < 20 ? C.amberText : C.redText) : C.muted,
            // For build time, lower is better — invert the trend color
            trendObj: (() => {
                const t2 = trend(avgBuild, prevAvgBuild);
                if (!t2) return null;
                return { ...t2, color: t2.delta.startsWith('+') ? C.redText : C.greenText };
            })(),
        },
        {
            label: 'Deploy Frequency (per day)',
            curr: deployFreq != null ? `${deployFreq}/day` : 'No data',
            prev: prevDeployFreq != null ? `${prevDeployFreq}/day` : '—',
            currColor: C.blueText,
            trendObj: trend(deployFreq, prevDeployFreq),
        },
    ];

    compRows.forEach(({ label, curr, prev, currColor, trendObj }, i) =>
        compRow(label, curr, prev, currColor, trendObj, i));

    doc.y += 6;
    rule(doc.y); doc.y += 6;

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 2 — DORA PERFORMANCE METRICS (detailed)
    // ═══════════════════════════════════════════════════════════════════════════
    sectionHead('DORA Performance Metrics', 'Industry-standard DevOps Research & Assessment benchmarks', C.blue);

    const doraRows = [
        {
            label: 'Deployment Frequency',
            value: totalDeploys > 0 ? `${totalDeploys} deployments` : 'No data',
            color: totalDeploys > 0 ? C.blueText : C.muted,
            bench: totalDeploys >= 10 ? 'Elite' : totalDeploys >= 5 ? 'High' : totalDeploys >= 1 ? 'Medium' : 'Low',
            note: 'Elite: multiple/day  ·  High: weekly  ·  Medium: monthly',
        },
        {
            label: 'Pipeline Success Rate',
            value: successRate != null ? `${Math.round(successRate)}%` : 'No data',
            color: statusColorText(successRate ?? 0),
            bench: successRate >= 95 ? 'Elite' : successRate >= 80 ? 'High' : successRate >= 60 ? 'Medium' : 'Low',
            note: 'Elite: ≥95%  ·  High: ≥80%  ·  Medium: ≥60%',
        },
        {
            label: 'Avg Build Duration',
            value: avgBuild != null ? `${Math.round(avgBuild)} minutes` : 'No data',
            color: avgBuild != null ? (avgBuild < 10 ? C.greenText : avgBuild < 20 ? C.amberText : C.redText) : C.muted,
            bench: avgBuild < 10 ? 'Elite' : avgBuild < 20 ? 'High' : 'Medium',
            note: 'Elite: <10 min  ·  High: <20 min  ·  Medium: <60 min',
        },
        {
            label: 'DORA Performance Grade',
            value: grade,
            color: gradeTextColors[grade] || C.muted,
            bench: grade,
            note: 'Composite score across all four DORA metrics',
        },
    ];

    // Table header
    const dhY = doc.y;
    doc.rect(ML, dhY, CW, 18).fill(C.headerBg);
    doc.rect(ML, dhY, CW, 18).strokeColor(C.border).lineWidth(0.5).stroke();
    [['METRIC', ML + 8, 175], ['VALUE', ML + 190, 130], ['BENCHMARK', ML + 328, 90], ['CONTEXT', ML + 425, 70]].forEach(([h, x, w]) => {
        doc.fillColor(C.muted).fontSize(7.5).font('Helvetica-Bold')
           .text(h, x, dhY + 5, { width: w, characterSpacing: 0.4 });
    });
    doc.y = dhY + 22;

    doraRows.forEach(({ label, value, color, bench, note }, i) => {
        checkPageBreak(22);
        const y = doc.y;
        if (i % 2 === 0) doc.rect(ML, y - 2, CW, 20).fill(C.rowAlt);
        doc.fillColor(C.text).fontSize(8.5).font('Helvetica').text(label, ML + 8, y + 2, { width: 175 });
        doc.fillColor(color).fontSize(8.5).font('Helvetica-Bold').text(value, ML + 190, y + 2, { width: 130 });
        const bBg   = bench === 'Elite' ? C.greenLight  : bench === 'High' ? C.blueLight  : bench === 'Medium' ? C.amberLight  : C.redLight;
        const bText = bench === 'Elite' ? C.greenText   : bench === 'High' ? C.blueText   : bench === 'Medium' ? C.amberText   : C.redText;
        badge(ML + 328, y, bench, bBg, bText, 72);
        doc.fillColor(C.faint).fontSize(7).font('Helvetica').text(note, ML + 408, y + 3, { width: 87 });
        doc.moveDown(1.0);
    });

    doc.y += 6; rule(doc.y); doc.y += 6;

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 3 — SECURITY POSTURE
    // ═══════════════════════════════════════════════════════════════════════════
    checkPageBreak(130);
    sectionHead('Security Posture', 'Open vulnerabilities by severity · Latest scan results', C.red);

    // Posture banner
    const posture      = critical > 0 ? 'CRITICAL RISK' : high > 0 ? 'AT RISK' : secTotal > 0 ? 'MONITOR' : 'SECURE';
    const postureBg    = critical > 0 ? C.redLight    : high > 0 ? C.amberLight : secTotal > 0 ? C.amberLight : C.greenLight;
    const postureText  = critical > 0 ? C.redText     : high > 0 ? C.amberText  : secTotal > 0 ? C.amberText  : C.greenText;
    const postureBdr   = critical > 0 ? C.red         : high > 0 ? C.amber      : secTotal > 0 ? C.amber      : C.green;

    const pbY = doc.y;
    doc.rect(ML, pbY, CW, 28).fill(postureBg);
    doc.rect(ML, pbY, CW, 28).strokeColor(postureBdr).lineWidth(0.5).stroke();
    doc.rect(ML, pbY, 4, 28).fill(postureBdr);
    doc.fillColor(postureText).fontSize(11).font('Helvetica-Bold')
       .text(posture, ML + 14, pbY + 8);
    doc.fillColor(C.muted).fontSize(8.5).font('Helvetica')
       .text(`${secTotal} total open vulnerabilities  ·  ${critical} critical  ·  ${high} high  ·  ${medium} medium  ·  ${low} low`,
           ML + 120, pbY + 10, { width: CW - 130 });
    doc.y = pbY + 38;

    // Severity bars
    const maxSev = Math.max(critical, high, medium, low, 1);
    [
        { label: 'Critical', count: critical, barColor: C.red,    textColor: C.redText,   desc: 'Immediate action required — exploitable in production' },
        { label: 'High',     count: high,     barColor: C.amber,  textColor: C.amberText, desc: 'Fix within 24–48 hours' },
        { label: 'Medium',   count: medium,   barColor: '#D97706', textColor: C.amberText, desc: 'Address this sprint' },
        { label: 'Low',      count: low,      barColor: C.blue,   textColor: C.blueText,  desc: 'Low exploitability — schedule for next cycle' },
    ].forEach(({ label, count, barColor, textColor, desc }) => {
        checkPageBreak(20);
        const y = doc.y;
        const barW = Math.max(count > 0 ? 5 : 0, Math.round((count / maxSev) * (CW - 230)));
        doc.fillColor(C.text).fontSize(9).font('Helvetica-Bold').text(label, ML, y + 2, { width: 58 });
        doc.fillColor(C.muted).fontSize(7.5).font('Helvetica').text(desc, ML + 62, y + 3, { width: 140 });
        doc.rect(ML + 207, y + 3, CW - 248, 9).fill(C.headerBg);
        doc.rect(ML + 207, y + 3, CW - 248, 9).strokeColor(C.border).lineWidth(0.3).stroke();
        if (barW > 0) doc.rect(ML + 207, y + 3, barW, 9).fill(barColor);
        doc.fillColor(count > 0 ? textColor : C.faint).fontSize(10).font('Helvetica-Bold')
           .text(String(count), ML + 207 + (CW - 248) + 8, y, { width: 32 });
        doc.moveDown(1.15);
    });

    doc.y += 4; rule(doc.y); doc.y += 6;

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 4 — PIPELINE RELIABILITY
    // ═══════════════════════════════════════════════════════════════════════════
    checkPageBreak(110);
    sectionHead('Pipeline Reliability', `Workflow breakdown · Based on ${total} runs in this period`, C.green);

    const byWorkflow = {};
    for (const r of runs) {
        const wf = r.workflow_name || 'Unknown';
        if (!byWorkflow[wf]) byWorkflow[wf] = { total: 0, success: 0, durations: [] };
        byWorkflow[wf].total++;
        if (r.conclusion === 'success') byWorkflow[wf].success++;
        if (r.duration_seconds) byWorkflow[wf].durations.push(r.duration_seconds);
    }
    const workflows = Object.entries(byWorkflow)
        .map(([name, d]) => ({
            name,
            total: d.total,
            rate: Math.round((d.success / d.total) * 100),
            avgDur: d.durations.length
                ? Math.round(d.durations.reduce((a, b) => a + b, 0) / d.durations.length / 60)
                : null,
        }))
        .sort((a, b) => a.rate - b.rate);

    if (workflows.length === 0) {
        doc.fillColor(C.muted).fontSize(9).font('Helvetica')
           .text('No pipeline runs recorded for this period.', ML, doc.y + 4);
        doc.y += 20;
    } else {
        const wCols = [190, 55, 75, 70, 95];
        const wh = doc.y;
        doc.rect(ML, wh, CW, 18).fill(C.headerBg);
        doc.rect(ML, wh, CW, 18).strokeColor(C.border).lineWidth(0.5).stroke();
        let wx = ML;
        ['Workflow', 'Runs', 'Pass Rate', 'Avg Build', 'Health'].forEach((h, i) => {
            doc.fillColor(C.muted).fontSize(7.5).font('Helvetica-Bold')
               .text(h, wx + 4, wh + 5, { width: wCols[i], characterSpacing: 0.3 });
            wx += wCols[i];
        });
        doc.y = wh + 22;

        workflows.forEach((w, idx) => {
            checkPageBreak(20);
            wx = ML;
            const ty = doc.y;
            if (idx % 2 === 0) doc.rect(ML, ty - 2, CW, 18).fill(C.rowAlt);
            const wColor = statusColorText(w.rate);
            const bBg   = w.rate >= 90 ? C.greenLight : w.rate >= 70 ? C.amberLight : C.redLight;
            const bText = w.rate >= 90 ? C.greenText  : w.rate >= 70 ? C.amberText  : C.redText;
            const cells = [
                w.name.slice(0, 30),
                String(w.total),
                `${w.rate}%`,
                w.avgDur != null ? `${w.avgDur}m` : '—',
            ];
            cells.forEach((cell, i) => {
                doc.fillColor(i < 2 ? C.text : wColor)
                   .fontSize(8.5).font(i >= 2 ? 'Helvetica-Bold' : 'Helvetica')
                   .text(cell, wx + 4, ty, { width: wCols[i] });
                wx += wCols[i];
            });
            badge(wx, ty - 1, statusLabel(w.rate), bBg, bText, 88);
            doc.moveDown(0.9);
        });
    }

    doc.y += 6; rule(doc.y); doc.y += 6;

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 5 — TEST RESULTS
    // ═══════════════════════════════════════════════════════════════════════════
    checkPageBreak(90);
    sectionHead('Test Results', 'Aggregated from recorded workflow runs', C.purple);

    if (testTotal === 0) {
        doc.fillColor(C.muted).fontSize(9).font('Helvetica')
           .text('No test data recorded. Sync reports to populate test results.', ML, doc.y + 4);
        doc.y += 20;
    } else {
        const tW = 118, tGap = 6;
        const tY = doc.y;
        kpiCard(ML,                tY, testTotal,  'Total Tests',  C.blue,   C.blueText,   tW);
        kpiCard(ML + tW + tGap,    tY, testPassed, 'Passed',       C.green,  C.greenText,  tW);
        kpiCard(ML + (tW+tGap)*2,  tY, testFailed, 'Failed',
            testFailed > 0 ? C.red : C.green,
            testFailed > 0 ? C.redText : C.greenText, tW);
        kpiCard(ML + (tW+tGap)*3,  tY,
            testRate != null ? `${testRate}%` : '—', 'Pass Rate',
            statusColor(testRate ?? 0), statusColorText(testRate ?? 0), tW);
        doc.y = tY + 66;

        if (testRate != null) {
            const tBg = testRate >= 90 ? C.greenLight : testRate >= 70 ? C.amberLight : C.redLight;
            const tTx = testRate >= 90 ? C.greenText  : testRate >= 70 ? C.amberText  : C.redText;
            const tMsg = testRate >= 90
                ? 'Test suite is healthy. Maintain coverage as codebase grows.'
                : testRate >= 70
                ? 'Some test failures detected. Review failing tests before next release.'
                : 'High test failure rate. Investigate root causes before deploying.';
            const tNoteY = doc.y + 4;
            doc.rect(ML, tNoteY, CW, 22).fill(tBg);
            doc.rect(ML, tNoteY, 4, 22).fill(tTx);
            doc.fillColor(tTx).fontSize(8.5).font('Helvetica-Bold')
               .text(tMsg, ML + 12, tNoteY + 7, { width: CW - 20 });
            doc.y = tNoteY + 30;
        }
    }

    doc.y += 4; rule(doc.y); doc.y += 6;

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 6 — RECENT BUILDS LOG
    // ═══════════════════════════════════════════════════════════════════════════
    checkPageBreak(80);
    sectionHead('Recent Builds', 'Last 20 pipeline runs — most recent first', C.muted);

    const bCols = [46, 180, 82, 62, 72, 55];
    const bh2 = doc.y;
    doc.rect(ML, bh2, CW, 18).fill(C.headerBg);
    doc.rect(ML, bh2, CW, 18).strokeColor(C.border).lineWidth(0.5).stroke();
    let tx = ML;
    ['#', 'Commit / Workflow', 'Branch', 'Duration', 'Date', 'Status'].forEach((h, i) => {
        doc.fillColor(C.muted).fontSize(7.5).font('Helvetica-Bold')
           .text(h, tx + 4, bh2 + 5, { width: bCols[i], characterSpacing: 0.3 });
        tx += bCols[i];
    });
    doc.y = bh2 + 22;

    runs.slice(0, 20).forEach((r, idx) => {
        checkPageBreak(18);
        tx = ML;
        const ty = doc.y;
        if (idx % 2 === 0) doc.rect(ML, ty - 2, CW, 16).fill(C.rowAlt);

        const cColor  = r.conclusion === 'success' ? C.greenText : r.conclusion === 'failure' ? C.redText : C.amberText;
        const cBg     = r.conclusion === 'success' ? C.greenLight : r.conclusion === 'failure' ? C.redLight : C.amberLight;
        const cLabel  = r.conclusion === 'success' ? 'Passed' : r.conclusion === 'failure' ? 'Failed' : r.conclusion || '—';
        const msg     = (r.head_commit_message || r.workflow_name || '—').split('\n')[0].slice(0, 32);
        const dur     = r.duration_seconds
            ? `${Math.floor(r.duration_seconds / 60)}m ${r.duration_seconds % 60}s` : '—';
        const date    = r.run_started_at
            ? new Date(r.run_started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

        const cells = [`#${r.run_number || '—'}`, msg, r.head_branch || '—', dur, date];
        cells.forEach((cell, i) => {
            doc.fillColor(i === 0 ? cColor : i === 1 ? C.text : C.muted)
               .fontSize(8).font(i === 0 ? 'Helvetica-Bold' : 'Helvetica')
               .text(cell, tx + 4, ty, { width: bCols[i] });
            tx += bCols[i];
        });
        badge(tx, ty - 1, cLabel, cBg, cColor, 50);
        doc.moveDown(0.82);
    });

    doc.y += 10;

    // ═══════════════════════════════════════════════════════════════════════════
    // FOOTER — every page
    // ═══════════════════════════════════════════════════════════════════════════
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc.rect(0, PH - 28, PW, 28).fill(C.headerBg);
        fullRule(PH - 28, C.border);
        doc.fillColor(C.muted).fontSize(7).font('Helvetica')
           .text(
               `PipelineXR  ·  Engineering Health Report  ·  ${repository || 'All Repositories'}  ·  ${isoDate}`,
               ML, PH - 17, { width: CW - 60 }
           );
        doc.fillColor(C.faint).fontSize(7).font('Helvetica')
           .text(`Page ${i + 1} of ${pageCount}`, PW - MR - 50, PH - 17, { width: 50, align: 'right' });
    }
}

module.exports = { generateReport };
