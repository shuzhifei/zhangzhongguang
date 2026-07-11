/**
 * ai-all.js — 掌中光 五合一AI模块
 * ============================================================
 * 统一管理全部五个AI服务，按调用顺序串联皮影短片制作管线：
 *
 *   ① LLM 文本对话  →  路师傅说戏 + 影面评判
 *   ② T2I 文生图    →  皮影分镜原画生成
 *   ③ I2V 图生视频  →  运镜动画短片(5-18s)
 *   ④ TTS 语音合成  →  路师傅苍老人声旁白
 *   ⑤ Audio 音频生成 → 环境音效 + 皮影戏曲BGM
 *
 * 使用方式：
 *   // LLM
 *   const reply = await AI.call(systemPrompt, userMessage);
 *   await AI.callStream(systemPrompt, userMessage, onChunk, onDone);
 *
 *   // 媒体生成
 *   const img = await AIGallery.textToImage(shotDescription);
 *   const video = await AIGallery.imageToVideo(imageUrl, desc);
 *   const audio = await AIGallery.textToSpeech(narration);
 *   const sfx = await AIGallery.generateSound('erhu');
 *
 *   // 完整管线
 *   const pipeline = new MediaPipeline();
 *   const result = await pipeline.produceAct(1, shotDescs, narrations);
 *
 * 所有API统一走阿里云DashScope，代理模式下前端不暴露API Key。
 * ============================================================
 */

// ================================================================
// ① LLM 文本对话 — 通义千问（路师傅说戏 + 影面评判）
// ================================================================
const AI = {
    // ---- 配置（优先走代理，兼容直连模式） ----
    get API_KEY() {
        if (typeof API_CONFIG === 'undefined') return '';
        return API_CONFIG.API_KEY || '';
    },
    get API_URL() {
        if (typeof API_CONFIG === 'undefined') return '/api/llm';
        if (API_CONFIG.BASE_API) return API_CONFIG.BASE_API + '/llm';
        if (API_CONFIG.LLM?.ENDPOINT) return API_CONFIG.LLM.ENDPOINT;
        return 'http://123.57.90.233:3000/api/llm';
    },
    get _useAuth() {
        return this.API_KEY && this.API_KEY.startsWith('sk-');
    },

    MODEL_DEFAULT: 'qwen-turbo',
    MODEL_PREMIUM: 'qwen-plus',
    MODEL_MAX: 'qwen-max',

    _headers() {
        const h = { 'Content-Type': 'application/json' };
        if (this._useAuth) h['Authorization'] = 'Bearer ' + this.API_KEY;
        return h;
    },

    // ---- 非流式调用（评判影面用） ----
    async call(systemPrompt, userMessage, options = {}) {
        const { model = this.MODEL_DEFAULT, temperature = 0.3, maxTokens = 800 } = options;
        const body = { model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }], max_tokens: maxTokens, temperature, stream: false };
        try {
            console.log('[LLM] 调用中...', { model, msgLen: userMessage.length });
            const r = await fetch(this.API_URL, { method: 'POST', headers: this._headers(), body: JSON.stringify(body) });
            if (!r.ok) { const t = await r.text().catch(() => '?'); throw new Error('HTTP ' + r.status + ': ' + t.substring(0, 200)); }
            const d = await r.json();
            if (!d.choices?.length) throw new Error('API返回为空');
            const c = d.choices[0].message.content;
            console.log('[LLM] 返回', c.length, '字');
            return c;
        } catch (e) {
            console.error('[LLM] 失败:', e.message);
            return this._fallbackText('call');
        }
    },

    // ---- 流式调用 ----
    async callStream(systemPrompt, userMessage, onChunk, onDone, options = {}) {
        const speed = options.speed || options.speed === 0 ? options.speed : this.SPEECH_SPEED;
        return speed === 'raw'
            ? this._callStreamRaw(systemPrompt, userMessage, onChunk, onDone, options)
            : this._callStreamBuffered(systemPrompt, userMessage, onChunk, onDone, options);
    },

    async _callStreamRaw(systemPrompt, userMessage, onChunk, onDone, options = {}) {
        const { model = this.MODEL_DEFAULT, temperature = 0.8, maxTokens = 500 } = options;
        const body = { model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }], max_tokens: maxTokens, temperature, stream: true, stream_options: { include_usage: true } };
        let full = '';
        try {
            const r = await fetch(this.API_URL, { method: 'POST', headers: this._headers(), body: JSON.stringify(body) });
            if (!r.ok) { const t = await r.text().catch(() => '?'); throw new Error('HTTP ' + r.status + ': ' + t.substring(0, 200)); }
            const reader = r.body.getReader(), dec = new TextDecoder(); let buf = '';
            while (true) {
                const { done, value } = await reader.read(); if (done) break;
                buf += dec.decode(value, { stream: true });
                const ls = buf.split('\n'); buf = ls.pop() || '';
                for (const l of ls) {
                    const t = l.trim(); if (!t || !t.startsWith('data: ') || t === 'data: [DONE]') continue;
                    try { const c = JSON.parse(t.slice(6)).choices?.[0]?.delta?.content; if (c) { full += c; if (onChunk) onChunk(c); } } catch (e) { }
                }
            }
            console.log('[LLM·流式] 完成', full.length, '字');
            if (onDone) onDone(full);
        } catch (e) {
            console.error('[LLM·流式] 失败:', e.message);
            try {
                const fb = await this.call(systemPrompt, userMessage, { model, temperature, maxTokens });
                for (const ch of fb) { if (onChunk) onChunk(ch); await this._sleep(30); }
                if (onDone) onDone(fb);
            } catch (e2) {
                const fb = this._fallbackText('stream'); if (onChunk) onChunk(fb); if (onDone) onDone(fb);
            }
        }
    },

    async _callStreamBuffered(systemPrompt, userMessage, onChunk, onDone, options = {}) {
        const { model = this.MODEL_DEFAULT, temperature = 0.8, maxTokens = 500, speed = this.SPEECH_SPEED } = options;
        const body = { model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }], max_tokens: maxTokens, temperature, stream: true, stream_options: { include_usage: true } };
        const charQ = []; let apiDone = false, apiErr = null, resolveDrain = null, full = '';
        const producer = (async () => {
            try {
                const r = await fetch(this.API_URL, { method: 'POST', headers: this._headers(), body: JSON.stringify(body) });
                if (!r.ok) { const t = await r.text().catch(() => '?'); throw new Error('HTTP ' + r.status + ': ' + t.substring(0, 200)); }
                const reader = r.body.getReader(), dec = new TextDecoder(); let buf = '';
                while (true) {
                    const { done, value } = await reader.read(); if (done) break;
                    buf += dec.decode(value, { stream: true }); const ls = buf.split('\n'); buf = ls.pop() || '';
                    for (const l of ls) {
                        const t = l.trim(); if (!t || !t.startsWith('data: ') || t === 'data: [DONE]') continue;
                        try { const c = JSON.parse(t.slice(6)).choices?.[0]?.delta?.content; if (c) { full += c; for (const ch of c) charQ.push(ch); if (resolveDrain) { resolveDrain(); resolveDrain = null; } } } catch (e) { }
                    }
                }
            } catch (e) { apiErr = e; console.error('[LLM·匀速] 生产者出错:', e.message); }
            finally { apiDone = true; if (resolveDrain) { resolveDrain(); resolveDrain = null; } }
        })();
        const consumer = (async () => {
            let paused = false;
            while (true) {
                if (!charQ.length) { if (apiDone) break; await new Promise(r => { resolveDrain = r; }); continue; }
                const ch = charQ.shift(); if (onChunk && !paused) onChunk(ch);
                let d = speed;
                if (this._isPunctuation(ch)) { d = this._punctuationPause(ch, speed); paused = true; } else { paused = false; }
                await this._sleep(d);
            }
            console.log('[LLM·匀速] 完成', full.length, '字');
            if (onDone) onDone(full);
        })();
        await Promise.all([producer, consumer]);
        if (apiErr) {
            try { const fb = await this.call(systemPrompt, userMessage, { model, temperature, maxTokens }); for (const ch of fb) { if (onChunk) onChunk(ch); await this._sleep(speed); } if (onDone) onDone(fb); }
            catch (e2) { const fb = this._fallbackText('stream'); if (onChunk) onChunk(fb); if (onDone) onDone(fb); }
        }
    },

    SPEECH_SPEED: 220,
    SPEED_PRESETS: { calm: 220, slow: 280, dying: 350, urgent: 80, normal: 150 },

    speedForQuality(q) {
        switch (q) { case 'high': return 220; case 'medium': return 280; case 'low': case 'critical': return 350; default: return 220; }
    },

    _isPunctuation(ch) { return '，。！？、；：…—'.includes(ch); },
    _punctuationPause(ch, base) {
        const p = { '。': base + 600, '！': base + 500, '？': base + 500, '，': base + 250, '、': base + 200, '；': base + 350, '：': base + 300, '…': base + 800, '—': base + 400 };
        return p[ch] || base;
    },

    async askMaster(systemPrompt, question, context) {
        return this.call(systemPrompt, `学徒追问道："${question}"\n\n当前剧情背景：${context}\n\n请以路师傅的口吻简短回答。`, { temperature: 0.7, maxTokens: 300 });
    },

    _sleep(ms) { return new Promise(r => setTimeout(r, ms)); },

    _fallbackText(type) {
        const f = {
            call: ['师傅沉默了，灯火也跟着暗了一下……（网络不太顺畅，请稍后再试）', '油灯爆了一个灯花，师傅的声音被吞没了。再试一次吧。', '师傅似乎在想着什么，手指轻轻敲着操纵杆。等灯焰稳了再说。'],
            stream: '……（灯火摇晃，师傅的声音传不过来了。再试一次吧。）'
        };
        const v = f[type] || f['call'];
        return Array.isArray(v) ? v[Math.floor(Math.random() * v.length)] : v;
    }
};


// ================================================================
// ②③④⑤ 媒体生成（T2I + I2V + TTS + Audio）+ 管线编排
// ================================================================
const AIGallery = {

    // ---- 工具 ----
    _config() { return (typeof API_CONFIG !== 'undefined') ? API_CONFIG : { API_KEY: '', T2I:{}, I2V:{}, TTS:{}, AUDIO_GEN:{} }; },
    _key() { return (typeof API_CONFIG !== 'undefined' && API_CONFIG.API_KEY) ? API_CONFIG.API_KEY : ''; },
    _useAuth() { const k = this._key(); return k && k.startsWith('sk-'); },

    _headers() {
        const h = { 'Content-Type': 'application/json' };
        if (this._useAuth()) h['Authorization'] = 'Bearer ' + this._key();
        return h;
    },

    _sleep(ms) { return new Promise(r => setTimeout(r, ms)); },

    async _post(url, body, label) {
        if (this._useAuth() && (!this._key() || !this._key().startsWith('sk-'))) throw new Error('API Key 未配置');
        console.log('[AI ' + label + '] 调用...', url.substring(0, 50));
        const st = Date.now();
        const r = await fetch(url, { method: 'POST', headers: this._headers(), body: JSON.stringify(body) });
        if (!r.ok) { const t = await r.text().catch(() => '?'); throw new Error(label + ' HTTP ' + r.status + ': ' + t.substring(0, 200)); }
        const d = await r.json();
        console.log('[AI ' + label + '] 完成', (Date.now() - st) + 'ms');
        return d;
    },

    _b64ToBlobUrl(b64, mime) {
        const chars = atob(b64), nums = new Uint8Array(chars.length);
        for (let i = 0; i < chars.length; i++) nums[i] = chars.charCodeAt(i);
        return URL.createObjectURL(new Blob([nums], { type: mime || 'image/png' }));
    },

    _extractImageB64(data) {
        try {
            const results = data.output?.results || data.data?.[0]?.url || [];
            if (typeof results === 'string') return results;
            for (const item of (Array.isArray(results) ? results : [results])) {
                if (item.url?.startsWith('data:image')) return item.url;
                if (item.b64_image) return 'data:image/png;base64,' + item.b64_image;
                if (item.url?.startsWith('http')) return item.url;
            }
        } catch (e) { console.error('[T2I] 解析响应失败:', e); }
        return null;
    },

    // ---- ② 文生图 Wanx2.1-T2I-Plus（异步模式） ----
    async textToImage(shotDescription, options = {}) {
        const cfg = this._config().T2I || {};
        const { size = cfg.DEFAULT_SIZE || '1024*1024', n = 1, negativePrompt = cfg.NEGATIVE_PROMPT || '' } = options;
        const prompt = (cfg.STYLE_PREFIX || '北京非遗皮影戏风格,幕布投影,暖黄灯光,') + shotDescription;
        console.log('[T2I] 异步提交:', prompt.substring(0, 80) + '...');

        // 1. 提交异步任务
        const body = { model: cfg.MODEL || 'wanx2.1-t2i-plus', input: { prompt, negative_prompt: negativePrompt }, parameters: { size, n } };
        const apiUrl = cfg.ENDPOINT || cfg.API_URL || '/api/t2i';
        const data = await this._postAsync(apiUrl, body, 'T2I');

        const taskId = data.output?.task_id || '';
        if (!taskId) {
            console.error('[T2I] 未获取到task_id，尝试同步解析');
            const b64 = this._extractImageB64(data);
            return { url: b64 ? (b64.startsWith('data:') ? this._b64ToBlobUrl(b64.split(',')[1] || b64) : b64) : null, b64: b64 || '', taskId: '', raw: data };
        }

        console.log('[T2I] 异步任务已提交 task_id=' + taskId);

        // 2. 轮询等待结果
        const result = await this._pollTask(taskId, 'T2I');
        const b64 = this._extractImageB64(result);
        console.log('[T2I]', b64 ? '✅' : '❌');
        return { url: b64 ? (b64.startsWith('data:') ? this._b64ToBlobUrl(b64.split(',')[1] || b64) : b64) : null, b64: b64 || '', taskId, raw: result };
    },

    /** 异步POST（X-DashScope-Async 头由后端 serve.js 自动添加，前端不需要） */
    async _postAsync(url, body, label) {
        // 后端 serve.js 的 /api/t2i 路由已经自动加了 X-DashScope-Async: enable
        // 前端不需要再发这个头，否则会触发不必要的 CORS 预检
        return this._post(url, body, label);
    },

    /** 通用异步任务轮询 */
    async _pollTask(taskId, label, maxRetries = 60, intervalMs = 3000) {
        const cfg = this._config().T2I || {};
        // 后端 serve.js 期望 GET /api/t2i/poll/{taskId} 路径格式
        const pollUrl = cfg.ENDPOINT_POLL
            ? cfg.ENDPOINT_POLL + '/' + taskId
            : '/api/t2i/poll/' + taskId;

        for (let i = 0; i < maxRetries; i++) {
            await this._sleep(intervalMs);
            try {
                const headers = this._headers();
                const r = await fetch(pollUrl, { headers });
                if (!r.ok) continue;
                const d = await r.json();
                const status = d.output?.task_status;
                console.log('  [' + label + '轮询 ' + (i + 1) + '/' + maxRetries + '] ' + status);
                if (status === 'SUCCEEDED') return d;
                if (status === 'FAILED') { console.error('[' + label + '] 任务失败:', d.output?.message); return d; }
            } catch (e) { /* 网络抖动 */ }
        }
        console.error('[' + label + '] 轮询超时');
        return { output: { task_status: 'UNKNOWN' } };
    },

    async generateStoryboard(descs = []) {
        console.log('[T2I·分镜] 批量生成', descs.length, '个...');
        const r = [];
        for (let i = 0; i < descs.length; i++) { r.push({ ...(await this.textToImage(descs[i])), shotIndex: i, description: descs[i] }); if (i < descs.length - 1) await this._sleep(500); }
        return r;
    },

    // ---- ③ 图生视频 Wan2.2-I2V-Flash ----
    async imageToVideo(imageUrl, shotDescription = '', options = {}) {
        const cfg = this._config().I2V || {};
        const { duration = cfg.DEFAULT_DURATION || 8, cameraStyle = 'dialogue' } = options;
        const cams = cfg.CAMERA_PRESETS || {};
        const prompt = (cfg.MOTION_PROMPT || '皮影摆动,灯焰闪烁,幕布透光,') + (shotDescription || '') + ', ' + (cams[cameraStyle] || cams['dialogue']);
        console.log('[I2V]', duration + 's 运镜=' + cameraStyle);
        const body = { model: cfg.MODEL || 'wanx2.1-i2v-plus', input: { prompt, img_url: imageUrl }, parameters: { duration } };
        const data = await this._post(cfg.ENDPOINT || cfg.API_URL || '/api/i2v', body, 'I2V');
        const taskId = data.output?.task_id || '';
        let videoUrl = data.output?.video_url || data.output?.results?.[0]?.video_url || null;
        if (!videoUrl && taskId) { console.log('[I2V] 轮询异步任务...'); videoUrl = await this._pollI2VTask(taskId); }
        console.log('[I2V]', videoUrl ? '✅' : '❌');
        return { videoUrl, taskId, duration, raw: data };
    },

    async _pollI2VTask(taskId, maxRetries = 30, intervalMs = 2000) {
        // 后端 serve.js 期望 GET /api/i2v/poll/{taskId} 路径格式
        const pollUrl = (this._config().I2V || {}).ENDPOINT_POLL
            ? (this._config().I2V || {}).ENDPOINT_POLL + '/' + taskId
            : 'http://123.57.90.233:3000/api/i2v/poll/' + taskId;
        for (let i = 0; i < maxRetries; i++) {
            await this._sleep(intervalMs);
            try {
                const r = await fetch(pollUrl, { headers: this._headers() }); if (!r.ok) continue;
                const d = await r.json(); const s = d.output?.task_status;
                if (s === 'SUCCEEDED') return d.output?.results?.[0]?.video_url || d.output?.video_url || null;
                if (s === 'FAILED') return null;
            } catch (e) { }
        }
        return null;
    },

    async generateActVideos(storyboard = [], cameraStyle = 'dialogue') {
        console.log('[I2V·动画] 串行生成', storyboard.length, '段...');
        const r = [];
        for (let i = 0; i < storyboard.length; i++) {
            const s = storyboard[i];
            r.push(s.url ? { ...(await this.imageToVideo(s.url, s.description || '', { cameraStyle })), shotIndex: i } : { videoUrl: null, shotIndex: i, error: '无输入图片' });
        }
        return r;
    },

    // ---- ④ TTS 语音合成（路师傅苍老人声） ----
    async textToSpeech(text, options = {}) {
        const cfg = this._config().TTS || {};
        const { voice = cfg.VOICE || 'longcheng', rate = cfg.SPEED || 1.0, volume = cfg.VOLUME || 50, format = cfg.FORMAT || 'mp3' } = options;
        if (!text?.trim()) throw new Error('TTS: 文本为空');
        console.log('[TTS]', text.substring(0, 40) + '...');
        const body = {
            model: cfg.MODEL || 'cosyvoice-v3.5-plus',
            input: { text, voice, format, sample_rate: cfg.SAMPLE_RATE || 22050, volume }
        };
        const data = await this._post(cfg.ENDPOINT || cfg.API_URL || '/api/tts', body, 'TTS');
        const b64 = data.output?.audio?.data || data.output?.audio_url || data.output?.results?.[0]?.audio?.data || '';
        let audioUrl = null;
        if (b64) { const mime = format === 'mp3' ? 'audio/mpeg' : 'audio/wav'; audioUrl = this._b64ToBlobUrl(b64, mime); }
        console.log('[TTS]', audioUrl ? '✅' : '❌');
        return { audioUrl, b64, duration: data.output?.duration || 0, raw: data };
    },

    async generateNarrations(lines = []) {
        const r = [];
        for (let i = 0; i < lines.length; i++) { r.push(lines[i]?.trim() ? { ...(await this.textToSpeech(lines[i])), lineIndex: i, text: lines[i] } : { audioUrl: null, lineIndex: i, error: '空文本' }); if (i < lines.length - 1) await this._sleep(300); }
        return r;
    },

};


// ================================================================
// 媒体管线 — 串联 T2I → I2V → TTS
// ================================================================
class MediaPipeline {
    constructor() { this.gallery = AIGallery; }

    async produceAct(actNumber, shotDescriptions = [], narrationLines = [], options = {}) {
        const { cameraStyle = 'opening' } = options;
        console.log('═══════════════════════════════════════════');
        console.log('  🎬 媒体管线启动 — 第' + actNumber + '幕 | 分镜=' + shotDescriptions.length + ' 旁白=' + narrationLines.length);
        console.log('═══════════════════════════════════════════');

        const pipeline = { act: actNumber, storyboard: [], videos: [], narrations: [] };
        const st = Date.now();

        try {
            console.log('\n▶ 1/3 文生图 — 皮影分镜原画');
            pipeline.storyboard = await this.gallery.generateStoryboard(shotDescriptions);

            console.log('\n▶ 2/3 图生视频 — 皮影动画');
            pipeline.videos = await this.gallery.generateActVideos(pipeline.storyboard, cameraStyle);

            console.log('\n▶ 3/3 TTS语音 — 路师傅旁白');
            pipeline.narrations = await this.gallery.generateNarrations(narrationLines);
        } catch (e) { console.error('[管线] 中断:', e.message); pipeline.error = e.message; }

        pipeline.elapsed = ((Date.now() - st) / 1000).toFixed(1) + 's';
        console.log('\n  ✅ 第' + actNumber + '幕 完成 (' + pipeline.elapsed + ')');
        console.log('  分镜=' + pipeline.storyboard.filter(s => s.url).length + '/' + shotDescriptions.length);
        console.log('  动画=' + pipeline.videos.filter(v => v.videoUrl).length + '/' + shotDescriptions.length);
        console.log('  旁白=' + pipeline.narrations.filter(n => n.audioUrl).length + '/' + narrationLines.length);
        if (pipeline.error) console.log('  ⚠️ 错误:', pipeline.error);
        console.log('═══════════════════════════════════════════\n');
        return pipeline;
    }
}
