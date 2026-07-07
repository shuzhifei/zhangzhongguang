/**
 * proxy.js — 本地API代理服务器
 *
 * 用法：
 *   node proxy.js
 *
 * 然后在test-api.html中：
 *   把 fetch('http://localhost:3000/api/chat', ...)
 *   替代原来的 dashscope.aliyuncs.com 地址
 *
 * 为什么需要？
 *   通义千问DashScope API可能不支持浏览器直接跨域请求。
 *   通过本地Node.js代理中转，绕过CORS限制。
 */

const http = require('http');
const https = require('https');

const PORT = 3000;
const API_URL = 'dashscope.aliyuncs.com';
const API_PATH = '/compatible-mode/v1/chat/completions';

const server = http.createServer((req, res) => {
    // CORS 头 —— 允许浏览器跨域访问本代理
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === 'POST' && req.url === '/api/chat') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            console.log('[代理] 转发请求...');

            const proxyReq = https.request({
                hostname: API_URL,
                path: API_PATH,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': req.headers['authorization'] || '',
                    'Content-Length': Buffer.byteLength(body)
                }
            }, proxyRes => {
                // 转发响应头
                res.writeHead(proxyRes.statusCode, proxyRes.headers);
                // 流式转发响应体
                proxyRes.pipe(res);
            });

            proxyReq.on('error', err => {
                console.error('[代理] 错误:', err.message);
                res.writeHead(502);
                res.end(JSON.stringify({ error: '代理转发失败: ' + err.message }));
            });

            proxyReq.write(body);
            proxyReq.end();
        });
        return;
    }

    res.writeHead(404);
    res.end('Not Found');
});

server.listen(PORT, () => {
    console.log(`🔄 代理服务器已启动: http://localhost:${PORT}/api/chat`);
    console.log(`   将浏览器中的API请求指向此地址即可`);
    console.log(`   原始API: https://${API_URL}${API_PATH}`);
});
