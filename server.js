// 掌中光 - 本地开发服务器（自动打开浏览器）
// 用法：在终端输入 node server.js 即可

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 5500;
const ROOT = __dirname; // 脚本所在目录 = 项目根目录

// MIME 类型
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
    // 去掉 query string
    let filePath = path.join(ROOT, req.url.split('?')[0]);

    // 根路径 → act1.html（单幕版·第一幕；完整版 index.html 已移除）
    if (req.url === '/' || req.url === '') {
        filePath = path.join(ROOT, 'act1.html');
    }

    const ext = path.extname(filePath);
    const mime = MIME[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('404 Not Found');
            } else {
                res.writeHead(500);
                res.end('500 Internal Server Error');
            }
            return;
        }
        res.writeHead(200, { 'Content-Type': mime });
        res.end(data);
    });
});

server.listen(PORT, () => {
    const url = `http://127.0.0.1:${PORT}`;
    console.log(`\n  掌中光 开发服务器已启动`);
    console.log(`  地址: ${url}\n`);

    // 自动打开浏览器
    const cmd = `start ${url}`;
    exec(cmd, (err) => {
        if (err) console.log('  (浏览器可能需要手动打开)');
    });
});
