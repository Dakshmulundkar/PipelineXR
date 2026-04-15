import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Code2,
  Cpu,
  Eye,
  GitBranch,
  Lock,
  Building2,
  Plug,
  Radar,
  Rocket,
  ShieldCheck,
  Sparkles,
  Star,
  TestTube2,
  Users,
  Zap,
} from 'lucide-react';

const shell = {
  width: '100%',
  maxWidth: '1120px',
  margin: '0 auto',
};

const sectionEase = [0.16, 1, 0.3, 1];
const glassBase = 'rgba(28, 28, 30, 0.4)';
const glassSoft = 'rgba(28, 28, 30, 0.3)';
const glassStrong = 'rgba(28, 28, 30, 0.52)';
const borderSoft = '1px solid rgba(255,255,255,0.08)';
const borderSubtle = '1px solid rgba(255,255,255,0.06)';
const textMuted = 'rgba(255,255,255,0.48)';
const textSoft = 'rgba(255,255,255,0.34)';
const glassBackdrop = 'blur(24px) saturate(160%)';

const heroMetrics = [
  { value: '99.9%', label: 'release visibility' },
  { value: '2.4x', label: 'faster issue response' },
  { value: '24/7', label: 'always-on signal layer' },
];

const storyBlocks = [
  {
    eyebrow: 'See the system',
    title: 'Every deployment, metric, and risk in one calm surface.',
    body:
      'Instead of bouncing between dashboards, teams get one visual flow from pipeline activity to delivery health to production status.',
    icon: Eye,
    accent: '#60A5FA',
    points: ['Shared operational context', 'Clear release health', 'One interface for the team'],
    preview: 'metrics',
  },
  {
    eyebrow: 'Understand the risk',
    title: 'Security becomes part of delivery, not a separate interruption.',
    body:
      'Critical findings, scan posture, and remediation signals stay in the same story as the deployment they affect.',
    icon: ShieldCheck,
    accent: '#34D399',
    points: ['Fewer blind spots', 'Faster triage', 'Cleaner release decisions'],
    preview: 'security',
  },
  {
    eyebrow: 'Act in real time',
    title: 'Monitoring completes the loop after code reaches production.',
    body:
      'Live status, incident signals, and recovery visibility help the product team react faster when something changes.',
    icon: Activity,
    accent: '#3B82F6',
    points: ['Faster feedback', 'Production awareness', 'Continuous release confidence'],
    preview: 'monitoring',
  },
];

const workflow = [
  { label: 'Commit', icon: GitBranch, accent: '#60A5FA' },
  { label: 'Verify', icon: CheckCircle2, accent: '#34D399' },
  { label: 'Protect', icon: Lock, accent: '#FBBF24' },
  { label: 'Observe', icon: Radar, accent: '#3B82F6' },
];


const featureCardsPrimary = [
  {
    title: 'Smart testing',
    body: 'Automated suites, richer reporting, and better visibility into what changed before a release goes live.',
    icon: Cpu,
    accent: '#60A5FA',
  },
  {
    title: 'Security checks',
    body: 'Static analysis, vulnerability signals, and release-aware security posture stay inside the same delivery story.',
    icon: ShieldCheck,
    accent: '#34D399',
  },
  {
    title: 'Custom notifications',
    body: 'Keep teams informed with lightweight event updates for pipeline changes, failures, recoveries, and releases.',
    icon: Bell,
    accent: '#3B82F6',
  },
];

const featureCardsExtended = [
  { title: 'Unified dashboard', body: 'Track projects, environments, and release health from one clear operating view.', icon: BarChart3, accent: '#60A5FA' },
  { title: 'Fast onboarding', body: 'Connect repositories and start seeing delivery signals quickly instead of building dashboards from scratch.', icon: Rocket, accent: '#FBBF24' },
  { title: 'Role control', body: 'Give engineers, leads, and operators the visibility they need without exposing everything to everyone.', icon: Users, accent: '#3B82F6' },
  { title: 'Real analytics', body: 'Understand build times, stability, release velocity, and delivery trends in a cleaner reporting layer.', icon: Activity, accent: '#34D399' },
  { title: 'GitOps ready', body: 'Fit naturally into source-controlled infrastructure and modern release workflows.', icon: GitBranch, accent: '#60A5FA' },
  { title: 'CLI support', body: 'Extend operational workflows with automation hooks and scripting-friendly controls.', icon: Code2, accent: '#FBBF24' },
  { title: 'Extensible plugins', body: 'Adapt the platform with custom integrations and workflow extensions where your team needs them.', icon: Plug, accent: '#3B82F6' },
  { title: 'Instant alerts', body: 'React faster when builds fail, environments drift, or production signals change.', icon: Zap, accent: '#34D399' },
];

const howItWorksSteps = [
  {
    step: '1',
    title: 'Commit your code.',
    body: 'Push a change and PipelineXR immediately recognizes the new activity entering the delivery flow.',
    icon: GitBranch,
    accent: '#60A5FA',
  },
  {
    step: '2',
    title: 'Build and test.',
    body: 'Build automation and verification start automatically so quality signals appear before deployment decisions are made.',
    icon: TestTube2,
    accent: '#34D399',
  },
  {
    step: '3',
    title: 'Deploy automatically.',
    body: 'Successful changes move into staging or production with release confidence, traceability, and cleaner operational visibility.',
    icon: Rocket,
    accent: '#FBBF24',
  },
];

const howItWorksCards = [
  {
    title: 'Instant monitoring',
    body: 'Track pipeline state, production health, and change impact without leaving the workspace.',
    icon: Radar,
    accent: '#3B82F6',
  },
  {
    title: 'Secure by design',
    body: 'Security posture becomes part of how releases are understood, not an isolated afterthought.',
    icon: ShieldCheck,
    accent: '#10B981',
  },
  {
    title: 'Seamless rollbacks',
    body: 'When something shifts in production, teams can respond with context and confidence.',
    icon: Zap,
    accent: '#3B82F6',
  },
];

const testimonials = [
  {
    quote: 'PipelineXR gave our team one release narrative instead of five disconnected dashboards.',
    name: 'Aarav Mehta',
    role: 'Engineering Lead',
    company: 'Northstar Cloud',
  },
  {
    quote: 'The delivery story is finally clear. Build quality, security posture, and production status now move together.',
    name: 'Riya Kapoor',
    role: 'Platform Director',
    company: 'Helio Systems',
  },
  {
    quote: 'It feels more like a finished product than an internal tool. That changed adoption immediately.',
    name: 'Kabir Shah',
    role: 'VP of Engineering',
    company: 'MergeStack',
  },
];

const pricingTiers = [
  {
    name: 'Starter',
    price: 'Free',
    description: 'For individual developers and small teams getting started with CI/CD observability.',
    accent: '#60A5FA',
    points: ['Up to 3 repositories', 'Core pipeline visibility', 'Basic monitoring', '7-day log retention'],
  },
  {
    name: 'Pro',
    price: '₹1,499/mo',
    description: 'For growing teams that need advanced analytics, security scanning, and collaboration features.',
    accent: '#34D399',
    points: ['Unlimited repositories', 'Advanced DORA metrics', 'Security vulnerability scanning', 'Team collaboration', '30-day log retention'],
    featured: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    description: 'For organizations requiring custom SLA, dedicated support, and enterprise-grade governance.',
    accent: '#3B82F6',
    points: ['Everything in Pro', 'Dedicated account manager', 'Custom SLA guarantee', 'SSO & advanced RBAC', 'Unlimited log retention'],
  },
];

const faqs = [
  {
    question: 'Is PipelineXR only for CI/CD teams?',
    answer: 'No. It is designed for engineering teams that want one clearer view across delivery, security, and production monitoring.',
  },
  {
    question: 'Can it fit an existing workflow?',
    answer: 'Yes. The page and the product are both positioned around integrating into how teams already commit, build, verify, deploy, and observe.',
  },
  {
    question: 'Is the focus speed or control?',
    answer: 'Both. The product is meant to shorten feedback loops without making the release process feel opaque or risky.',
  },
];

const demoMetricCharts = [
  { title: 'Build Efficiency', color: '#60A5FA', values: [36, 52, 44, 66, 58, 82, 73], unit: 'm' },
  { title: 'Mission Success', color: '#34D399', values: [88, 91, 90, 94, 95, 98, 97], unit: '%' },
  { title: 'Deploy Frequency', color: '#3B82F6', values: [3, 5, 4, 6, 5, 7, 6], unit: '' },
  { title: 'Failure Rate', color: '#F87171', values: [12, 10, 11, 8, 7, 4, 5], unit: '%' },
];

const demoSecuritySummary = [
  { label: 'Critical', value: 3, color: '#F87171' },
  { label: 'High', value: 7, color: '#FB923C' },
  { label: 'Medium', value: 11, color: '#FBBF24' },
  { label: 'Low', value: 18, color: '#60A5FA' },
];

const demoScanners = [
  { name: 'Trivy Scanner', findings: 14, color: '#F87171', status: 'Action needed' },
  { name: 'Snyk SAST', findings: 9, color: '#3B82F6', status: 'Review' },
  { name: 'GitHub Adv', findings: 0, color: '#34D399', status: 'Passed' },
];

const demoPipelineRuns = [
  { repo: 'pipelinexr/web', branch: 'main', status: 'success', color: '#34D399', duration: '4m 12s' },
  { repo: 'pipelinexr/api', branch: 'release', status: 'running', color: '#60A5FA', duration: '2m 08s' },
  { repo: 'pipelinexr/worker', branch: 'hotfix', status: 'failed', color: '#F87171', duration: '6m 01s' },
];

const cinematicChapters = [
  {
    title: 'Signal',
    body: 'The system catches delivery movement the moment it starts, so the product story begins at the source.',
    accent: '#60A5FA',
  },
  {
    title: 'Judgment',
    body: 'Quality, security, and release confidence move through the same visual sequence instead of separate tools.',
    accent: '#34D399',
  },
  {
    title: 'Response',
    body: 'Once code reaches production, monitoring closes the loop with live operational context.',
    accent: '#3B82F6',
  },
];

function CinematicScrollSection({ scrollContainerRef }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    container: scrollContainerRef,
    target: ref,
    offset: ['start end', 'end start'],
  });

  const previewY = useTransform(scrollYProgress, [0, 0.4, 0.8, 1], [60, 0, -20, -40]);
  const previewOpacity = useTransform(scrollYProgress, [0, 0.15, 0.6, 1], [0.2, 1, 1, 0.6]);
  const previewScale = useTransform(scrollYProgress, [0, 0.2, 0.7, 1], [0.95, 1, 1, 0.97]);

  return (
    <section ref={ref} className="relative py-16 md:py-24">
      <motion.div style={{ ...shell, y: previewY, opacity: previewOpacity, scale: previewScale }} className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.75, ease: sectionEase }}
        >
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
              color: 'rgba(255,255,255,0.74)',
            }}
          >
            <GitBranch className="h-3.5 w-3.5" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">Pipelines</span>
          </div>
          <h2 className="mt-5 max-w-xl text-3xl font-semibold tracking-[-0.05em] text-white md:text-5xl">
            Watch delivery move from run to run.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-8" style={{ color: textMuted }}>
            A compact Pipelines page preview shows run history, execution health, and current status in the same style as the real product.
          </p>

          <div className="mt-10 space-y-6">
            {cinematicChapters.map((chapter, index) => (
              <motion.div
                key={chapter.title}
                initial={{ opacity: 0, x: -16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ duration: 0.6, delay: index * 0.12, ease: sectionEase }}
                className="flex items-start gap-4"
              >
                <div
                  className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold"
                  style={{
                    background: `${chapter.accent}18`,
                    border: `1px solid ${chapter.accent}30`,
                    color: chapter.accent,
                  }}
                >
                  {index + 1}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">{chapter.title}</div>
                  <div className="mt-1 text-sm leading-6" style={{ color: 'rgba(255,255,255,0.48)' }}>
                    {chapter.body}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -6 }}
          transition={{ duration: 0.28, ease: sectionEase }}
        >
          <div
            className="relative overflow-hidden rounded-[32px] p-5 md:p-6"
            style={{
              background: 'linear-gradient(180deg, rgba(18,20,27,0.92) 0%, rgba(10,11,16,0.92) 100%)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 24px 90px rgba(0,0,0,0.3)',
            }}
          >
            <div
              className="absolute inset-x-0 top-0 h-px"
              style={{
                background: 'linear-gradient(90deg, transparent, #60A5FA55, transparent)',
              }}
            />
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
              </div>
              <div
                className="rounded-full px-3 py-1 text-[11px] font-medium"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  color: 'rgba(255,255,255,0.34)',
                }}
              >
                PipelineXR workspace
              </div>
            </div>
            <MiniPipelinesPreview />
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}

function StoryCard({ block, index, scrollContainerRef }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    container: scrollContainerRef,
    target: ref,
    offset: ['start 80%', 'end 35%'],
  });

  const y = useTransform(scrollYProgress, [0, 1], [52, -10]);
  const opacity = useTransform(scrollYProgress, [0, 0.2, 0.7, 1], [0.28, 1, 1, 0.78]);
  const scale = useTransform(scrollYProgress, [0, 0.3, 1], [0.94, 1, 0.985]);
  const previewContent =
    block.preview === 'metrics'
      ? <MiniMetricsPreview />
      : block.preview === 'security'
        ? <MiniSecurityPreview />
        : block.preview === 'monitoring'
          ? <MiniMonitoringPreview />
        : <MiniDashboardPreview />;

  return (
    <section ref={ref} className="relative py-16 md:py-24">
      <motion.div style={{ ...shell, opacity, scale, y }} className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
        <div className={index % 2 === 1 ? 'lg:order-2' : ''}>
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
            style={{
              background: `${block.accent}12`,
              border: `1px solid ${block.accent}22`,
              color: block.accent,
            }}
          >
            <block.icon className="h-3.5 w-3.5" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">{block.eyebrow}</span>
          </div>

          <h2 className="mt-5 max-w-xl text-3xl font-semibold tracking-[-0.05em] text-white md:text-5xl">
            {block.title}
          </h2>
          <p className="mt-5 max-w-xl text-base leading-8" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {block.body}
          </p>

          <div className="mt-8 space-y-3">
            {block.points.map((point) => (
              <motion.div
                key={point}
                whileHover={{ x: 6 }}
                transition={{ duration: 0.22 }}
                className="flex items-center gap-3 text-sm"
                style={{ color: 'rgba(255,255,255,0.82)' }}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: block.accent, boxShadow: `0 0 16px ${block.accent}55` }}
                />
                <span>{point}</span>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.div
          whileHover={{ y: -6 }}
          transition={{ duration: 0.28, ease: sectionEase }}
          className={index % 2 === 1 ? 'lg:order-1' : ''}
        >
          <div
            className="relative overflow-hidden rounded-[32px] p-5 md:p-6"
            style={{
              background: 'linear-gradient(180deg, rgba(18,20,27,0.92) 0%, rgba(10,11,16,0.92) 100%)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 24px 90px rgba(0,0,0,0.3)',
            }}
          >
            <div
              className="absolute inset-x-0 top-0 h-px"
              style={{
                background: `linear-gradient(90deg, transparent, ${block.accent}55, transparent)`,
              }}
            />
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
              </div>
              <div
                className="rounded-full px-3 py-1 text-[11px] font-medium"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  color: 'rgba(255,255,255,0.34)',
                }}
              >
                PipelineXR workspace
              </div>
            </div>

            <div className="grid gap-4">
              {previewContent}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}

function FaqItem({ item, isOpen, onToggle }) {
  return (
    <motion.button
      type="button"
      onClick={onToggle}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className="w-full rounded-[28px] p-6 text-left"
      style={{
        background: glassBase,
        border: borderSubtle,
        backdropFilter: 'blur(18px) saturate(150%)',
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <span className="text-lg font-semibold tracking-[-0.03em] text-white">{item.question}</span>
        <ChevronDown
          className="h-5 w-5 shrink-0 transition-transform duration-300"
          style={{
            color: 'rgba(255,255,255,0.55)',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </div>
      <motion.div
        initial={false}
        animate={{
          height: isOpen ? 'auto' : 0,
          opacity: isOpen ? 1 : 0,
          marginTop: isOpen ? 16 : 0,
        }}
        transition={{ duration: 0.25, ease: sectionEase }}
        style={{ overflow: 'hidden' }}
      >
        <p className="max-w-3xl text-base leading-8" style={{ color: textMuted }}>
          {item.answer}
        </p>
      </motion.div>
    </motion.button>
  );
}

function MiniMetricsPreview() {
  return (
    <div
      className="rounded-[28px] p-4"
      style={{
        background: glassSoft,
        border: borderSubtle,
        backdropFilter: 'blur(18px) saturate(150%)',
      }}
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-white">Performance Analysis</div>
          <div className="mt-1 text-[11px]" style={{ color: textSoft }}>
            Mini Metrics view with demo data
          </div>
        </div>
        <div
          className="rounded-full px-3 py-1 text-[11px] font-semibold"
          style={{ background: 'rgba(96,165,250,0.14)', color: '#93C5FD' }}
        >
          7d
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {demoMetricCharts.map((chart) => (
          <div
            key={chart.title}
            className="rounded-[22px] p-4"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: textSoft }}>
                {chart.title}
              </div>
              <div className="text-xs font-semibold" style={{ color: chart.color }}>
                {chart.values[chart.values.length - 1]}{chart.unit}
              </div>
            </div>

            <div className="mt-4 flex h-20 items-end gap-2">
              {chart.values.map((value, index) => (
                <motion.div
                  key={`${chart.title}-${index}`}
                  initial={{ height: 0, opacity: 0.3 }}
                  animate={{ height: `${Math.max(value, 10)}%`, opacity: 1 }}
                  transition={{ duration: 0.55, delay: 0.25 + index * 0.03, ease: sectionEase }}
                  className="flex-1 rounded-t-[10px]"
                  style={{
                    background:
                      index === chart.values.length - 1
                        ? `linear-gradient(180deg, ${chart.color} 0%, rgba(255,255,255,0.2) 100%)`
                        : 'linear-gradient(180deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0.08) 100%)',
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniSecurityPreview() {
  return (
    <div
      className="rounded-[28px] p-4"
      style={{
        background: glassSoft,
        border: borderSubtle,
        backdropFilter: 'blur(18px) saturate(150%)',
      }}
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-white">Security Center</div>
          <div className="mt-1 text-[11px]" style={{ color: textSoft }}>
            Mini Security view with demo findings
          </div>
        </div>
        <div
          className="rounded-full px-3 py-1 text-[11px] font-semibold"
          style={{ background: 'rgba(248,113,113,0.14)', color: '#FCA5A5' }}
        >
          Risky · 68
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
        <div
          className="rounded-[22px] p-4"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: textSoft }}>
            Threat Profile
          </div>
          <div className="mt-4 flex items-center justify-center">
            <div
              className="relative flex h-28 w-28 items-center justify-center rounded-full"
              style={{
                background:
                  'conic-gradient(#F87171 0 18%, #FB923C 18% 36%, #FBBF24 36% 58%, #60A5FA 58% 100%)',
              }}
            >
              <div
                className="flex h-16 w-16 items-center justify-center rounded-full text-center"
                style={{ background: '#0d0d12', color: 'white' }}
              >
                <div>
                  <div className="text-lg font-semibold leading-none">39</div>
                  <div className="mt-1 text-[10px]" style={{ color: textSoft }}>
                    findings
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {demoSecuritySummary.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-[14px] px-3 py-2"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }}
              >
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full" style={{ background: item.color }} />
                  <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.62)' }}>
                    {item.label}
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-white">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {demoScanners.map((scanner) => (
            <div
              key={scanner.name}
              className="rounded-[18px] p-4"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">{scanner.name}</div>
                  <div className="mt-1 text-[11px]" style={{ color: textSoft }}>
                    {scanner.findings} findings
                  </div>
                </div>
                <div
                  className="rounded-full px-3 py-1 text-[11px] font-semibold"
                  style={{
                    background: `${scanner.color}14`,
                    color: scanner.color,
                  }}
                >
                  {scanner.status}
                </div>
              </div>
            </div>
          ))}

          <div
            className="rounded-[18px] p-4"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div className="mb-2 text-sm font-semibold text-white">Vulnerability Trend</div>
            <div className="flex h-16 items-end gap-2">
              {[10, 9, 8, 8, 7, 5, 4].map((value, index) => (
                <motion.div
                  key={index}
                  initial={{ height: 0, opacity: 0.3 }}
                  animate={{ height: `${value * 10}%`, opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.35 + index * 0.03, ease: sectionEase }}
                  className="flex-1 rounded-t-[10px]"
                  style={{
                    background:
                      index === 6
                        ? 'linear-gradient(180deg, #34D399 0%, rgba(255,255,255,0.18) 100%)'
                        : 'linear-gradient(180deg, rgba(248,113,113,0.8) 0%, rgba(248,113,113,0.15) 100%)',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniDashboardPreview() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Deployments', value: '247', accent: '#60A5FA' },
          { label: 'Healthy builds', value: '98.5%', accent: '#34D399' },
          { label: 'Open risks', value: '3', accent: '#FBBF24' },
        ].map((item, index) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 + index * 0.08, ease: sectionEase }}
            className="rounded-[24px] p-4"
            style={{
              background: glassSoft,
              border: borderSubtle,
              backdropFilter: 'blur(18px) saturate(150%)',
            }}
          >
            <div className="text-[11px] uppercase tracking-[0.14em]" style={{ color: textSoft }}>
              {item.label}
            </div>
            <div className="mt-3 text-2xl font-semibold tracking-[-0.05em]" style={{ color: item.accent }}>
              {item.value}
            </div>
          </motion.div>
        ))}
      </div>

      <div
        className="rounded-[28px] p-5"
        style={{
          background: glassSoft,
          border: borderSubtle,
          backdropFilter: 'blur(18px) saturate(150%)',
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Release pulse</div>
            <div className="mt-1 text-xs" style={{ color: textSoft }}>
              Unified dashboard preview
            </div>
          </div>
          <div
            className="rounded-full px-3 py-1 text-[11px] font-semibold"
            style={{ background: 'rgba(96,165,250,0.14)', color: '#93C5FD' }}
          >
            Live
          </div>
        </div>

        <div className="mt-6 flex h-36 items-end gap-3">
          {[30, 48, 42, 66, 60, 92, 76].map((height, index) => (
            <div key={height + index} className="flex flex-1 flex-col items-center gap-3">
              <motion.div
                initial={{ height: 0, opacity: 0.35 }}
                animate={{ height: `${height}%`, opacity: 1 }}
                transition={{ duration: 0.7, delay: 0.45 + index * 0.05, ease: sectionEase }}
                className="w-full rounded-t-[18px]"
                style={{
                  background:
                    index === 5
                      ? 'linear-gradient(180deg, #93C5FD 0%, #3B82F6 100%)'
                      : 'linear-gradient(180deg, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0.08) 100%)',
                }}
              />
              <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.22)' }}>
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'][index]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MiniMonitoringPreview() {
  return (
    <div
      className="rounded-[28px] p-4"
      style={{
        background: glassSoft,
        border: borderSubtle,
        backdropFilter: 'blur(18px) saturate(150%)',
      }}
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-white">Monitoring</div>
          <div className="mt-1 text-[11px]" style={{ color: textSoft }}>
            Mini uptime and incident view
          </div>
        </div>
        <div
          className="rounded-full px-3 py-1 text-[11px] font-semibold"
          style={{ background: 'rgba(52,211,153,0.14)', color: '#6EE7B7' }}
        >
          Systems operational
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Uptime', value: '99.9%', accent: '#34D399' },
          { label: 'MTTR', value: '12m', accent: '#60A5FA' },
          { label: 'Incidents', value: '2', accent: '#3B82F6' },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-[18px] p-4"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div className="text-[11px] uppercase tracking-[0.12em]" style={{ color: textSoft }}>
              {item.label}
            </div>
            <div className="mt-3 text-2xl font-semibold tracking-[-0.05em]" style={{ color: item.accent }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
        <div
          className="rounded-[20px] p-4"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className="mb-3 text-sm font-semibold text-white">Site health</div>
          <div className="space-y-3">
            {[
              { name: 'api.pipelinexr.com', status: 'UP', color: '#34D399' },
              { name: 'dashboard.pipelinexr.com', status: 'UP', color: '#34D399' },
              { name: 'hooks.pipelinexr.com', status: 'DEGRADED', color: '#FBBF24' },
            ].map((site) => (
              <div key={site.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ background: site.color }} />
                  <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.74)' }}>
                    {site.name}
                  </span>
                </div>
                <span className="text-[11px] font-semibold" style={{ color: site.color }}>
                  {site.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div
          className="rounded-[20px] p-4"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className="mb-3 text-sm font-semibold text-white">Latency trend</div>
          <div className="flex h-24 items-end gap-2">
            {[42, 38, 46, 40, 34, 36, 32].map((value, index) => (
              <motion.div
                key={index}
                initial={{ height: 0, opacity: 0.3 }}
                animate={{ height: `${value}%`, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.3 + index * 0.03, ease: sectionEase }}
                className="flex-1 rounded-t-[10px]"
                style={{
                  background:
                    index === 6
                      ? 'linear-gradient(180deg, #3B82F6 0%, rgba(255,255,255,0.2) 100%)'
                      : 'linear-gradient(180deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0.08) 100%)',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniPipelinesPreview() {
  return (
    <div
      className="rounded-[30px] p-5 md:p-6"
      style={{
        background: glassStrong,
        border: borderSoft,
        backdropFilter: glassBackdrop,
        WebkitBackdropFilter: glassBackdrop,
        boxShadow: '0 30px 100px rgba(0,0,0,0.3)',
      }}
    >
      <div className="mb-5 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-white">Pipeline Runs</div>
          <div className="mt-1 text-[11px]" style={{ color: textSoft }}>
            Mini Pipelines page preview
          </div>
        </div>
        <div
          className="rounded-full px-3 py-1 text-[11px] font-semibold"
          style={{ background: 'rgba(96,165,250,0.14)', color: '#93C5FD' }}
        >
          Live
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: 'Total Runs', value: '128', accent: '#FFFFFF' },
          { label: 'Passed', value: '112', accent: '#34D399' },
          { label: 'Failed', value: '9', accent: '#F87171' },
          { label: 'Success Rate', value: '91%', accent: '#FBBF24' },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-[20px] p-4"
            style={{
              background: glassSoft,
              border: borderSubtle,
            }}
          >
            <div className="text-[11px] uppercase tracking-[0.12em]" style={{ color: textSoft }}>
              {item.label}
            </div>
            <div className="mt-3 text-2xl font-semibold tracking-[-0.05em]" style={{ color: item.accent }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <div
        className="mt-4 rounded-[22px] p-4"
        style={{
          background: glassSoft,
          border: borderSubtle,
        }}
      >
        <div className="mb-3 text-sm font-semibold text-white">Run history</div>
        <div className="flex h-20 items-end gap-2">
          {[4, 6, 5, 8, 7, 9, 8, 10, 9, 7, 8, 6].map((value, index) => (
            <motion.div
              key={index}
              initial={{ height: 0, opacity: 0.3 }}
              animate={{ height: `${value * 10}%`, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 + index * 0.02, ease: sectionEase }}
              className="flex-1 rounded-t-[10px]"
              style={{
                background:
                  index > 8
                    ? 'linear-gradient(180deg, #34D399 0%, rgba(255,255,255,0.16) 100%)'
                    : 'linear-gradient(180deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0.08) 100%)',
              }}
            />
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {demoPipelineRuns.map((run) => (
          <div
            key={`${run.repo}-${run.branch}`}
            className="rounded-[18px] p-4"
            style={{
              background: glassSoft,
              border: borderSubtle,
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">{run.repo}</div>
                <div className="mt-1 text-[11px]" style={{ color: textSoft }}>
                  {run.branch} · {run.duration}
                </div>
              </div>
              <div
                className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase"
                style={{
                  background: `${run.color}14`,
                  color: run.color,
                }}
              >
                {run.status}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const LandingPage = () => {
  const navigate = useNavigate();
  const pageRef = useRef(null);
  const MotionDiv = motion.div;
  const MotionButton = motion.button;
  const [openFaq, setOpenFaq] = useState(0);
  const { scrollYProgress } = useScroll({
    container: pageRef,
  });

  const heroY = useTransform(scrollYProgress, [0, 0.3], [0, -70]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.24], [1, 0.4]);
  const orbOneY = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const orbTwoY = useTransform(scrollYProgress, [0, 1], [0, 80]);
  const progressScale = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <div
      ref={pageRef}
      className="landing-page"
      style={{
        minHeight: '100vh',
        scrollBehavior: 'smooth',
        background:
          'radial-gradient(circle at 20% 0%, rgba(59,130,246,0.16), transparent 28%), radial-gradient(circle at 80% 10%, rgba(167,139,250,0.10), transparent 25%), linear-gradient(180deg, #040508 0%, #06070b 40%, #05060a 100%)',
      }}
    >
      <MotionDiv
        className="fixed left-0 right-0 top-0 z-50 h-[2px] origin-left"
        style={{
          scaleX: progressScale,
          background: 'linear-gradient(90deg, #60A5FA 0%, #3B82F6 50%, #34D399 100%)',
        }}
      />

      <div className="pointer-events-none fixed inset-0 overflow-hidden" style={{ zIndex: 0 }}>
        <MotionDiv
          style={{ y: orbOneY }}
          className="absolute left-[-12%] top-[-8%] h-[34rem] w-[34rem] rounded-full"
        >
          <div
            className="h-full w-full rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(59,130,246,0.18) 0%, transparent 68%)',
              filter: 'blur(56px)',
            }}
          />
        </MotionDiv>
        <MotionDiv
          style={{ y: orbTwoY }}
          className="absolute right-[-10%] top-[14%] h-[28rem] w-[28rem] rounded-full"
        >
          <div
            className="h-full w-full rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(167,139,250,0.12) 0%, transparent 72%)',
              filter: 'blur(64px)',
            }}
          />
        </MotionDiv>
        <div
          className="absolute inset-0 opacity-35"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
            maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.84), transparent 94%)',
          }}
        />
      </div>

      <div className="relative z-10">
        <header className="px-5 pt-5 sm:px-6 md:px-8 md:pt-7 xl:px-10">
          <div
            className="flex items-center justify-between rounded-full px-4 py-3 md:px-6"
            style={{
              ...shell,
              background: glassBase,
              border: borderSoft,
              backdropFilter: glassBackdrop,
              WebkitBackdropFilter: glassBackdrop,
              boxShadow: '0 20px 60px rgba(0,0,0,0.24)',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-2xl text-[11px] font-black text-white"
                style={{
                  background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                  boxShadow: '0 0 24px rgba(59,130,246,0.28)',
                }}
              >
                PX
              </div>
              <div>
                <div className="text-sm font-semibold tracking-tight text-white">PipelineXR</div>
                <div className="text-[11px]" style={{ color: textSoft }}>
                  DevSecOps observability
                </div>
              </div>
            </div>

            <div className="hidden items-center gap-8 md:flex">
              {['Home', 'Features', 'How It Works'].map((item) => (
                <a
                  key={item}
                  href={`#${item.toLowerCase().replace(/\s+/g, '-')}`}
                  className="text-sm font-medium transition-colors hover:text-white"
                  style={{ color: 'rgba(255,255,255,0.4)' }}
                  onClick={(e) => {
                    e.preventDefault();
                    const section = document.getElementById(item.toLowerCase().replace(/\s+/g, '-'));
                    if (section) section.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  {item}
                </a>
              ))}
            </div>

            <MotionButton
              onClick={() => navigate('/login')}
              whileHover={{ y: -2, backgroundColor: 'rgba(255,255,255,0.1)' }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
              style={{
                background: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.86)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              Sign in
              <ChevronRight className="h-4 w-4" />
            </MotionButton>
          </div>
        </header>

        <main className="px-5 pt-10 sm:px-6 md:px-8 md:pt-16 xl:px-10">
          <MotionDiv
            style={{ ...shell, y: heroY, opacity: heroOpacity }}
            className="grid min-h-[calc(100vh-8rem)] items-center gap-12 pt-6 md:pt-10 lg:grid-cols-[1.05fr_0.95fr]"
          >
            <div className="min-w-0">
              <MotionDiv
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: sectionEase }}
                className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
                style={{
                  background: 'rgba(59,130,246,0.10)',
                  border: '1px solid rgba(96,165,250,0.18)',
                  color: '#93C5FD',
                }}
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">DevSecOps Observability</span>
              </MotionDiv>

              <MotionDiv
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, delay: 0.08, ease: sectionEase }}
                className="mt-6 max-w-4xl text-[3rem] font-semibold tracking-[-0.07em] text-white sm:text-[3.8rem] md:text-[5rem] lg:text-[5.7rem]"
                style={{ lineHeight: 0.94 }}
              >
                Complete CI/CD visibility,
                <span className="block" style={{ color: '#E6EEFF', textShadow: '0 0 34px rgba(96,165,250,0.16)' }}>
                  from commit to production.
                </span>
              </MotionDiv>

              <MotionDiv
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, delay: 0.16, ease: sectionEase }}
                className="mt-6 max-w-2xl text-base leading-8 md:text-lg"
                style={{ color: 'rgba(255,255,255,0.52)' }}
              >
                PipelineXR provides real-time pipeline monitoring, DORA metrics, security scanning, and uptime tracking—all in one unified dashboard for engineering teams.
              </MotionDiv>

              <MotionDiv
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, delay: 0.24, ease: sectionEase }}
                className="mt-9 flex flex-col gap-3 sm:flex-row"
              >
                <MotionButton
                  onClick={() => navigate('/login')}
                  whileHover={{ y: -3, scale: 1.01 }}
                  whileTap={{ scale: 0.985 }}
                  transition={{ duration: 0.22 }}
                  className="inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold"
                  style={{
                    background: '#F5F7FB',
                    color: '#05070C',
                    boxShadow: '0 18px 40px rgba(255,255,255,0.12)',
                  }}
                >
                  Open workspace
                  <ArrowRight className="h-4 w-4" />
                </MotionButton>

                <MotionButton
                  onClick={() => navigate('/login')}
                  whileHover={{ y: -3, backgroundColor: 'rgba(255,255,255,0.07)' }}
                  whileTap={{ scale: 0.985 }}
                  transition={{ duration: 0.22 }}
                  className="inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    color: 'rgba(255,255,255,0.82)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    backdropFilter: 'blur(18px)',
                  }}
                >
                  View the flow
                  <Eye className="h-4 w-4" />
                </MotionButton>
              </MotionDiv>

              <MotionDiv
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, delay: 0.32, ease: sectionEase }}
                className="mt-12 grid gap-4 sm:grid-cols-3"
              >
                {heroMetrics.map((metric) => (
                  <MotionDiv
                    key={metric.label}
                    whileHover={{ y: -4 }}
                    transition={{ duration: 0.22 }}
                    className="rounded-[24px] p-5"
                    style={{
                      background: glassSoft,
                      border: borderSubtle,
                      backdropFilter: 'blur(18px) saturate(150%)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
                    }}
                  >
                    <div className="text-2xl font-semibold tracking-[-0.05em] text-white">{metric.value}</div>
                    <div className="mt-2 text-sm leading-6" style={{ color: textSoft }}>
                      {metric.label}
                    </div>
                  </MotionDiv>
                ))}
              </MotionDiv>
            </div>

            <MotionDiv
              initial={{ opacity: 0, y: 40, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 1, delay: 0.14, ease: sectionEase }}
              className="relative"
            >
              <div
                className="absolute -inset-8 rounded-[40px]"
                style={{
                  background:
                    'radial-gradient(circle at 20% 20%, rgba(59,130,246,0.18), transparent 35%), radial-gradient(circle at 80% 10%, rgba(167,139,250,0.13), transparent 32%)',
                  filter: 'blur(28px)',
                }}
              />

              <MotionDiv
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut' }}
                className="relative overflow-hidden rounded-[34px] p-5 md:p-6"
                style={{
                  background: glassStrong,
                  border: borderSoft,
                  backdropFilter: glassBackdrop,
                  WebkitBackdropFilter: glassBackdrop,
                  boxShadow: '0 36px 110px rgba(0,0,0,0.36)',
                }}
              >
                <div className="mb-5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
                  </div>
                  <div
                    className="rounded-full px-3 py-1 text-[11px] font-medium"
                    style={{ background: 'rgba(255,255,255,0.04)', color: textSoft }}
                  >
                    release overview
                  </div>
                </div>

                <div className="grid gap-4">
                  <MiniDashboardPreview />
                </div>
              </MotionDiv>
            </MotionDiv>
          </MotionDiv>

          <section className="py-8 md:py-12">
            <div style={shell}>
              <div className="grid gap-3 sm:grid-cols-4">
                {workflow.map((step, index) => (
                  <MotionDiv
                    key={step.label}
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.7 }}
                    transition={{ duration: 0.6, delay: index * 0.08, ease: sectionEase }}
                    whileHover={{ y: -4 }}
                    className="relative rounded-[28px] p-5"
                    style={{
                      background: glassSoft,
                      border: borderSubtle,
                      backdropFilter: 'blur(18px) saturate(150%)',
                    }}
                  >
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-2xl"
                      style={{
                        background: `${step.accent}18`,
                        border: `1px solid ${step.accent}30`,
                      }}
                    >
                      <step.icon className="h-5 w-5" style={{ color: step.accent }} />
                    </div>
                    <div className="mt-4 text-sm font-semibold text-white">{step.label}</div>
                    {index < workflow.length - 1 && (
                      <div
                        className="absolute right-[-10px] top-1/2 hidden h-px w-5 -translate-y-1/2 md:block"
                        style={{
                          background: 'linear-gradient(90deg, rgba(255,255,255,0.14), rgba(255,255,255,0.03))',
                        }}
                      />
                    )}
                  </MotionDiv>
                ))}
              </div>
            </div>
          </section>

          {storyBlocks.map((block, index) => (
            index === 0
              ? <div id="features"><StoryCard key={block.title} block={block} index={index} scrollContainerRef={pageRef} /></div>
              : <StoryCard key={block.title} block={block} index={index} scrollContainerRef={pageRef} />
          ))}

          <CinematicScrollSection scrollContainerRef={pageRef} />

          <section id="how-it-works" className="py-16 md:py-24">
            <div style={shell}>
              <motion.div
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.75, ease: sectionEase }}
                className="text-center"
              >
                <div
                  className="mx-auto inline-flex items-center gap-2 rounded-full px-3 py-1.5"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    color: 'rgba(255,255,255,0.74)',
                  }}
                >
                  <Radar className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">How it works</span>
                </div>
                <h2 className="mx-auto mt-5 max-w-4xl text-3xl font-semibold tracking-[-0.05em] text-white md:text-5xl">
                  From commit to production in three steps.
                </h2>
                <p className="mx-auto mt-5 max-w-2xl text-base leading-8" style={{ color: textMuted }}>
                  PipelineXR follows the rhythm your team already works in—commit, build, verify, deploy, and observe.
                </p>
              </motion.div>

              <div className="mt-14 space-y-5" style={{ maxWidth: '820px', marginLeft: 'auto', marginRight: 'auto' }}>
                {howItWorksSteps.map((item, index) => (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, y: 34 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.35 }}
                    transition={{ duration: 0.72, delay: index * 0.07, ease: sectionEase }}
                    className={`grid gap-8 rounded-[28px] p-6 md:p-8 lg:items-center ${index % 2 === 1 ? 'lg:grid-cols-[0.35fr_0.65fr]' : 'lg:grid-cols-[0.6fr_0.4fr]'}`}
                    style={{
                      background: 'rgba(28,28,30,0.5)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      backdropFilter: 'blur(20px)',
                    }}
                  >
                    <div className={index % 2 === 1 ? 'lg:order-2 lg:pl-2' : 'lg:pr-8'}>
                      <div
                        className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
                        style={{
                          background: `${item.accent}12`,
                          border: `1px solid ${item.accent}22`,
                          color: item.accent,
                        }}
                      >
                        <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">Step {item.step}</span>
                      </div>
                      <h3 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-white md:text-3xl">{item.title}</h3>
                      <p className="mt-4 text-base leading-7" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        {item.body}
                      </p>
                    </div>

                    <div className={`flex items-center justify-center ${index % 2 === 1 ? 'lg:order-1 lg:justify-center' : 'lg:justify-start'}`}
                      style={{ paddingLeft: '1.5rem', paddingRight: '1.5rem' }}
                    >
                      <div
                        className="flex h-28 w-28 items-center justify-center rounded-[24px]"
                        style={{
                          background: `${item.accent}15`,
                          border: `1px solid ${item.accent}25`,
                          boxShadow: `0 0 40px ${item.accent}18`,
                        }}
                      >
                        <item.icon className="h-12 w-12" style={{ color: item.accent }} />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="mt-16 grid gap-5 md:grid-cols-3">
                {howItWorksCards.map((card, index) => (
                  <motion.div
                    key={card.title}
                    initial={{ opacity: 0, y: 26 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.45 }}
                    transition={{ duration: 0.65, delay: index * 0.06, ease: sectionEase }}
                    whileHover={{ y: -6 }}
                    className="rounded-[30px] p-7"
                    style={{
                      background: 'rgba(18,20,27,0.82)',
                      border: '1px solid rgba(255,255,255,0.07)',
                    }}
                  >
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-2xl"
                      style={{
                        background: `${card.accent}18`,
                        border: `1px solid ${card.accent}30`,
                      }}
                    >
                      <card.icon className="h-5 w-5" style={{ color: card.accent }} />
                    </div>
                    <h3 className="mt-5 text-2xl font-semibold tracking-[-0.04em] text-white">{card.title}</h3>
                    <p className="mt-3 text-base leading-8" style={{ color: 'rgba(255,255,255,0.46)' }}>
                      {card.body}
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          <section className="py-16 md:py-24">
            <div style={shell}>
              <div className="mt-0 grid gap-5 md:grid-cols-3">
                {featureCardsPrimary.map((card, index) => (
                  <motion.div
                    key={card.title}
                    initial={{ opacity: 0, y: 26 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.45 }}
                    transition={{ duration: 0.65, delay: index * 0.06, ease: sectionEase }}
                    whileHover={{ y: -6 }}
                    className="rounded-[30px] p-7"
                    style={{
                      background: glassBase,
                      border: borderSubtle,
                      backdropFilter: 'blur(18px) saturate(150%)',
                    }}
                  >
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-2xl"
                      style={{
                        background: `${card.accent}18`,
                        border: `1px solid ${card.accent}30`,
                      }}
                    >
                      <card.icon className="h-5 w-5" style={{ color: card.accent }} />
                    </div>
                    <h3 className="mt-5 text-2xl font-semibold tracking-[-0.04em] text-white">{card.title}</h3>
                    <p className="mt-3 text-base leading-8" style={{ color: 'rgba(255,255,255,0.46)' }}>
                      {card.body}
                    </p>
                  </motion.div>
                ))}
              </div>

              <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                {featureCardsExtended.map((card, index) => (
                  <motion.div
                    key={card.title}
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.35 }}
                    transition={{ duration: 0.6, delay: index * 0.03, ease: sectionEase }}
                    whileHover={{ y: -5 }}
                    className="rounded-[28px] p-6"
                    style={{
                      background: glassSoft,
                      border: borderSubtle,
                      backdropFilter: 'blur(18px) saturate(150%)',
                    }}
                  >
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-2xl"
                      style={{
                        background: `${card.accent}18`,
                        border: `1px solid ${card.accent}30`,
                      }}
                    >
                      <card.icon className="h-5 w-5" style={{ color: card.accent }} />
                    </div>
                    <h3 className="mt-4 text-xl font-semibold tracking-[-0.03em] text-white">{card.title}</h3>
                    <p className="mt-3 text-sm leading-7" style={{ color: textMuted }}>
                      {card.body}
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          <section className="py-16 md:py-24">
            <div style={shell}>
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.75, ease: sectionEase }}
                className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]"
              >
                <div
                  className="rounded-[34px] p-8 md:p-10"
                  style={{
                    background: glassStrong,
                    border: borderSoft,
                    backdropFilter: glassBackdrop,
                    WebkitBackdropFilter: glassBackdrop,
                  }}
                >
                  <div
                    className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      color: 'rgba(255,255,255,0.74)',
                    }}
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">Trusted by teams</span>
                  </div>
                  <h2 className="mt-5 text-3xl font-semibold tracking-[-0.05em] text-white md:text-5xl">
                    Trusted by engineering teams worldwide.
                  </h2>
                  <p className="mt-5 max-w-xl text-base leading-8" style={{ color: textMuted }}>
                    See what teams are saying about their experience with PipelineXR for CI/CD observability.
                  </p>
                </div>

                <div className="grid gap-5">
                  {testimonials.map((item, index) => (
                    <motion.div
                      key={item.name}
                      initial={{ opacity: 0, y: 24 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.35 }}
                      transition={{ duration: 0.65, delay: index * 0.06, ease: sectionEase }}
                      whileHover={{ y: -5 }}
                      className="rounded-[30px] p-6 flex flex-col"
                      style={{
                        background: glassBase,
                        border: borderSubtle,
                        backdropFilter: 'blur(18px) saturate(150%)',
                      }}
                    >
                      <div className="mb-4 flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, starIndex) => (
                          <Star key={starIndex} className="h-4 w-4 fill-current" style={{ color: '#FBBF24' }} />
                        ))}
                      </div>
                      <p className="text-base leading-7 flex-1" style={{ color: 'rgba(255,255,255,0.82)' }}>"{item.quote}"</p>
                      <div className="mt-5 flex items-center gap-3">
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white"
                          style={{ background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)' }}
                        >
                          {item.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-white">{item.name}</div>
                          <div className="text-xs" style={{ color: 'rgba(255,255,255,0.42)' }}>
                            {item.role}, {item.company}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>

              <div className="mt-16 grid gap-5 lg:grid-cols-3">
                {pricingTiers.map((tier, index) => (
                  <motion.div
                    key={tier.name}
                    initial={{ opacity: 0, y: 28 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.35 }}
                    transition={{ duration: 0.7, delay: index * 0.06, ease: sectionEase }}
                    whileHover={{ y: -6, scale: tier.featured ? 1.01 : 1 }}
                    className="rounded-[34px] p-7 md:p-8"
                    style={{
                      background: tier.featured ? 'rgba(28, 28, 30, 0.52)' : glassStrong,
                      border: tier.featured ? '1px solid rgba(52,211,153,0.24)' : borderSoft,
                      boxShadow: tier.featured ? '0 30px 100px rgba(52,211,153,0.08)' : 'none',
                      backdropFilter: glassBackdrop,
                      WebkitBackdropFilter: glassBackdrop,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-2xl font-semibold tracking-[-0.04em] text-white">{tier.name}</h3>
                      {tier.featured && (
                        <div
                          className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]"
                          style={{ background: 'rgba(52,211,153,0.14)', color: '#6EE7B7' }}
                        >
                          Recommended
                        </div>
                      )}
                    </div>
                    <div className="mt-5 text-4xl font-semibold tracking-[-0.05em]" style={{ color: tier.accent }}>
                      {tier.price}
                    </div>
                    <p className="mt-4 text-base leading-8" style={{ color: textMuted }}>
                      {tier.description}
                    </p>
                    <div className="mt-6 space-y-3">
                      {tier.points.map((point) => (
                        <div key={point} className="flex items-center gap-3 text-sm" style={{ color: 'rgba(255,255,255,0.82)' }}>
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: tier.accent }} />
                          <span>{point}</span>
                        </div>
                      ))}
                    </div>
                    <motion.button
                      onClick={() => navigate('/login')}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      transition={{ duration: 0.22 }}
                      className="mt-6 w-full rounded-full py-3 text-sm font-semibold transition-colors"
                      style={{
                        background: tier.featured ? '#F5F7FB' : 'rgba(255,255,255,0.06)',
                        color: tier.featured ? '#05070C' : 'rgba(255,255,255,0.86)',
                        border: tier.featured ? 'none' : '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      {tier.name === 'Enterprise' ? 'Contact Sales' : tier.name === 'Starter' ? 'Get Started Free' : 'Start Free Trial'}
                    </motion.button>
                  </motion.div>
                ))}
              </div>

              <motion.div
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.75, ease: sectionEase }}
                className="mt-16"
              >
                <div className="mb-8 max-w-3xl">
                  <div
                    className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      color: 'rgba(255,255,255,0.74)',
                    }}
                  >
                    <CircleHelp className="h-3.5 w-3.5" />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">FAQ</span>
                  </div>
                  <h2 className="mt-5 text-3xl font-semibold tracking-[-0.05em] text-white md:text-5xl">
                    Frequently asked questions.
                  </h2>
                </div>
                <div className="space-y-4">
                  {faqs.map((item, index) => (
                    <FaqItem
                      key={item.question}
                      item={item}
                      isOpen={openFaq === index}
                      onToggle={() => setOpenFaq(openFaq === index ? -1 : index)}
                    />
                  ))}
                </div>
              </motion.div>
            </div>
          </section>

          <section className="py-16 md:py-24">
            <div style={{ ...shell, maxWidth: '640px' }}>
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.8, ease: sectionEase }}
                className="rounded-[34px] px-6 py-10 md:px-10 md:py-12"
                style={{
                  background: glassStrong,
                  border: borderSoft,
                  backdropFilter: glassBackdrop,
                  WebkitBackdropFilter: glassBackdrop,
                  boxShadow: '0 28px 90px rgba(0,0,0,0.28)',
                }}
              >
                <div className="text-center mb-8">
                  <h2 className="text-3xl font-semibold tracking-[-0.04em] text-white md:text-4xl">
                    Connect With Our Team
                  </h2>
                  <p className="mt-3 text-base" style={{ color: textMuted }}>
                    We respond within one business day.
                  </p>
                </div>

                <form
                  action="https://formspree.io/f/myklknkz"
                  method="POST"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.target;
                    fetch(form.action, {
                      method: 'POST',
                      body: new FormData(form),
                      headers: { Accept: 'application/json' },
                    }).then(res => {
                      if (res.ok) {
                        form.reset();
                        alert('Message sent! We\'ll get back to you within one business day.');
                      } else {
                        alert('Something went wrong. Please try again.');
                      }
                    }).catch(() => alert('Something went wrong. Please try again.'));
                  }}
                  style={{ maxWidth: '480px', margin: '0 auto' }}
                >
                  <div style={{ marginBottom: '20px' }}>
                    <label htmlFor="contact-name" style={{ display: 'block', marginBottom: '8px', fontSize: '12px', fontWeight: 500, opacity: 0.7, color: '#fff' }}>Name</label>
                    <input
                      id="contact-name"
                      type="text"
                      name="name"
                      placeholder="Jane Smith"
                      style={{
                        width: '100%', padding: '12px', borderRadius: '10px',
                        border: '1px solid rgba(238,238,238,0.5)',
                        background: 'rgba(238,238,238,0.1)',
                        color: 'white', fontSize: '14px',
                        outline: 'none', boxSizing: 'border-box',
                        fontFamily: 'inherit',
                        transition: 'border-color 0.3s ease',
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <label htmlFor="contact-email" style={{ display: 'block', marginBottom: '8px', fontSize: '12px', fontWeight: 500, opacity: 0.7, color: '#fff' }}>Email</label>
                    <input
                      id="contact-email"
                      type="email"
                      name="email"
                      placeholder="jane@framer.com"
                      style={{
                        width: '100%', padding: '12px', borderRadius: '10px',
                        border: '1px solid rgba(238,238,238,0.5)',
                        background: 'rgba(238,238,238,0.1)',
                        color: 'white', fontSize: '14px',
                        outline: 'none', boxSizing: 'border-box',
                        fontFamily: 'inherit',
                        transition: 'border-color 0.3s ease',
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <label htmlFor="contact-message" style={{ display: 'block', marginBottom: '8px', fontSize: '12px', fontWeight: 500, opacity: 0.7, color: '#fff' }}>Message</label>
                    <textarea
                      id="contact-message"
                      name="message"
                      placeholder="Your message…"
                      rows={5}
                      style={{
                        width: '100%', padding: '12px', borderRadius: '10px',
                        border: '1px solid rgba(238,238,238,0.5)',
                        background: 'rgba(238,238,238,0.1)',
                        color: 'white', fontSize: '14px',
                        outline: 'none', boxSizing: 'border-box',
                        fontFamily: 'inherit', resize: 'vertical',
                        minHeight: '120px',
                        transition: 'border-color 0.3s ease',
                      }}
                    />
                  </div>

                  <motion.button
                    type="submit"
                    whileHover={{ y: -2, background: 'rgba(255,255,255,0.2)' }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ duration: 0.22 }}
                    style={{
                      width: '100%', padding: '12px 24px',
                      borderRadius: '100px', fontSize: '16px', fontWeight: 600,
                      cursor: 'pointer', border: '1px solid rgba(255,255,255,0.2)',
                      background: 'rgba(255,255,255,0.1)',
                      backdropFilter: 'blur(10px)',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                      color: 'white', fontFamily: 'inherit',
                    }}
                  >
                    Submit
                  </motion.button>
                </form>
              </motion.div>
            </div>
          </section>

          <footer className="pt-8 pb-6 px-5 sm:px-6 md:px-8 xl:px-10" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={shell}>
              <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]">
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-2xl text-[11px] font-black text-white"
                      style={{
                        background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                        boxShadow: '0 0 24px rgba(59,130,246,0.28)',
                      }}
                    >
                      PX
                    </div>
                    <div>
                      <div className="text-sm font-semibold tracking-tight text-white">PipelineXR</div>
                      <div className="text-[11px]" style={{ color: textSoft }}>
                        DevSecOps observability
                      </div>
                    </div>
                  </div>
                  <p className="text-sm leading-6 max-w-xs" style={{ color: 'rgba(255,255,255,0.42)' }}>
                    Complete CI/CD visibility for engineering teams. Monitor pipelines, track DORA metrics, scan for vulnerabilities, and ensure uptime—all in one place.
                  </p>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-white mb-4">Product</h4>
                  <div className="space-y-3">
                    {['Home', 'Features', 'Documentation'].map((item) => (
                      <a
                        key={item}
                        href="#"
                        className="block text-sm transition-colors hover:text-white"
                        style={{ color: 'rgba(255,255,255,0.42)' }}
                        onClick={(e) => {
                          e.preventDefault();
                          if (item === 'Home') window.scrollTo({ top: 0, behavior: 'smooth' });
                          else if (item === 'Features') {
                            const section = document.getElementById('features');
                            if (section) section.scrollIntoView({ behavior: 'smooth' });
                          }
                        }}
                      >
                        {item}
                      </a>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-white mb-4">Company</h4>
                  <div className="space-y-3">
                    {['About', 'Pricing', 'Careers'].map((item) => (
                      <a
                        key={item}
                        href="#"
                        className="block text-sm transition-colors hover:text-white"
                        style={{ color: 'rgba(255,255,255,0.42)' }}
                        onClick={(e) => e.preventDefault()}
                      >
                        {item}
                      </a>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-white mb-4">Resources</h4>
                  <div className="space-y-3">
                    {['Blog', 'API', 'Help Center'].map((item) => (
                      <a
                        key={item}
                        href="#"
                        className="block text-sm transition-colors hover:text-white"
                        style={{ color: 'rgba(255,255,255,0.42)' }}
                        onClick={(e) => e.preventDefault()}
                      >
                        {item}
                      </a>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-white mb-4">Connect</h4>
                  <div className="space-y-3">
                    {[
                      { name: 'GitHub', href: 'https://github.com/Dakshmulundkar' },
                      { name: 'LinkedIn', href: 'https://www.linkedin.com/in/daksh-m-2780a3356' },
                      { name: 'Twitter', href: 'https://twitter.com' },
                    ].map((item) => (
                      <a
                        key={item.name}
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-sm transition-colors hover:text-white"
                        style={{ color: 'rgba(255,255,255,0.42)' }}
                      >
                        {item.name}
                      </a>
                    ))}
                  </div>
                </div>
              </div>

              <div
                className="mt-8 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4"
                style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
              >
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.34)' }}>
                  © 2026 PipelineXR. All rights reserved.
                </p>
                <div className="flex items-center gap-6">
                  <a href="#" className="text-sm transition-colors hover:text-white" style={{ color: 'rgba(255,255,255,0.34)' }} onClick={(e) => e.preventDefault()}>Privacy Policy</a>
                  <a href="#" className="text-sm transition-colors hover:text-white" style={{ color: 'rgba(255,255,255,0.34)' }} onClick={(e) => e.preventDefault()}>Terms of Service</a>
                </div>
              </div>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
};

export default LandingPage;
