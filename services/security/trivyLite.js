/**
 * TrivyLite - Native Node.js security scanner
 * Patterns ported from trivy/pkg/fanal/secret/builtin-rules.go
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// Files to skip (prevent scanning our own scanner source)
const SKIP_FILES = new Set([
    'trivyLite.js', 'scanners.js', 'scanner-processor.js',
    'securityScanner.js', 'securityService.js',
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'
]);

const SKIP_DIRS = new Set([
    'node_modules', '.git', 'dist', 'build', '.next', 'coverage',
    'trivy', '.kiro', 'vendor'
]);

// ─── SECRET RULES ─────────────────────────────────────────────────────────────
const SECRET_RULES = [
    // AWS
    { id: 'aws-access-key-id',     category: 'AWS',    title: 'AWS Access Key ID',     severity: 'CRITICAL', regex: /(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g },
    { id: 'aws-secret-access-key', category: 'AWS',    title: 'AWS Secret Access Key', severity: 'CRITICAL', regex: /(?:aws.{0,20}secret.{0,20}key)\s*[=:]\s*['"]?([A-Za-z0-9\/+=]{40})['"]?/gi },
    // GitHub
    { id: 'github-pat',            category: 'GitHub', title: 'GitHub Personal Access Token',  severity: 'CRITICAL', regex: /ghp_[0-9a-zA-Z]{36}/g },
    { id: 'github-oauth',          category: 'GitHub', title: 'GitHub OAuth Access Token',     severity: 'CRITICAL', regex: /gho_[0-9a-zA-Z]{36}/g },
    { id: 'github-app-token',      category: 'GitHub', title: 'GitHub App Token',              severity: 'CRITICAL', regex: /(ghu|ghs)_[0-9a-zA-Z]{36}/g },
    { id: 'github-refresh-token',  category: 'GitHub', title: 'GitHub Refresh Token',          severity: 'CRITICAL', regex: /ghr_[0-9a-zA-Z]{76}/g },
    { id: 'github-fine-grained',   category: 'GitHub', title: 'GitHub Fine-grained PAT',       severity: 'CRITICAL', regex: /github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}/g },
    // GitLab
    { id: 'gitlab-pat',            category: 'GitLab', title: 'GitLab Personal Access Token',  severity: 'CRITICAL', regex: /glpat-[0-9a-zA-Z\-_]{20}/g },
    // HuggingFace
    { id: 'hugging-face-token',    category: 'HuggingFace', title: 'Hugging Face Access Token', severity: 'CRITICAL', regex: /hf_[A-Za-z0-9]{34,40}/g },
    // Asymmetric Private Keys
    { id: 'private-key',           category: 'AsymmetricPrivateKey', title: 'Asymmetric Private Key', severity: 'HIGH', regex: /-----\s*?BEGIN[ A-Z0-9_-]*?PRIVATE KEY( BLOCK)?\s*?-----/gi },
    // Shopify
    { id: 'shopify-token',         category: 'Shopify', title: 'Shopify Token',         severity: 'HIGH',     regex: /shp(ss|at|ca|pa)_[a-fA-F0-9]{32}/g },
    // Slack
    { id: 'slack-access-token',    category: 'Slack',   title: 'Slack Token',           severity: 'HIGH',     regex: /xox[baprs]-([0-9a-zA-Z]{10,48})/g },
    { id: 'slack-webhook',         category: 'Slack',   title: 'Slack Webhook',         severity: 'MEDIUM',   regex: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9+\/]{44,48}/g },
    // Stripe
    { id: 'stripe-publishable',    category: 'Stripe',  title: 'Stripe Publishable Key', severity: 'LOW',     regex: /pk_(test|live)_[0-9a-zA-Z]{10,32}/gi },
    { id: 'stripe-secret',         category: 'Stripe',  title: 'Stripe Secret Key',      severity: 'CRITICAL', regex: /sk_(test|live)_[0-9a-zA-Z]{10,32}/gi },
    // PyPI
    { id: 'pypi-upload-token',     category: 'PyPI',    title: 'PyPI Upload Token',      severity: 'HIGH',    regex: /pypi-AgEIcHlwaS5vcmc[A-Za-z0-9\-_]{50,1000}/g },
    // Google
    { id: 'gcp-service-account',   category: 'Google',  title: 'GCP Service Account',   severity: 'CRITICAL', regex: /"type":\s*"service_account"/g },
    { id: 'google-api-key',        category: 'Google',  title: 'Google API Key',         severity: 'HIGH',    regex: /AIza[0-9A-Za-z\-_]{35}/g },
    // Heroku
    { id: 'heroku-api-key',        category: 'Heroku',  title: 'Heroku API Key',         severity: 'HIGH',    regex: /(?:heroku.{0,25})[=:>]{1,3}.{0,5}['"]([0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12})['"]/gi },
    // Twilio
    { id: 'twilio-api-key',        category: 'Twilio',  title: 'Twilio API Key',         severity: 'MEDIUM',  regex: /SK[0-9a-fA-F]{32}/g },
    // Age
    { id: 'age-secret-key',        category: 'Age',     title: 'Age Secret Key',         severity: 'MEDIUM',  regex: /AGE-SECRET-KEY-1[QPZRY9X8GF2TVDW0S3JN54KHCE6MUA7L]{58}/g },
    // Facebook
    { id: 'facebook-token',        category: 'Facebook', title: 'Facebook Token',        severity: 'LOW',     regex: /(?:facebook.{0,25})[=:>]{1,3}.{0,5}['"]([a-f0-9]{32})['"]/gi },
    // Twitter
    { id: 'twitter-token',         category: 'Twitter', title: 'Twitter Token',          severity: 'LOW',     regex: /(?:twitter.{0,25})[=:>]{1,3}.{0,5}['"]([a-f0-9]{35,44})['"]/gi },
    // Adobe
    { id: 'adobe-client-id',       category: 'Adobe',   title: 'Adobe Client ID',        severity: 'LOW',     regex: /(?:adobe.{0,25})[=:>]{1,3}.{0,5}['"]([a-f0-9]{32})['"]/gi },
    { id: 'adobe-client-secret',   category: 'Adobe',   title: 'Adobe Client Secret',    severity: 'LOW',     regex: /p8e-[a-z0-9]{32}/gi },
    // Alibaba
    { id: 'alibaba-access-key-id', category: 'Alibaba', title: 'Alibaba AccessKey ID',   severity: 'HIGH',    regex: /(LTAI)[a-z0-9]{20}/gi },
    { id: 'alibaba-secret-key',    category: 'Alibaba', title: 'Alibaba Secret Key',      severity: 'HIGH',    regex: /(?:alibaba.{0,25})[=:>]{1,3}.{0,5}['"]([a-z0-9]{30})['"]/gi },
    // Asana
    { id: 'asana-client-id',       category: 'Asana',   title: 'Asana Client ID',        severity: 'MEDIUM',  regex: /(?:asana.{0,25})[=:>]{1,3}.{0,5}['"]([0-9]{16})['"]/gi },
    { id: 'asana-client-secret',   category: 'Asana',   title: 'Asana Client Secret',    severity: 'MEDIUM',  regex: /(?:asana.{0,25})[=:>]{1,3}.{0,5}['"]([a-z0-9]{32})['"]/gi },
    // Atlassian
    { id: 'atlassian-api-token',   category: 'Atlassian', title: 'Atlassian API Token',  severity: 'HIGH',    regex: /(?:atlassian.{0,25})[=:>]{1,3}.{0,5}['"]([a-z0-9]{24})['"]/gi },
    // Bitbucket
    { id: 'bitbucket-client-id',     category: 'Bitbucket', title: 'Bitbucket Client ID',     severity: 'HIGH', regex: /(?:bitbucket.{0,25})[=:>]{1,3}.{0,5}['"]([a-z0-9]{32})['"]/gi },
    { id: 'bitbucket-client-secret', category: 'Bitbucket', title: 'Bitbucket Client Secret', severity: 'HIGH', regex: /(?:bitbucket.{0,25})[=:>]{1,3}.{0,5}['"]([a-z0-9_\-]{64})['"]/gi },
    // Clojars
    { id: 'clojars-api-token',     category: 'Clojars',    title: 'Clojars API Token',   severity: 'MEDIUM',  regex: /CLOJARS_[a-z0-9]{60}/gi },
    // Databricks
    { id: 'databricks-api-token',  category: 'Databricks', title: 'Databricks API Token', severity: 'MEDIUM', regex: /dapi[a-h0-9]{32}/g },
    // Discord
    { id: 'discord-api-token',     category: 'Discord', title: 'Discord API Key',        severity: 'MEDIUM',  regex: /(?:discord.{0,25})[=:>]{1,3}.{0,5}['"]([a-h0-9]{64})['"]/gi },
    { id: 'discord-client-id',     category: 'Discord', title: 'Discord Client ID',      severity: 'MEDIUM',  regex: /(?:discord.{0,25})[=:>]{1,3}.{0,5}['"]([0-9]{18})['"]/gi },
    { id: 'discord-client-secret', category: 'Discord', title: 'Discord Client Secret',  severity: 'MEDIUM',  regex: /(?:discord.{0,25})[=:>]{1,3}.{0,5}['"]([a-z0-9=_\-]{32})['"]/gi },
    { id: 'discord-webhook',       category: 'Discord', title: 'Discord Webhook URL',    severity: 'MEDIUM',  regex: /https:\/\/discord(?:app)?\.com\/api\/webhooks\/[0-9]{18}\/[a-zA-Z0-9_-]+/g },
    // Doppler
    { id: 'doppler-api-token',     category: 'Doppler',    title: 'Doppler API Token',   severity: 'MEDIUM',  regex: /['"]dp\.pt\.[a-z0-9]{43}['"]/gi },
    // Dropbox
    { id: 'dropbox-api-secret',    category: 'Dropbox',    title: 'Dropbox API Secret',  severity: 'HIGH',    regex: /(?:dropbox.{0,25})[=:>]{1,3}.{0,5}['"]([a-z0-9]{15})['"]/gi },
    { id: 'dropbox-short-lived',   category: 'Dropbox',    title: 'Dropbox Short-lived Token', severity: 'HIGH', regex: /(?:dropbox.{0,25})[=:>]{1,3}.{0,5}['"]sl\.[a-z0-9\-=_]{135}['"]/gi },
    // Duffel
    { id: 'duffel-api-token',      category: 'Duffel',     title: 'Duffel API Token',    severity: 'LOW',     regex: /['"]duffel_(?:test|live)_[a-z0-9_-]{43}['"]/gi },
    // Dynatrace
    { id: 'dynatrace-api-token',   category: 'Dynatrace',  title: 'Dynatrace API Token', severity: 'MEDIUM',  regex: /['"]dt0c01\.[a-z0-9]{24}\.[a-z0-9]{64}['"]/gi },
    // EasyPost
    { id: 'easypost-api-token',    category: 'Easypost',   title: 'EasyPost API Token',  severity: 'LOW',     regex: /['"]EZ[AT]K[a-z0-9]{54}['"]/gi },
    // Fastly
    { id: 'fastly-api-token',      category: 'Fastly',     title: 'Fastly API Token',    severity: 'MEDIUM',  regex: /(?:fastly.{0,25})[=:>]{1,3}.{0,5}['"]([a-z0-9\-=_]{32})['"]/gi },
    // Flutterwave
    { id: 'flutterwave-key',       category: 'Flutterwave', title: 'Flutterwave Key',    severity: 'MEDIUM',  regex: /FLW(?:PUB|SEC)K_TEST-[a-h0-9]{32}-X/gi },
    { id: 'flutterwave-enc-key',   category: 'Flutterwave', title: 'Flutterwave Enc Key', severity: 'MEDIUM', regex: /FLWSECK_TEST[a-h0-9]{12}/g },
    // Frame.io
    { id: 'frameio-api-token',     category: 'Frameio',    title: 'Frame.io API Token',  severity: 'LOW',     regex: /fio-u-[a-z0-9\-_=]{64}/gi },
    // GoCardless
    { id: 'gocardless-api-token',  category: 'GoCardless', title: 'GoCardless API Token', severity: 'MEDIUM', regex: /['"]live_[a-z0-9\-_=]{40}['"]/gi },
    // Grafana
    { id: 'grafana-api-token',     category: 'Grafana',    title: 'Grafana API Token',   severity: 'MEDIUM',  regex: /['"]?eyJrIjoi[a-z0-9\-_=]{72,92}['"]?/gi },
    // HashiCorp
    { id: 'hashicorp-tf-api-token', category: 'HashiCorp', title: 'HashiCorp Terraform API Token', severity: 'MEDIUM', regex: /['"][a-z0-9]{14}\.atlasv1\.[a-z0-9\-_=]{60,70}['"]/gi },
    // HubSpot
    { id: 'hubspot-api-token',     category: 'HubSpot',    title: 'HubSpot API Token',   severity: 'LOW',     regex: /(?:hubspot.{0,25})[=:>]{1,3}.{0,5}['"]([a-h0-9]{8}-[a-h0-9]{4}-[a-h0-9]{4}-[a-h0-9]{4}-[a-h0-9]{12})['"]/gi },
    // Intercom
    { id: 'intercom-api-token',    category: 'Intercom',   title: 'Intercom API Token',  severity: 'LOW',     regex: /(?:intercom.{0,25})[=:>]{1,3}.{0,5}['"]([a-z0-9=_]{60})['"]/gi },
    { id: 'intercom-client-secret', category: 'Intercom',  title: 'Intercom Client Secret', severity: 'LOW',  regex: /(?:intercom.{0,25})[=:>]{1,3}.{0,5}['"]([a-h0-9]{8}-[a-h0-9]{4}-[a-h0-9]{4}-[a-h0-9]{4}-[a-h0-9]{12})['"]/gi },
    // JWT
    { id: 'jwt-token',             category: 'JWT',        title: 'JWT Token',           severity: 'MEDIUM',  regex: /ey[a-zA-Z0-9]{17,}\.ey[a-zA-Z0-9\/\\_-]{17,}\.(?:[a-zA-Z0-9\/\\_-]{10,}={0,2})?/g },
    // Linear
    { id: 'linear-api-token',      category: 'Linear',     title: 'Linear API Token',    severity: 'MEDIUM',  regex: /lin_api_[a-z0-9]{40}/gi },
    { id: 'linear-client-secret',  category: 'Linear',     title: 'Linear Client Secret', severity: 'MEDIUM', regex: /(?:linear.{0,25})[=:>]{1,3}.{0,5}['"]([a-f0-9]{32})['"]/gi },
    // Mailchimp
    { id: 'mailchimp-api-key',     category: 'Mailchimp',  title: 'Mailchimp API Key',   severity: 'MEDIUM',  regex: /(?:mailchimp.{0,25})[=:>]{1,3}.{0,5}['"]([a-f0-9]{32}-us[0-9]{1,2})['"]/gi },
    // Mailgun
    { id: 'mailgun-api-token',     category: 'Mailgun',    title: 'Mailgun API Token',   severity: 'MEDIUM',  regex: /(?:mailgun.{0,25})[=:>]{1,3}.{0,5}['"]((pub)?key-[a-f0-9]{32})['"]/gi },
    { id: 'mailgun-signing-key',   category: 'Mailgun',    title: 'Mailgun Signing Key',  severity: 'MEDIUM', regex: /(?:mailgun.{0,25})[=:>]{1,3}.{0,5}['"]([a-h0-9]{32}-[a-h0-9]{8}-[a-h0-9]{8})['"]/gi },
    // Mapbox
    { id: 'mapbox-api-token',      category: 'Mapbox',     title: 'Mapbox API Token',    severity: 'MEDIUM',  regex: /pk\.[a-z0-9]{60}\.[a-z0-9]{22}/gi },
    // New Relic
    { id: 'new-relic-user-api-key',      category: 'NewRelic', title: 'New Relic User API Key',           severity: 'MEDIUM', regex: /['"]NRAK-[A-Z0-9]{27}['"]/g },
    { id: 'new-relic-browser-api-token', category: 'NewRelic', title: 'New Relic Browser API Token',      severity: 'MEDIUM', regex: /['"]NRJS-[a-f0-9]{19}['"]/g },
    // npm
    { id: 'npm-access-token',      category: 'Npm',        title: 'npm Access Token',    severity: 'CRITICAL', regex: /['"]npm_[a-z0-9]{36}['"]/gi },
    // PlanetScale
    { id: 'planetscale-password',  category: 'Planetscale', title: 'PlanetScale Password', severity: 'MEDIUM', regex: /pscale_pw_[a-z0-9\-_.]{43}/gi },
    { id: 'planetscale-api-token', category: 'Planetscale', title: 'PlanetScale API Token', severity: 'MEDIUM', regex: /pscale_tkn_[a-z0-9\-_.]{43}/gi },
    // Postman
    { id: 'postman-api-token',     category: 'Postman',    title: 'Postman API Token',   severity: 'MEDIUM',  regex: /PMAK-[a-f0-9]{24}-[a-f0-9]{34}/gi },
    // Pulumi
    { id: 'pulumi-api-token',      category: 'Pulumi',     title: 'Pulumi API Token',    severity: 'HIGH',    regex: /pul-[a-f0-9]{40}/g },
    // RubyGems
    { id: 'rubygems-api-token',    category: 'RubyGems',   title: 'RubyGems API Token',  severity: 'MEDIUM',  regex: /rubygems_[a-f0-9]{48}/g },
    // SendGrid
    { id: 'sendgrid-api-token',    category: 'SendGrid',   title: 'SendGrid API Token',  severity: 'MEDIUM',  regex: /SG\.[a-z0-9_\-.]{66}/gi },
    // Sendinblue
    { id: 'sendinblue-api-token',  category: 'Sendinblue', title: 'Sendinblue API Token', severity: 'LOW',    regex: /xkeysib-[a-f0-9]{64}-[a-z0-9]{16}/gi },
    // Shippo
    { id: 'shippo-api-token',      category: 'Shippo',     title: 'Shippo API Token',    severity: 'LOW',     regex: /shippo_(?:test|live)_[a-f0-9]{40}/gi },
    // LinkedIn
    { id: 'linkedin-client-id',    category: 'LinkedIn',   title: 'LinkedIn Client ID',  severity: 'LOW',     regex: /(?:linkedin.{0,25})[=:>]{1,3}.{0,5}['"]([a-z0-9]{14})['"]/gi },
    { id: 'linkedin-client-secret', category: 'LinkedIn',  title: 'LinkedIn Client Secret', severity: 'LOW',  regex: /(?:linkedin.{0,25})[=:>]{1,3}.{0,5}['"]([a-z0-9]{16})['"]/gi },
    // Twitch
    { id: 'twitch-api-token',      category: 'Twitch',     title: 'Twitch API Token',    severity: 'LOW',     regex: /(?:twitch.{0,25})[=:>]{1,3}.{0,5}['"]([a-z0-9]{30})['"]/gi },
    // Typeform
    { id: 'typeform-api-token',    category: 'Typeform',   title: 'Typeform API Token',  severity: 'MEDIUM',  regex: /(?:typeform.{0,25})[=:>]{1,3}.{0,5}['"]tfp_[a-z0-9\-_.]{59}['"]/gi },
    // Docker
    { id: 'docker-auth',           category: 'Docker',     title: 'Docker Registry Auth', severity: 'HIGH',   regex: /(?:docker.{0,25})(?:password|token|secret).{0,5}[=:]\s*['"]([A-Za-z0-9+\/]{20,}={0,2})['"]/gi },
    // Symfony
    { id: 'symfony-secret',        category: 'Symfony',    title: 'Symfony APP_SECRET',  severity: 'MEDIUM',  regex: /APP_SECRET\s*=\s*['"]?([a-f0-9]{32})['"]?/gi },
    // Databases
    { id: 'mongodb-connection',    category: 'Database',   title: 'MongoDB Connection String',    severity: 'HIGH', regex: /mongodb(?:\+srv)?:\/\/[^:]+:[^@]+@[^\s'"]+/g },
    { id: 'postgres-connection',   category: 'Database',   title: 'PostgreSQL Connection String', severity: 'HIGH', regex: /postgres(?:ql)?:\/\/[^:]+:[^@]+@[^\s'"]+/g },
    { id: 'mysql-connection',      category: 'Database',   title: 'MySQL Connection String',      severity: 'HIGH', regex: /mysql:\/\/[^:]+:[^@]+@[^\s'"]+/g },
    { id: 'redis-connection',      category: 'Database',   title: 'Redis Connection String',      severity: 'HIGH', regex: /redis:\/\/[^:]*:[^@]+@[^\s'"]+/g },
    // Generic
    { id: 'generic-api-key',       category: 'Generic',    title: 'Generic API Key',     severity: 'MEDIUM',  regex: /(?:api_key|apikey|api-key)\s*[=:]\s*['"]?([A-Za-z0-9_\-]{20,})['"]?/gi },
    { id: 'generic-secret',        category: 'Generic',    title: 'Generic Secret',      severity: 'MEDIUM',  regex: /(?:secret|password|passwd|pwd)\s*=\s*['"]([^'"\s]{8,})['"](?!\s*#)/gi },
    { id: 'paypal-braintree',      category: 'PayPal',     title: 'PayPal Braintree Token', severity: 'CRITICAL', regex: /access_token\$production\$[0-9a-z]{16}\$[0-9a-f]{32}/g },
];

// ─── SAST RULES ───────────────────────────────────────────────────────────────
const SAST_RULES = [
    { id: 'eval-usage',         title: 'eval() Usage',              severity: 'HIGH',   regex: /\beval\s*\(/g,                                    description: 'eval() can execute arbitrary code' },
    { id: 'sql-injection',      title: 'Potential SQL Injection',   severity: 'HIGH',   regex: /(?:query|execute|exec)\s*\(\s*[`'"]\s*SELECT.*\+/gi, description: 'String concatenation in SQL query' },
    { id: 'command-injection',  title: 'Command Injection Risk',    severity: 'HIGH',   regex: /(?:exec|spawn|execSync)\s*\(\s*(?:req\.|res\.|user|input)/gi, description: 'User input passed to shell command' },
    { id: 'hardcoded-password', title: 'Hardcoded Password',        severity: 'HIGH',   regex: /(?:password|passwd|pwd)\s*=\s*['"][^'"]{4,}['"]/gi, description: 'Hardcoded credential in source' },
    { id: 'insecure-random',    title: 'Insecure Randomness',       severity: 'MEDIUM', regex: /Math\.random\(\)/g,                               description: 'Math.random() is not cryptographically secure' },
    { id: 'xss-innerhtml',      title: 'XSS via innerHTML',         severity: 'HIGH',   regex: /\.innerHTML\s*=/g,                                description: 'Direct innerHTML assignment can lead to XSS' },
    { id: 'path-traversal',     title: 'Path Traversal Risk',       severity: 'HIGH',   regex: /(?:readFile|writeFile|createReadStream)\s*\([^)]*(?:req\.|res\.|params|query)/gi, description: 'User input in file path' },
    { id: 'nosql-injection',    title: 'NoSQL Injection Risk',      severity: 'HIGH',   regex: /\$where\s*:|\.find\s*\(\s*\{[^}]*\$(?:where|regex|gt|lt)/gi, description: 'Potential NoSQL injection' },
    { id: 'open-redirect',      title: 'Open Redirect',             severity: 'MEDIUM', regex: /res\.redirect\s*\([^)]*(?:req\.|params|query)/gi, description: 'User-controlled redirect target' },
    { id: 'prototype-pollution', title: 'Prototype Pollution',      severity: 'HIGH',   regex: /\.__proto__\s*=|Object\.assign\s*\(\s*\{\s*\}/g, description: 'Potential prototype pollution' },
    { id: 'weak-crypto',        title: 'Weak Cryptography',         severity: 'MEDIUM', regex: /createHash\s*\(\s*['"](?:md5|sha1)['"]\)/gi,      description: 'MD5/SHA1 are cryptographically weak' },
    { id: 'cors-wildcard',      title: 'CORS Wildcard',             severity: 'MEDIUM', regex: /Access-Control-Allow-Origin.*\*/gi,               description: 'Wildcard CORS allows any origin' },
    { id: 'debug-enabled',      title: 'Debug Mode Enabled',        severity: 'LOW',    regex: /(?:DEBUG|debug)\s*=\s*(?:true|1|'true')/gi,       description: 'Debug mode should not be enabled in production' },
    { id: 'console-log-secret', title: 'Logging Sensitive Data',    severity: 'MEDIUM', regex: /console\.(?:log|info|warn|error)\s*\([^)]*(?:password|token|secret|key)/gi, description: 'Sensitive data may be logged' },
];

// ─── DOCKERFILE RULES ─────────────────────────────────────────────────────────
const DOCKERFILE_RULES = [
    { id: 'docker-latest-tag',    title: 'Docker Image Using :latest Tag',  severity: 'MEDIUM', regex: /^FROM\s+[^\s:]+:latest/gim,          description: 'Using :latest tag is non-deterministic' },
    { id: 'docker-root-user',     title: 'Container Running as Root',       severity: 'HIGH',   regex: /^USER\s+root/gim,                    description: 'Running as root increases attack surface' },
    { id: 'docker-no-user',       title: 'No USER Directive',               severity: 'MEDIUM', regex: /^FROM\b/gim,                         description: 'No USER directive — container may run as root' },
    { id: 'docker-add-url',       title: 'ADD with URL (use COPY instead)', severity: 'LOW',    regex: /^ADD\s+https?:\/\//gim,              description: 'ADD with URL bypasses cache and is insecure' },
    { id: 'docker-expose-ssh',    title: 'SSH Port Exposed',                severity: 'HIGH',   regex: /^EXPOSE\s+22\b/gim,                  description: 'Exposing SSH port in container is risky' },
    { id: 'docker-apt-no-pin',    title: 'apt-get Without Version Pinning', severity: 'LOW',    regex: /apt-get\s+install(?!\s+[a-z]+=)/gi,  description: 'Package versions should be pinned for reproducibility' },
    { id: 'docker-curl-pipe-sh',  title: 'curl | sh Pattern',               severity: 'HIGH',   regex: /curl\s+.*\|\s*(?:ba)?sh/gi,          description: 'Piping curl to shell is a security risk' },
    { id: 'docker-secrets-env',   title: 'Secrets in ENV',                  severity: 'HIGH',   regex: /^ENV\s+(?:PASSWORD|SECRET|TOKEN|KEY|API_KEY)\s*=/gim, description: 'Secrets should not be stored in ENV' },
];

// ─── K8S RULES ────────────────────────────────────────────────────────────────
const K8S_RULES = [
    { id: 'k8s-privileged',       title: 'Privileged Container',            severity: 'CRITICAL', regex: /privileged:\s*true/gi,              description: 'Privileged containers have full host access' },
    { id: 'k8s-host-network',     title: 'Host Network Access',             severity: 'HIGH',     regex: /hostNetwork:\s*true/gi,             description: 'Container shares host network namespace' },
    { id: 'k8s-host-pid',         title: 'Host PID Namespace',              severity: 'HIGH',     regex: /hostPID:\s*true/gi,                 description: 'Container shares host PID namespace' },
    { id: 'k8s-allow-privilege',  title: 'AllowPrivilegeEscalation',        severity: 'HIGH',     regex: /allowPrivilegeEscalation:\s*true/gi, description: 'Privilege escalation should be disabled' },
    { id: 'k8s-no-resource-limits', title: 'No Resource Limits',            severity: 'MEDIUM',   regex: /containers:[\s\S]*?(?!resources:)/gi, description: 'Containers without resource limits can exhaust node resources' },
    { id: 'k8s-default-sa',       title: 'Default Service Account',         severity: 'LOW',      regex: /serviceAccountName:\s*default/gi,   description: 'Using default service account is not recommended' },
    { id: 'k8s-secrets-env',      title: 'Secrets in Environment Variables', severity: 'MEDIUM',  regex: /secretKeyRef:/gi,                   description: 'Consider using a secrets manager instead' },
];

// ─── IAC RULES ────────────────────────────────────────────────────────────────
const IAC_RULES = [
    { id: 'tf-public-s3',         title: 'Public S3 Bucket',                severity: 'HIGH',   regex: /acl\s*=\s*["']public-read["']/gi,    description: 'S3 bucket is publicly readable' },
    { id: 'tf-open-sg',           title: 'Security Group Open to World',     severity: 'HIGH',   regex: /cidr_blocks\s*=\s*\["0\.0\.0\.0\/0"\]/gi, description: 'Security group allows all inbound traffic' },
    { id: 'tf-unencrypted-ebs',   title: 'Unencrypted EBS Volume',           severity: 'MEDIUM', regex: /encrypted\s*=\s*false/gi,            description: 'EBS volume is not encrypted' },
    { id: 'tf-no-mfa-delete',     title: 'S3 MFA Delete Disabled',           severity: 'MEDIUM', regex: /mfa_delete\s*=\s*["']Disabled["']/gi, description: 'MFA delete should be enabled for S3' },
    { id: 'tf-public-rds',        title: 'Publicly Accessible RDS',          severity: 'HIGH',   regex: /publicly_accessible\s*=\s*true/gi,   description: 'RDS instance is publicly accessible' },
    { id: 'tf-no-versioning',     title: 'S3 Versioning Disabled',           severity: 'LOW',    regex: /versioning\s*\{[\s\S]*?enabled\s*=\s*false/gi, description: 'S3 versioning should be enabled' },
];

// ─── VULN DB (known CVEs in common packages) ──────────────────────────────────
const VULN_DB = [
    { id: 'CVE-2021-44228', package: 'log4j',          severity: 'CRITICAL', title: 'Log4Shell RCE',                  description: 'Remote code execution via JNDI lookup in log4j', fixedVersion: '2.15.0' },
    { id: 'CVE-2021-45046', package: 'log4j',          severity: 'CRITICAL', title: 'Log4Shell Bypass',               description: 'Bypass of CVE-2021-44228 fix', fixedVersion: '2.16.0' },
    { id: 'CVE-2022-22965', package: 'spring-core',    severity: 'CRITICAL', title: 'Spring4Shell RCE',               description: 'Remote code execution in Spring Framework', fixedVersion: '5.3.18' },
    { id: 'CVE-2021-42013', package: 'apache-httpd',   severity: 'CRITICAL', title: 'Apache Path Traversal',          description: 'Path traversal and RCE in Apache HTTP Server', fixedVersion: '2.4.51' },
    { id: 'CVE-2022-0778',  package: 'openssl',        severity: 'HIGH',     title: 'OpenSSL Infinite Loop',          description: 'Infinite loop in BN_mod_sqrt() causes DoS', fixedVersion: '1.1.1n' },
    { id: 'CVE-2021-3711',  package: 'openssl',        severity: 'CRITICAL', title: 'OpenSSL SM2 Buffer Overflow',    description: 'Buffer overflow in SM2 decryption', fixedVersion: '1.1.1l' },
    { id: 'CVE-2022-25881', package: 'http-cache-semantics', severity: 'HIGH', title: 'ReDoS in http-cache-semantics', description: 'Regular expression denial of service', fixedVersion: '4.1.1' },
    { id: 'CVE-2022-24999', package: 'qs',             severity: 'HIGH',     title: 'qs Prototype Pollution',         description: 'Prototype pollution via query string parsing', fixedVersion: '6.11.0' },
    { id: 'CVE-2022-3517',  package: 'minimatch',      severity: 'HIGH',     title: 'minimatch ReDoS',                description: 'Regular expression denial of service', fixedVersion: '3.0.5' },
    { id: 'CVE-2022-37601', package: 'loader-utils',   severity: 'CRITICAL', title: 'loader-utils Prototype Pollution', description: 'Prototype pollution in parseQuery', fixedVersion: '2.0.3' },
    { id: 'CVE-2023-44270', package: 'postcss',        severity: 'MEDIUM',   title: 'PostCSS Line Return Parsing',    description: 'Incorrect parsing of CSS', fixedVersion: '8.4.31' },
    { id: 'CVE-2023-26115', package: 'word-wrap',      severity: 'HIGH',     title: 'word-wrap ReDoS',                description: 'Regular expression denial of service', fixedVersion: '1.2.4' },
    { id: 'CVE-2023-28155', package: 'request',        severity: 'MEDIUM',   title: 'request SSRF',                   description: 'Server-side request forgery via redirect', fixedVersion: null },
    { id: 'CVE-2022-46175', package: 'json5',          severity: 'HIGH',     title: 'json5 Prototype Pollution',      description: 'Prototype pollution via parse()', fixedVersion: '2.2.2' },
    { id: 'CVE-2023-45133', package: '@babel/traverse', severity: 'CRITICAL', title: 'Babel Traverse Code Execution', description: 'Arbitrary code execution via malicious code', fixedVersion: '7.23.2' },
    { id: 'CVE-2022-25858', package: 'terser',         severity: 'HIGH',     title: 'Terser ReDoS',                   description: 'Regular expression denial of service', fixedVersion: '5.14.2' },
    { id: 'CVE-2021-23337', package: 'lodash',         severity: 'HIGH',     title: 'Lodash Command Injection',       description: 'Command injection via template', fixedVersion: '4.17.21' },
    { id: 'CVE-2020-8203',  package: 'lodash',         severity: 'HIGH',     title: 'Lodash Prototype Pollution',     description: 'Prototype pollution via zipObjectDeep', fixedVersion: '4.17.19' },
    { id: 'CVE-2022-1650',  package: 'eventsource',    severity: 'CRITICAL', title: 'EventSource Credential Leak',    description: 'Credentials sent to untrusted hosts', fixedVersion: '2.0.2' },
    { id: 'CVE-2021-3803',  package: 'nth-check',      severity: 'HIGH',     title: 'nth-check ReDoS',                description: 'Inefficient regular expression', fixedVersion: '2.0.1' },
];

// ─── Scanner helpers ──────────────────────────────────────────────────────────

function shouldSkipFile(filePath) {
    const base = path.basename(filePath);
    if (SKIP_FILES.has(base)) return true;
    const parts = filePath.split(path.sep);
    return parts.some(p => SKIP_DIRS.has(p));
}

function collectFiles(dir, exts, results = []) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (!SKIP_DIRS.has(e.name)) collectFiles(full, exts, results);
        } else if (e.isFile() && exts.some(x => e.name.endsWith(x))) {
            if (!shouldSkipFile(full)) results.push(full);
        }
    }
    return results;
}

function scanFileForSecrets(filePath) {
    let content;
    try { content = fs.readFileSync(filePath, 'utf8'); } catch { return []; }
    const findings = [];
    for (const rule of SECRET_RULES) {
        const re = new RegExp(rule.regex.source, rule.regex.flags);
        if (re.test(content)) {
            findings.push({
                id: rule.id, title: rule.title, category: rule.category,
                severity: rule.severity, file: filePath,
                description: `${rule.title} detected in ${path.basename(filePath)}`
            });
        }
    }
    return findings;
}

function scanFileForSAST(filePath) {
    let content;
    try { content = fs.readFileSync(filePath, 'utf8'); } catch { return []; }
    const findings = [];
    for (const rule of SAST_RULES) {
        const re = new RegExp(rule.regex.source, rule.regex.flags);
        if (re.test(content)) {
            findings.push({
                id: rule.id, title: rule.title, severity: rule.severity,
                file: filePath, description: rule.description
            });
        }
    }
    return findings;
}

function scanDockerfile(filePath) {
    let content;
    try { content = fs.readFileSync(filePath, 'utf8'); } catch { return []; }
    const findings = [];
    for (const rule of DOCKERFILE_RULES) {
        const re = new RegExp(rule.regex.source, rule.regex.flags);
        if (re.test(content)) {
            findings.push({
                id: rule.id, title: rule.title, severity: rule.severity,
                file: filePath, description: rule.description
            });
        }
    }
    return findings;
}

function scanK8sFile(filePath) {
    let content;
    try { content = fs.readFileSync(filePath, 'utf8'); } catch { return []; }
    const findings = [];
    for (const rule of K8S_RULES) {
        const re = new RegExp(rule.regex.source, rule.regex.flags);
        if (re.test(content)) {
            findings.push({
                id: rule.id, title: rule.title, severity: rule.severity,
                file: filePath, description: rule.description
            });
        }
    }
    return findings;
}

function scanIaCFile(filePath) {
    let content;
    try { content = fs.readFileSync(filePath, 'utf8'); } catch { return []; }
    const findings = [];
    for (const rule of IAC_RULES) {
        const re = new RegExp(rule.regex.source, rule.regex.flags);
        if (re.test(content)) {
            findings.push({
                id: rule.id, title: rule.title, severity: rule.severity,
                file: filePath, description: rule.description
            });
        }
    }
    return findings;
}

function scanPackageJson(filePath) {
    let pkg;
    try { pkg = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return []; }
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const findings = [];
    for (const [name, version] of Object.entries(deps)) {
        const vuln = VULN_DB.find(v => v.package === name);
        if (vuln) {
            findings.push({
                id: vuln.id, package: name, severity: vuln.severity,
                title: vuln.title, description: vuln.description,
                installedVersion: version.replace(/[\^~>=<]/g, ''),
                fixedVersion: vuln.fixedVersion
            });
        }
    }
    return findings;
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function scanDirectory(dirPath) {
    const secrets = [];
    const vulnerabilities = [];
    const misconfigurations = [];

    // Secret scanning — all text-like files
    const secretFiles = collectFiles(dirPath, [
        '.js', '.jsx', '.ts', '.tsx', '.py', '.rb', '.go', '.java',
        '.env', '.yml', '.yaml', '.json', '.toml', '.ini', '.cfg',
        '.sh', '.bash', '.zsh', '.conf', '.config', '.properties', '.xml'
    ]);
    for (const f of secretFiles) {
        secrets.push(...scanFileForSecrets(f));
    }

    // SAST — JS/TS source files
    const sastFiles = collectFiles(dirPath, ['.js', '.jsx', '.ts', '.tsx']);
    for (const f of sastFiles) {
        misconfigurations.push(...scanFileForSAST(f));
    }

    // Dockerfile scanning
    const dockerFiles = [];
    function findDockerfiles(d) {
        let entries;
        try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            if (e.isDirectory() && !SKIP_DIRS.has(e.name)) findDockerfiles(path.join(d, e.name));
            else if (e.isFile() && (e.name === 'Dockerfile' || e.name.startsWith('Dockerfile.'))) {
                const fp = path.join(d, e.name);
                if (!shouldSkipFile(fp)) dockerFiles.push(fp);
            }
        }
    }
    findDockerfiles(dirPath);
    for (const f of dockerFiles) {
        misconfigurations.push(...scanDockerfile(f));
    }

    // K8s YAML scanning
    const k8sFiles = collectFiles(dirPath, ['.yaml', '.yml']);
    for (const f of k8sFiles) {
        misconfigurations.push(...scanK8sFile(f));
    }

    // IaC scanning (.tf files)
    const iacFiles = collectFiles(dirPath, ['.tf']);
    for (const f of iacFiles) {
        misconfigurations.push(...scanIaCFile(f));
    }

    // Package vulnerability scanning
    const pkgFiles = collectFiles(dirPath, ['package.json']);
    for (const f of pkgFiles) {
        if (!f.includes('node_modules')) {
            vulnerabilities.push(...scanPackageJson(f));
        }
    }

    return { secrets, vulnerabilities, misconfigurations };
}

module.exports = { scanDirectory, SECRET_RULES, SAST_RULES, DOCKERFILE_RULES, K8S_RULES, IAC_RULES, VULN_DB };
