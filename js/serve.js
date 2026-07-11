/**
 * serve.js — 掌中光 API 中转服务器
 * ============================================================
 * 用途：部署到云服务器，作为前端与阿里云 DashScope 之间的安全中间层。
 *       所有 AI API 调用经由本服务转发，API Key 仅存储在服务器端，
 *       永远不会暴露到前端浏览器。
 *
 * 启动方式：
 *   DASHSCOPE_KEY="sk-xxxxxxxx" node js/serve.js
 *
 *   或创建 .env 文件：
 *   DASHSCOPE_KEY=sk-xxxxxxxx
 *   PORT=3000
 *
 * 支持的转发端点：
 *   POST /api/llm          — 通义千问 非流式对话
 *   POST /api/llm/stream   — 通义千问 SSE 流式输出
 *   POST /api/t2i          — 通义万相 文生图
 *   POST /api/i2v          — 通义万相 图生视频
 *   POST /api/i2v/poll/:id — 查询 I2V 异步任务状态
 *   POST /api/tts          — 通义语音 TTS
 *   POST /api/audio        — 通义音频 音效生成
 *   GET  /api/health       — 健康检查
 *   GET  /*                — 静态文件服务（前端页面）
 * ============================================================
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

// ================================================================
// 配置
// ================================================================
const DASHSCOPE_KEY = process.env.DASHSCOPE_KEY || '';
const PORT = parseInt(process.env.PORT || '3000', 10);
const STATIC_DIR = path.resolve(__dirname, '..');
const RATE_LIMIT_WINDOW = 60000; // 1分钟窗口
const RATE_LIMIT_MAX = 60;       // 每窗口最多60次请求
const MAX_BODY_SIZE = 5 * 1024 * 1024; // 5MB

// ================================================================
// 日志
// ================================================================
const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const LOG_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || 'INFO'] || 1;

function log(level, msg, extra = '') {
    if (LOG_LEVELS[level] < LOG_LEVEL) return;
    const ts = new Date().toISOString().slice(11, 19);
    const prefix = { DEBUG: '🔍', INFO: '📡', WARN: '⚠️', ERROR: '❌' }[level] || '  ';
    console.log(ts + ' ' + prefix + ' ' + msg, extra);
}

// ================================================================
// 速率限制
// ================================================================
const rateLimitMap = new Map();
setInterval(() => { rateLimitMap.clear(); }, RATE_LIMIT_WINDOW);

function checkRateLimit(ip) {
    const count = (rateLimitMap.get(ip) || 0) + 1;
    rateLimitMap.set(ip, count);
    if (count > RATE_LIMIT_MAX) {
        log('WARN', '速率限制触发', 'IP=' + ip + ' count=' + count);
        return false;
    }
    return true;
}

// ================================================================
// DashScope API 端点映射
// ================================================================
const DASHSCOPE_BASE = 'dashscope.aliyuncs.com';

const ENDPOINTS = {
    llm:        '/compatible-mode/v1/chat/completions',
    t2i:        '/api/v1/services/aigc/text2image/image-synthesis',
    i2v:        '/api/v1/services/aigc/video-generation/video-synthesis',
    tts:        'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/speech',
};

// ================================================================
// 转发请求到 DashScope
// ================================================================
/**
 * @param {string} dashscopePath — API路径
 * @param {object} body          — 请求体
 * @param {object} extraHeaders  — 额外请求头
 * @returns {Promise<{status, headers, body}>}
 */
function forwardToDashScope(dashscopePath, body, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);

        // 支持完整URL和相对路径两种格式
        const isFullUrl = dashscopePath.startsWith('http');
        const targetUrl = isFullUrl ? new URL(dashscopePath) : null;
        const options = {
            hostname: isFullUrl ? targetUrl.hostname : DASHSCOPE_BASE,
            path: isFullUrl ? targetUrl.pathname + targetUrl.search : dashscopePath,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + DASHSCOPE_KEY,
                'Content-Length': Buffer.byteLength(payload),
                ...extraHeaders
            },
            timeout: 120000 // 2分钟超时（视频生成可能较慢）
        };

        const req = https.request(options, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const raw = Buffer.concat(chunks);
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: raw
                });
            });
        });

        req.on('error', (e) => reject(e));
        req.on('timeout', () => { req.destroy(); reject(new Error('DashScope 响应超时')); });
        req.write(payload);
        req.end();
    });
}

// ================================================================
// CORS 头
// ================================================================
function setCORS(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Max-Age', '86400');
}

// ================================================================
// 响应工具
// ================================================================
function jsonResponse(res, status, data) {
    setCORS(res);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data, null, 2));
}

function errorResponse(res, status, message, detail = '') {
    log('ERROR', message, detail);
    jsonResponse(res, status, { error: message, detail });
}

// ================================================================
// 解析请求体
// ================================================================
function parseBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let total = 0;
        req.on('data', (c) => {
            total += c.length;
            if (total > MAX_BODY_SIZE) {
                req.destroy();
                reject(new Error('请求体超过大小限制'));
                return;
            }
            chunks.push(c);
        });
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf-8');
            try {
                resolve(raw ? JSON.parse(raw) : {});
            } catch (e) {
                reject(new Error('请求体不是合法JSON'));
            }
        });
        req.on('error', reject);
    });
}

// ================================================================
// MIME 类型映射
// ================================================================
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.mp3':  'audio/mpeg',
    '.mp4':  'video/mp4',
    '.wav':  'audio/wav',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
    '.ttf':  'font/ttf',
};

// ================================================================
// 静态文件服务
// ================================================================
function serveStatic(req, res, filePath) {
    // 安全检查：防止目录穿越
    const safe = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
    const fullPath = path.join(STATIC_DIR, safe);

    if (!fullPath.startsWith(STATIC_DIR)) {
        return errorResponse(res, 403, '禁止访问');
    }

    // 如果是目录 → index.html
    const finalPath = fs.statSync(fullPath, { throwIfNoEntry: false })?.isDirectory()
        ? path.join(fullPath, 'index.html')
        : fullPath;

    const ext = path.extname(finalPath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';

    try {
        const content = fs.readFileSync(finalPath);
        res.writeHead(200, {
            'Content-Type': mime,
            'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
        });
        res.end(content);
    } catch (e) {
        if (e.code === 'ENOENT') {
            // SPA fallback → index.html
            try {
                const fallback = fs.readFileSync(path.join(STATIC_DIR, 'index.html'));
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(fallback);
            } catch (e2) {
                errorResponse(res, 404, '页面未找到');
            }
        } else {
            errorResponse(res, 500, '读取文件失败', e.message);
        }
    }
}

// ================================================================
// API 路由处理
// ================================================================
async function handleAPI(req, res, apiPath, body) {
    // ---- 健康检查 ----
    if (apiPath === '/api/health') {
        return jsonResponse(res, 200, {
            status: 'ok',
            uptime: process.uptime(),
            keyConfigured: !!DASHSCOPE_KEY,
            memory: process.memoryUsage().rss
        });
    }

    // ---- 检查 API Key ----
    if (!DASHSCOPE_KEY) {
        return errorResponse(res, 500, '服务器未配置 DASHSCOPE_KEY 环境变量');
    }

    // ---- 速率限制 ----
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(ip)) {
        return errorResponse(res, 429, '请求过于频繁，请稍后再试');
    }

    let dashscopePath, label;
    let isStream = false, isPoll = false;
    let extraHeaders = {};

    switch (apiPath) {
        // --- LLM 对话 ---
        case '/api/llm':
            dashscopePath = ENDPOINTS.llm;
            label = 'LLM';
            break;

        // --- LLM 流式 ---
        case '/api/llm/stream':
            dashscopePath = ENDPOINTS.llm;
            label = 'LLM·Stream';
            isStream = true;
            body.stream = true;
            break;

        // --- 文生图（异步） ---
        case '/api/t2i':
            dashscopePath = ENDPOINTS.t2i;
            label = 'T2I';
            extraHeaders['X-DashScope-Async'] = 'enable';
            break;

        // --- T2I 任务轮询 ---
        case '/api/t2i/poll':
            const t2iTaskId = body.task_id || '';
            if (!t2iTaskId) return errorResponse(res, 400, '缺少 task_id');
            dashscopePath = '/api/v1/tasks/' + t2iTaskId;
            label = 'T2I·Poll';
            isPoll = true;
            break;

        // --- 图生视频 ---
        case '/api/i2v':
            dashscopePath = ENDPOINTS.i2v;
            label = 'I2V';
            break;

        // --- I2V 任务轮询 ---
        case '/api/i2v/poll':
            // apiPath 为 /api/i2v/poll/{taskId}
            // 从 body 提取 taskId
            const taskId = body.task_id || '';
            if (!taskId) return errorResponse(res, 400, '缺少 task_id');
            dashscopePath = '/api/v1/tasks/' + taskId;
            label = 'I2V·Poll';
            // 轮询用 GET，特殊处理
            const pollResult = await pollTask(taskId);
            return jsonResponse(res, pollResult.status === 'SUCCEEDED' ? 200 : 202, pollResult);

        // --- TTS 语音 ---
        case '/api/tts':
            dashscopePath = ENDPOINTS.tts;
            label = 'TTS';
            break;

        default:
            return errorResponse(res, 404, '未知 API 端点: ' + apiPath);
    }

    log('INFO', label + ' 转发中...', dashscopePath);

    // 轮询类请求用 GET
    if (isPoll) {
        try {
            const pollResult = await pollTask(dashscopePath.replace('/api/v1/tasks/', ''));
            return jsonResponse(res, pollResult.task_status === 'SUCCEEDED' ? 200 : 202, pollResult);
        } catch (e) {
            return errorResponse(res, 502, '轮询失败', e.message);
        }
    }

    try {
        const result = await forwardToDashScope(dashscopePath, body);

        if (isStream && result.status === 200) {
            // SSE 流式：原样透传
            setCORS(res);
            res.writeHead(result.status, {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });
            res.end(result.body);
        } else {
            // 非流式：解析JSON后返回
            let data;
            try {
                data = JSON.parse(result.body.toString('utf-8'));
            } catch (e) {
                data = { raw: result.body.toString('utf-8') };
            }
            log('INFO', label + ' 完成', 'status=' + result.status);
            jsonResponse(res, result.status, data);
        }
    } catch (e) {
        errorResponse(res, 502, label + ' 转发失败', e.message);
    }
}

// ---- I2V 任务轮询 ----
async function pollTask(taskId) {
    return new Promise((resolve) => {
        const options = {
            hostname: DASHSCOPE_BASE,
            path: '/api/v1/tasks/' + taskId,
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + DASHSCOPE_KEY
            },
            timeout: 10000
        };
        https.get(options, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                try {
                    resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
                } catch (e) {
                    resolve({ status: 'ERROR', message: '解析失败' });
                }
            });
        }).on('error', (e) => {
            resolve({ status: 'ERROR', message: e.message });
        });
    });
}

// ================================================================
// 主服务器
// ================================================================
const server = http.createServer(async (req, res) => {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname;
    const method = req.method.toUpperCase();

    // CORS 预检
    if (method === 'OPTIONS') {
        setCORS(res);
        res.writeHead(204);
        return res.end();
    }

    // ---- API 路由 ----
    if (pathname.startsWith('/api/')) {
        try {
            const body = method === 'POST' ? await parseBody(req) : parsed.query;
            // 将 query params 合并到 body（用于 GET 轮询等）
            if (method === 'GET' && pathname.startsWith('/api/t2i/poll/')) {
                body.task_id = pathname.split('/').pop();
                return handleAPI(req, res, '/api/t2i/poll', body);
            }
            if (method === 'GET' && pathname.startsWith('/api/i2v/poll/')) {
                body.task_id = pathname.split('/').pop();
                return handleAPI(req, res, '/api/i2v/poll', body);
            }
            return handleAPI(req, res, pathname, body);
        } catch (e) {
            return errorResponse(res, 400, e.message);
        }
    }

    // ---- 静态文件 ----
    serveStatic(req, res, pathname);
});

// ================================================================
// 启动
// ================================================================
server.listen(PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════╗');
    console.log('  ║     掌 中 光  ·  API 中 转 服 务 器    ║');
    console.log('  ╠══════════════════════════════════════════╣');
    console.log('  ║  地址: http://localhost:' + String(PORT).padEnd(17) + ' ║');
    console.log('  ║  API:  http://localhost:' + String(PORT).padEnd(6) + '/api/*  ║');
    console.log('  ║  密钥: ' + (DASHSCOPE_KEY ? '✅ 已配置'.padEnd(18) : '❌ 未配置'.padEnd(18)) + ' ║');
    console.log('  ╚══════════════════════════════════════════╝');
    console.log('');

    if (!DASHSCOPE_KEY) {
        console.log('  ⚠️  请设置环境变量: DASHSCOPE_KEY="sk-xxxxxxxx"');
        console.log('  ⚠️  或创建 .env 文件');
        console.log('');
    }
});

// 优雅退出
process.on('SIGINT', () => {
    console.log('\n  🏮 灯灭了。服务器关闭。');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n  🏮 灯灭了。');
    process.exit(0);
});
