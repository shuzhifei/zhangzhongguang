/**
 * ai-media.js — 掌中光 多媒体AI生成模块
 * ============================================================
 * 整合四大AI服务，按调用顺序串联皮影短片制作管线：
 *
 *   LLM剧本 → T2I分镜原画 → I2V动画短片 → TTS旁白配音 → Audio音效BGM
 *
 * 所有API统一走阿里云DashScope，使用同一个API Key。
 *
 * 调用流程（主入口在 MediaPipeline）：
 *   1. 从 LLM 获取镜头描述文本（由 prompt-builder.js 提供）
 *   2. 调用 T2I 批量生成皮影风格分镜原画（每幕3-5张）
 *   3. 串行调用 I2V 将每张原画转为5-18秒动画短片
 *   4. 调用 TTS 生成路师傅苍老旁白配音
 *   5. 调用 AudioGen 生成环境音效和BGM
 * ============================================================
 */

const AIGallery = {

    // ================================================================
    // 工具方法
    // ================================================================

    /** 从 config.js 读取配置（带降级默认值） */
    _config() {
        if (typeof API_CONFIG === 'undefined') {
            console.warn('[AI Media] API_CONFIG 未加载，使用空配置');
            return { API_KEY: '', LLM:{}, T2I:{}, I2V:{}, TTS:{}, AUDIO_GEN:{}, ART_STYLE:{} };
        }
        return API_CONFIG;
    },

    _key() { return this._config().API_KEY || ''; },

    _headers() {
        return {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + this._key()
        };
    },

    async _sleep(ms) { return new Promise(r => setTimeout(r, ms)); },

    /** 通用 fetch + 错误处理 */
    async _post(url, body, label = 'AI') {
        const key = this._key();
        if (!key || !key.startsWith('sk-')) throw new Error('API Key 未配置');

        console.log('[AI ' + label + '] 调用中...', { url: url.substring(0, 50) + '...' });
        const st = Date.now();

        const r = await fetch(url, {
            method: 'POST',
            headers: this._headers(),
            body: JSON.stringify(body)
        });

        if (!r.ok) {
            const txt = await r.text().catch(() => '无响应');
            throw new Error(label + ' HTTP ' + r.status + ': ' + txt.substring(0, 200));
        }

        const data = await r.json();
        console.log('[AI ' + label + '] 完成', (Date.now() - st) + 'ms');
        return data;
    },

    /** 将 Base64 转为 Blob URL（用于图片预览） */
    _b64ToBlobUrl(b64, mime = 'image/png') {
        const byteChars = atob(b64);
        const byteNums = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
        return URL.createObjectURL(new Blob([new Uint8Array(byteNums)], { type: mime }));
    },

    /** 从DashScope响应中提取Base64图片（兼容多种返回格式） */
    _extractImageB64(data) {
        // 格式1: { output: { results: [{ url: "data:image/png;base64,..." }] } }
        // 格式2: { output: { results: [{ b64_image: "..." }] } }
        // 格式3: { output: { task_status: "SUCCEEDED", results: [...] } } （异步任务）
        try {
            const results =
                data.output?.results ||
                data.data?.[0]?.url ||
                [];
            if (typeof results === 'string') return results; // 直接是URL/base64
            for (const item of (Array.isArray(results) ? results : [results])) {
                if (item.url && item.url.startsWith('data:image')) return item.url;
                if (item.b64_image) return 'data:image/png;base64,' + item.b64_image;
                if (item.url && item.url.startsWith('http')) return item.url;
            }
        } catch (e) {
            console.error('[T2I] 解析响应失败:', e);
        }
        return null;
    },

    // ================================================================
    // 1. 文生图 — 通义万相 Wan2.6-T2I
    // ================================================================
    /**
     * 根据镜头描述生成北京非遗皮影风格幕布原画
     *
     * @param {string}  shotDescription — 镜头描述（由LLM生成的自然语言）
     *   示例: "月夜，槐树下，青衫书生手攥信封，影子被月光拉长。远景。"
     * @param {object}  options
     * @param {string}  options.size   — 图片尺寸，默认 1664*928
     * @param {number}  options.n      — 生成数量，默认 1
     * @param {string}  options.negativePrompt — 负向提示词
     * @returns {Promise<{ url: string, b64: string, taskId: string }>}
     */
    async textToImage(shotDescription, options = {}) {
        const cfg = this._config().T2I || {};
        const {
            size = cfg.DEFAULT_SIZE || '1664*928',
            n = 1,
            negativePrompt = cfg.NEGATIVE_PROMPT || ''
        } = options;

        const stylePrefix = cfg.STYLE_PREFIX || '北京非遗皮影戏风格,幕布投影,暖黄灯光,';
        const prompt = stylePrefix + shotDescription;

        console.log('[T2I] 文生图:', prompt.substring(0, 80) + '...');

        const body = {
            model: cfg.MODEL || 'wan2.6-t2i',
            input: {
                prompt: prompt,
                negative_prompt: negativePrompt
            },
            parameters: {
                size: size,
                n: n
            }
        };

        const data = await this._post(cfg.API_URL, body, 'T2I');

        const b64 = this._extractImageB64(data);
        const result = {
            url: b64 ? (b64.startsWith('data:') ? this._b64ToBlobUrl(b64.split(',')[1] || b64) : b64) : null,
            b64: b64 || '',
            taskId: data.output?.task_id || data.request_id || '',
            raw: data
        };

        console.log('[T2I] 生成完成', result.url ? '✅' : '❌（无图片）');
        return result;
    },

    /**
     * 批量生成一幕的所有分镜原画
     * @param {string[]} shotDescriptions — 镜头描述列表（LLM生成的）
     * @returns {Promise<Array<{url, b64, taskId, shotIndex}>>}
     */
    async generateStoryboard(shotDescriptions = []) {
        console.log('[T2I · 分镜] 开始批量生成', shotDescriptions.length, '个分镜...');
        const results = [];
        for (let i = 0; i < shotDescriptions.length; i++) {
            console.log('  [分镜 ' + (i + 1) + '/' + shotDescriptions.length + ']');
            const img = await this.textToImage(shotDescriptions[i]);
            results.push({ ...img, shotIndex: i, description: shotDescriptions[i] });
            // 避免触发频率限制
            if (i < shotDescriptions.length - 1) await this._sleep(500);
        }
        console.log('[T2I · 分镜] 全部完成:', results.filter(r => r.url).length + '/' + results.length);
        return results;
    },

    // ================================================================
    // 2. 图生视频 — 通义万相 Wan2.2-I2V-Flash
    // ================================================================
    /**
     * 输入皮影分镜原图，生成带运镜和光影抖动的动画短片
     *
     * @param {string}  imageUrl    — 输入图片URL或Base64（T2I的输出）
     * @param {string}  shotDescription — 镜头描述（用于生成运镜提示）
     * @param {object}  options
     * @param {number}  options.duration     — 时长(秒)，默认 8，范围 5-18
     * @param {string}  options.cameraStyle  — 运镜风格: 'opening'|'dialogue'|'climax'|'ending'
     * @returns {Promise<{ videoUrl: string, taskId: string, duration: number }>}
     */
    async imageToVideo(imageUrl, shotDescription = '', options = {}) {
        const cfg = this._config().I2V || {};
        const {
            duration = cfg.DEFAULT_DURATION || 8,
            cameraStyle = 'dialogue'
        } = options;

        const cameraPresets = cfg.CAMERA_PRESETS || {};
        const cameraInstruction = cameraPresets[cameraStyle] || cameraPresets['dialogue'];
        const motionPrefix = cfg.MOTION_PROMPT || '皮影人物微微摆动,灯油火焰闪烁,幕布透光,';
        const prompt = motionPrefix + (shotDescription || '') + ', ' + cameraInstruction;

        console.log('[I2V] 图生视频: ' + duration + 's | 运镜=' + cameraStyle);

        const body = {
            model: cfg.MODEL || 'wan2.2-i2v-flash',
            input: {
                prompt: prompt,
                img_url: imageUrl
            },
            parameters: {
                duration: duration
            }
        };

        const data = await this._post(cfg.API_URL, body, 'I2V');

        // I2V 可能是异步任务，返回 task_id 需要轮询
        const taskId = data.output?.task_id || data.request_id || '';

        const result = {
            videoUrl: data.output?.video_url || data.output?.results?.[0]?.video_url || null,
            taskId: taskId,
            duration: duration,
            raw: data
        };

        // 如果是异步任务，需要轮询直到完成
        if (!result.videoUrl && taskId) {
            console.log('[I2V] 异步任务，开始轮询... task_id=' + taskId);
            result.videoUrl = await this._pollI2VTask(taskId);
        }

        console.log('[I2V] 生成完成', result.videoUrl ? '✅' : '❌');
        return result;
    },

    /** 轮询I2V异步任务直到完成 */
    async _pollI2VTask(taskId, maxRetries = 30, intervalMs = 2000) {
        const cfg = this._config().I2V || {};
        // DashScope 异步任务查询端点
        const pollUrl = 'https://dashscope.aliyuncs.com/api/v1/tasks/' + taskId;

        for (let i = 0; i < maxRetries; i++) {
            await this._sleep(intervalMs);
            try {
                const r = await fetch(pollUrl, { headers: this._headers() });
                if (!r.ok) continue;
                const data = await r.json();
                const status = data.output?.task_status;
                console.log('  [I2V轮询 ' + (i + 1) + '/' + maxRetries + '] ' + status);

                if (status === 'SUCCEEDED') {
                    return data.output?.results?.[0]?.video_url ||
                           data.output?.video_url || null;
                }
                if (status === 'FAILED') {
                    console.error('[I2V] 任务失败:', data.output?.message);
                    return null;
                }
                // PENDING / RUNNING → 继续等待
            } catch (e) { /* 网络抖动，继续 */ }
        }
        console.error('[I2V] 轮询超时');
        return null;
    },

    /**
     * 串行生成一幕所有分镜的动画短片
     * @param {Array}  storyboard  — T2I输出的分镜数组 [{url, description, shotIndex}, ...]
     * @param {string} cameraStyle — 运镜风格
     * @returns {Promise<Array<{videoUrl, taskId, duration, shotIndex}>>}
     */
    async generateActVideos(storyboard = [], cameraStyle = 'dialogue') {
        console.log('[I2V · 动画] 开始串行生成', storyboard.length, '段动画...');
        const results = [];
        for (let i = 0; i < storyboard.length; i++) {
            const shot = storyboard[i];
            if (!shot.url) {
                console.warn('  [动画 ' + (i + 1) + '] 跳过 — 无输入图片');
                results.push({ videoUrl: null, shotIndex: i, error: '无输入图片' });
                continue;
            }
            console.log('  [动画 ' + (i + 1) + '/' + storyboard.length + ']');
            const video = await this.imageToVideo(shot.url, shot.description || '', { cameraStyle });
            results.push({ ...video, shotIndex: i });
            // 串行调用，不用额外延迟
        }
        console.log('[I2V · 动画] 全部完成:', results.filter(r => r.videoUrl).length + '/' + results.length);
        return results;
    },

    // ================================================================
    // 3. TTS 语音合成 — 通义语音（路师傅苍老人声旁白）
    // ================================================================
    /**
     * 将字幕文本转为路师傅苍老人声旁白
     *
     * @param {string}  text    — 旁白/对白文本（路师傅的戏词）
     * @param {object}  options
     * @param {string}  options.voice  — 音色ID，默认 'laochengshuo_narrator'
     * @param {number}  options.speed  — 语速 0.5-2.0，默认 0.85（老人偏慢）
     * @param {number}  options.volume — 音量 0.5-2.0，默认 1.0
     * @param {string}  options.format — 输出格式 mp3/wav，默认 mp3
     * @returns {Promise<{ audioUrl: string, b64: string, duration: number }>}
     */
    async textToSpeech(text, options = {}) {
        const cfg = this._config().TTS || {};
        const {
            voice   = cfg.VOICE   || 'laochengshuo_narrator',
            speed   = cfg.SPEED   || 0.85,
            volume  = cfg.VOLUME  || 1.0,
            format  = cfg.FORMAT  || 'mp3'
        } = options;

        if (!text || text.trim().length === 0) throw new Error('TTS: 文本为空');

        console.log('[TTS] 语音合成:', text.substring(0, 40) + '... (' + text.length + '字)');

        const body = {
            model: cfg.MODEL || 'cosyvoice-v1',
            input: {
                text: text
            },
            parameters: {
                voice: voice,
                speech_rate: speed,
                volume: volume,
                format: format,
                sample_rate: cfg.SAMPLE_RATE || 22050
            }
        };

        const data = await this._post(cfg.API_URL, body, 'TTS');

        // 提取音频
        const audioB64 = data.output?.audio?.data ||
                         data.output?.audio_url ||
                         data.output?.results?.[0]?.audio?.data || '';

        let audioUrl = null;
        if (audioB64) {
            const mime = format === 'mp3' ? 'audio/mpeg' : 'audio/wav';
            const byteChars = atob(audioB64);
            const byteNums = new Array(byteChars.length);
            for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
            audioUrl = URL.createObjectURL(new Blob([new Uint8Array(byteNums)], { type: mime }));
        }

        const result = {
            audioUrl: audioUrl,
            b64: audioB64,
            duration: data.output?.duration || 0,
            raw: data
        };

        console.log('[TTS] 完成', result.audioUrl ? '✅' : '❌');
        return result;
    },

    /**
     * 批量生成一幕所有镜头的旁白配音
     * @param {string[]} narrationLines — 每段旁白文本
     * @returns {Promise<Array<{audioUrl, b64, duration, lineIndex}>>}
     */
    async generateNarrations(narrationLines = []) {
        console.log('[TTS · 旁白] 批量生成', narrationLines.length, '段旁白...');
        const results = [];
        for (let i = 0; i < narrationLines.length; i++) {
            const line = narrationLines[i];
            if (!line || !line.trim()) {
                results.push({ audioUrl: null, lineIndex: i, error: '空文本' });
                continue;
            }
            console.log('  [旁白 ' + (i + 1) + '/' + narrationLines.length + ']');
            const audio = await this.textToSpeech(line);
            results.push({ ...audio, lineIndex: i, text: line });
            if (i < narrationLines.length - 1) await this._sleep(300);
        }
        console.log('[TTS · 旁白] 全部完成');
        return results;
    },

    // ================================================================
    // 4. 音频生成 — 通义音频（环境音效 + 皮影戏曲BGM）
    // ================================================================
    /**
     * 生成环境音效或背景音乐
     *
     * @param {string}  soundType — 音效类型: 'oil_lamp'|'wind'|'water'|'erhu'|'market'|'stage'|'thunder'|'silence'
     *                              或自定义自然语言描述
     * @param {object}  options
     * @param {number}  options.duration — 时长(秒)，默认15
     * @returns {Promise<{ audioUrl: string, b64: string, duration: number }>}
     */
    async generateSound(soundType = 'oil_lamp', options = {}) {
        const cfg = this._config().AUDIO_GEN || {};
        const {
            duration = cfg.DEFAULT_DURATION || 15
        } = options;

        // 从预设中取描述，或直接使用用户输入
        const presets = cfg.SOUND_PRESETS || {};
        const description = presets[soundType] || soundType;

        console.log('[Audio] 音频生成:', soundType, '(' + duration + 's)');

        const body = {
            model: cfg.MODEL || 'qwen-audio',
            input: {
                prompt: '北京皮影戏氛围音效,民国年间,老北京胡同,' + description,
                duration: duration
            },
            parameters: {
                format: cfg.FORMAT || 'mp3'
            }
        };

        const data = await this._post(cfg.API_URL, body, 'Audio');

        const audioB64 = data.output?.audio?.data ||
                         data.output?.results?.[0]?.audio?.data || '';

        let audioUrl = null;
        if (audioB64) {
            const byteChars = atob(audioB64);
            const byteNums = new Array(byteChars.length);
            for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
            audioUrl = URL.createObjectURL(new Blob([new Uint8Array(byteNums)], { type: 'audio/mpeg' }));
        }

        const result = {
            audioUrl: audioUrl,
            b64: audioB64,
            duration: duration,
            soundType: soundType,
            raw: data
        };

        console.log('[Audio] 完成', result.audioUrl ? '✅' : '❌');
        return result;
    },

    /**
     * 根据场景描述自动生成全套音效+BGM
     * @param {string} sceneDescription — 场景描述
     * @returns {Promise<{ bgm: object, ambient: object }>}
     */
    async generateSceneAudio(sceneDescription = '') {
        console.log('[Audio · 场景] 生成全套音效...');
        const [bgm, ambient] = await Promise.all([
            this.generateSound('erhu'),           // BGM：二胡配乐
            this.generateSound(sceneDescription)  // 环境音：根据场景
        ]);
        return { bgm, ambient };
    }
};


// ================================================================
// 5. 媒体管线 —— 串联整个制作流程
// ================================================================
/**
 * 将 LLM 脚本 → T2I分镜 → I2V动画 → TTS旁白 → Audio音效
 *
 * 使用方式：
 *   const pipeline = new MediaPipeline();
 *   const result = await pipeline.produceAct(1, shotDescriptions, narrationLines);
 */
class MediaPipeline {

    constructor() {
        this.gallery = AIGallery;
    }

    /**
     * 为一幕戏生成完整的视听内容
     *
     * @param {number}   actNumber         — 第几幕 (1/2/3)
     * @param {string[]} shotDescriptions  — LLM生成的镜头描述列表
     * @param {string[]} narrationLines    — LLM生成的路师傅旁白文本列表
     * @param {object}   options
     * @param {string}   options.cameraStyle — 运镜风格
     * @param {string[]} options.soundTypes  — 每段镜头的音效类型
     * @returns {Promise<object>} 完整的幕级媒体包
     */
    async produceAct(actNumber, shotDescriptions = [], narrationLines = [], options = {}) {
        const { cameraStyle = 'opening', soundTypes = [] } = options;

        console.log('═══════════════════════════════════════════');
        console.log('  🎬 媒体管线启动 — 第' + actNumber + '幕');
        console.log('  分镜数=' + shotDescriptions.length + ' | 旁白数=' + narrationLines.length);
        console.log('═══════════════════════════════════════════');

        const pipeline = { act: actNumber, storyboard: [], videos: [], narrations: [], sounds: [] };
        const st = Date.now();

        try {
            // --- 阶段1: T2I 分镜原画 ---
            console.log('\n▶ 阶段 1/4: 文生图 — 生成皮影分镜原画');
            pipeline.storyboard = await this.gallery.generateStoryboard(shotDescriptions);

            // --- 阶段2: I2V 动画短片 ---
            console.log('\n▶ 阶段 2/4: 图生视频 — 生成皮影动画');
            pipeline.videos = await this.gallery.generateActVideos(pipeline.storyboard, cameraStyle);

            // --- 阶段3: TTS 旁白配音 ---
            console.log('\n▶ 阶段 3/4: TTS语音 — 生成路师傅旁白');
            pipeline.narrations = await this.gallery.generateNarrations(narrationLines);

            // --- 阶段4: Audio 环境音效 ---
            console.log('\n▶ 阶段 4/4: 音频生成 — 生成BGM和环境音效');
            for (let i = 0; i < shotDescriptions.length; i++) {
                const st = soundTypes[i] || 'oil_lamp';
                console.log('  [音效 ' + (i + 1) + '/' + shotDescriptions.length + '] ' + st);
                const sound = await this.gallery.generateSound(st, { duration: 15 });
                pipeline.sounds.push({ ...sound, shotIndex: i });
            }

        } catch (e) {
            console.error('[管线] 中断:', e.message);
            pipeline.error = e.message;
        }

        const elapsed = ((Date.now() - st) / 1000).toFixed(1);
        pipeline.elapsed = elapsed + 's';

        // 摘要
        console.log('\n═══════════════════════════════════════════');
        console.log('  ✅ 第' + actNumber + '幕 媒体管线完成 (' + elapsed + 's)');
        console.log('  分镜=' + pipeline.storyboard.filter(s => s.url).length + '/' + shotDescriptions.length);
        console.log('  动画=' + pipeline.videos.filter(v => v.videoUrl).length + '/' + shotDescriptions.length);
        console.log('  旁白=' + pipeline.narrations.filter(n => n.audioUrl).length + '/' + narrationLines.length);
        console.log('  音效=' + pipeline.sounds.filter(s => s.audioUrl).length + '/' + soundTypes.length);
        if (pipeline.error) console.log('  ⚠️ 错误:', pipeline.error);
        console.log('═══════════════════════════════════════════\n');

        return pipeline;
    }
}