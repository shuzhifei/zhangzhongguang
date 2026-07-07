/**
 * ai-api.js — 通义千问API调用模块
 * 负责与阿里云DashScope API通信
 *
 * 使用方式：
 *   const reply = await AI.call(systemPrompt, userMessage);
 *   await AI.callStream(systemPrompt, userMessage, onChunk, onDone);
 *
 * ⚠️ 使用前请先填入你的API Key
 *    申请地址: https://dashscope.aliyun.com → API-KEY管理
 */

const AI = {
    // ============================================================
    // 配置 — 从 config.js 读取（API Key 不会被上传到GitHub）
    // ============================================================
    get API_KEY() {
        return (typeof API_CONFIG !== 'undefined') ? API_CONFIG.API_KEY : 'sk-未配置';
    },
    get API_URL() {
        return (typeof API_CONFIG !== 'undefined') ? API_CONFIG.API_URL : 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
    },

    // 模型选择（按费用从低到高）
    // qwen-turbo      — 免费额度最多，速度快，适合日常叙事
    // qwen-plus       — 效果更好，适合关键剧情
    // qwen-max        — 最强模型，适合第三幕高潮/结局
    MODEL_DEFAULT: 'qwen-turbo',
    MODEL_PREMIUM: 'qwen-plus',
    MODEL_MAX: 'qwen-max',

    // ============================================================
    // 请求头
    // ============================================================
    _headers() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.API_KEY}`
        };
    },

    // ============================================================
    // 非流式调用 — 适用于评判影面（需要完整JSON结果）
    // ============================================================
    /**
     * @param {string} systemPrompt — 系统提示词（路师傅人设）
     * @param {string} userMessage  — 用户消息（影面描述 + 当前场景）
     * @param {object} options      — 可选参数
     * @param {string} options.model        — 模型名，默认 qwen-turbo
     * @param {number} options.temperature  — 0~1，默认0.3（评判需要稳定）
     * @param {number} options.maxTokens    — 默认800
     * @returns {Promise<string>} AI回复文本
     */
    async call(systemPrompt, userMessage, options = {}) {
        const {
            model = this.MODEL_DEFAULT,
            temperature = 0.3,
            maxTokens = 800
        } = options;

        const body = {
            model: model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
            ],
            max_tokens: maxTokens,
            temperature: temperature,
            // 评判模式关闭流式
            stream: false
        };

        try {
            console.log('[AI] 正在调用通义千问...', { model, msgLen: userMessage.length });

            const response = await fetch(this.API_URL, {
                method: 'POST',
                headers: this._headers(),
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errText = await response.text().catch(() => '未知错误');
                throw new Error(`API HTTP ${response.status}: ${errText}`);
            }

            const data = await response.json();

            if (!data.choices || data.choices.length === 0) {
                throw new Error('API返回为空，没有choices');
            }

            const content = data.choices[0].message.content;
            console.log('[AI] 调用成功，返回', content.length, '字');

            // 打印token用量（方便调试和控制预算）
            if (data.usage) {
                console.log('[AI] Token用量:', data.usage);
            }

            return content;

        } catch (error) {
            console.error('[AI] 调用失败:', error.message);
            // 返回备用的fallback文本，保证游戏不崩溃
            return this._fallbackText('call');
        }
    },

    // ============================================================
    // 流式调用（原始速度）— 保留兼容，内部转发到匀速模式
    // ============================================================
    /**
     * @param {string}   systemPrompt — 系统提示词
     * @param {string}   userMessage  — 用户消息
     * @param {function} onChunk      — 每收到一段文字就回调一次 onChunk(text)
     * @param {function} onDone       — 全部完成后回调 onDone(fullText)
     * @param {object}   options      — 可选参数
     * @param {string}   options.model       — 模型名，默认 qwen-turbo
     * @param {number}   options.temperature — 0~1，默认0.8（叙事需要创造力）
     * @param {number}   options.maxTokens   — 默认500
     * @param {number}   options.speed       — 语速: 'normal'（原始速度）| 数字(ms/字)
     * @returns {Promise<void>}
     */
    async callStream(systemPrompt, userMessage, onChunk, onDone, options = {}) {
        // 默认使用匀速模式，speed='raw'可切回原始速度
        const speed = options.speed || options.speed === 0 ? options.speed : this.SPEECH_SPEED;
        if (speed === 'raw') {
            return this._callStreamRaw(systemPrompt, userMessage, onChunk, onDone, options);
        }
        return this._callStreamBuffered(systemPrompt, userMessage, onChunk, onDone, options);
    },

    // ============================================================
    // 原始流式（API来多快就显示多快 — 保留用于调试和评判场景）
    // ============================================================
    async _callStreamRaw(systemPrompt, userMessage, onChunk, onDone, options = {}) {
        const {
            model = this.MODEL_DEFAULT,
            temperature = 0.8,
            maxTokens = 500
        } = options;

        const body = {
            model: model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
            ],
            max_tokens: maxTokens,
            temperature: temperature,
            stream: true,  // 关键：开启流式输出
            // 流式参数：增量模式
            stream_options: {
                include_usage: true
            }
        };

        let fullText = '';

        try {
            console.log('[AI · 流式] 正在连接...', { model, msgLen: userMessage.length });

            const response = await fetch(this.API_URL, {
                method: 'POST',
                headers: this._headers(),
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errText = await response.text().catch(() => '未知错误');
                throw new Error(`API HTTP ${response.status}: ${errText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = ''; // 缓冲区：处理跨chunk的不完整行

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                // 解码这一块数据
                buffer += decoder.decode(value, { stream: true });

                // SSE格式：每条数据以 \n\n 分隔
                // 格式：data: {"choices":[{"delta":{"content":"文字"}}]}\n\n
                const lines = buffer.split('\n');
                // 最后一个可能是不完整的行，留到下次处理
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data: ')) continue;
                    if (trimmed === 'data: [DONE]') continue; // 结束标记

                    try {
                        const jsonStr = trimmed.slice(6); // 去掉 "data: " 前缀
                        const json = JSON.parse(jsonStr);

                        // 提取增量内容
                        const delta = json.choices?.[0]?.delta;
                        if (delta && delta.content) {
                            fullText += delta.content;
                            if (typeof onChunk === 'function') {
                                onChunk(delta.content);
                            }
                        }
                    } catch (e) {
                        // JSON解析失败，可能是被截断的行，跳过
                        // 不完整的行已经留在buffer中
                    }
                }
            }

            console.log('[AI · 流式] 完成，共', fullText.length, '字');

            if (typeof onDone === 'function') {
                onDone(fullText);
            }

        } catch (error) {
            console.error('[AI · 流式] 调用失败:', error.message);

            // 流式失败时，回退到非流式调用
            console.log('[AI · 流式] 回退到非流式...');
            try {
                const fallback = await this.call(systemPrompt, userMessage, {
                    model: model,
                    temperature: temperature,
                    maxTokens: maxTokens
                });
                // 模拟逐字输出
                for (let i = 0; i < fallback.length; i++) {
                    if (typeof onChunk === 'function') {
                        onChunk(fallback[i]);
                    }
                    await this._sleep(30); // 模拟打字速度
                }
                if (typeof onDone === 'function') {
                    onDone(fallback);
                }
            } catch (fbError) {
                const fallback = this._fallbackText('stream');
                if (typeof onChunk === 'function') onChunk(fallback);
                if (typeof onDone === 'function') onDone(fallback);
            }
        }
    },

    // ============================================================
    // 匀速缓冲流式 — 模拟老师傅讲话节奏（核心！）
    // ============================================================
    /**
     * 内部实现：先全速从API拉取数据，同时用一个匀速定时器逐字吐出。
     *
     * 原理：
     *   API返回的chunk → 拆成单个字符 → 推入 charQueue（生产者）
     *   定时器每 N ms 从 charQueue 取一个字符 → onChunk（消费者）
     *
     * 为什么这样设计？
     *   - API返回速度不稳定（有时快有时卡），直接显示会很跳
     *   - 路师傅是个七十多岁的老人，说话不紧不慢
     *   - 匀速输出 + 标点停顿 = 像真人在讲话
     *
     * @param {number} options.speed — 每字间隔（ms），默认220
     *   参考值：
     *     180ms — 正常朗读速度（≈5.5字/秒）
     *     220ms — 路师傅日常说戏（≈4.5字/秒，老人从容语速）★默认
     *     280ms — 灯油偏低，师傅说话更慢了（≈3.5字/秒）
     *     350ms — 灯油见底，气若游丝（≈3字/秒）
     *     80ms  — 第二幕限时对决的紧张速度
     */
    async _callStreamBuffered(systemPrompt, userMessage, onChunk, onDone, options = {}) {
        const {
            model = this.MODEL_DEFAULT,
            temperature = 0.8,
            maxTokens = 500,
            speed = this.SPEECH_SPEED  // ms/字
        } = options;

        const body = {
            model: model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
            ],
            max_tokens: maxTokens,
            temperature: temperature,
            stream: true,
            stream_options: { include_usage: true }
        };

        // ---- 字符缓冲队列 ----
        const charQueue = [];        // 待输出的字符
        let apiDone = false;         // API是否已全部返回
        let apiError = null;         // API错误
        let resolveDrain = null;     // 用于唤醒消费者
        let fullText = '';           // 完整文本

        /**
         * 生产者：从API读取数据，拆成字符推入队列
         */
        const producer = (async () => {
            try {
                const response = await fetch(this.API_URL, {
                    method: 'POST',
                    headers: this._headers(),
                    body: JSON.stringify(body)
                });

                if (!response.ok) {
                    const errText = await response.text().catch(() => '未知错误');
                    throw new Error(`API HTTP ${response.status}: ${errText}`);
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder('utf-8');
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed || !trimmed.startsWith('data: ')) continue;
                        if (trimmed === 'data: [DONE]') continue;

                        try {
                            const json = JSON.parse(trimmed.slice(6));
                            const content = json.choices?.[0]?.delta?.content;
                            if (content) {
                                fullText += content;
                                // 拆成单个字符推入队列
                                for (const char of content) {
                                    charQueue.push(char);
                                }
                                // 唤醒可能在等待的消费者
                                if (resolveDrain) {
                                    resolveDrain();
                                    resolveDrain = null;
                                }
                            }
                        } catch (e) { /* 跳过解析失败的行 */ }
                    }
                }
            } catch (e) {
                apiError = e;
                console.error('[AI · 匀速流式] 生产者出错:', e.message);
            } finally {
                apiDone = true;
                // 确保消费者最终被唤醒
                if (resolveDrain) {
                    resolveDrain();
                    resolveDrain = null;
                }
            }
        })();

        /**
         * 消费者：匀速从队列取字符输出
         */
        const consumer = (async () => {
            let pausedForPunctuation = false;

            try {
                while (true) {
                    // 队列空了
                    if (charQueue.length === 0) {
                        if (apiDone) break;  // 生产者已完成 + 队列空 → 结束

                        // 等待生产者推送新数据
                        await new Promise(resolve => { resolveDrain = resolve; });
                        continue;
                    }

                    const char = charQueue.shift();

                    // 输出当前字符
                    if (typeof onChunk === 'function' && !pausedForPunctuation) {
                        onChunk(char);
                    }

                    // ---- 标点停顿（模拟真实说话节奏）----
                    let delay = speed;

                    if (this._isPunctuation(char)) {
                        delay = this._punctuationPause(char, speed);
                        pausedForPunctuation = true;
                    } else {
                        pausedForPunctuation = false;
                    }

                    // 等待指定时间后输出下一个字
                    await this._sleep(delay);

                }
            } catch (e) {
                console.error('[AI · 匀速流式] 消费者出错:', e.message);
            }

            // 全部完成
            console.log('[AI · 匀速流式] 完成，共', fullText.length, '字，速度≈', speed, 'ms/字');

            if (typeof onDone === 'function') {
                onDone(fullText);
            }
        })();

        // 等待生产者和消费者都完成
        await Promise.all([producer, consumer]);

        // 如果API出错，回退处理
        if (apiError) {
            console.log('[AI · 匀速流式] 回退到非流式...');
            try {
                const fallback = await this.call(systemPrompt, userMessage, {
                    model, temperature, maxTokens
                });
                for (const char of fallback) {
                    if (typeof onChunk === 'function') onChunk(char);
                    await this._sleep(speed);
                }
                if (typeof onDone === 'function') onDone(fallback);
            } catch (fbError) {
                const fb = this._fallbackText('stream');
                if (typeof onChunk === 'function') onChunk(fb);
                if (typeof onDone === 'function') onDone(fb);
            }
        }
    },

    // ============================================================
    // 语速配置
    // ============================================================
    /** 默认语速（ms/字）—— 路师傅从容说戏的节奏 */
    SPEECH_SPEED: 220,

    /** 预设语速档位 */
    SPEED_PRESETS: {
        'calm':     220,  // 从容说戏（默认）
        'slow':     280,  // 灯油偏低，有些疲惫
        'dying':    350,  // 灯油见底，气若游丝
        'urgent':   80,   // 第二幕限时对决
        'normal':   150,  // 正常朗读
    },

    /**
     * 根据灯油质量自动选择语速
     * @param {string} aiQuality — 'high'|'medium'|'low'|'critical'
     * @returns {number} ms/字
     */
    speedForQuality(aiQuality) {
        switch (aiQuality) {
            case 'high':     return this.SPEED_PRESETS.calm;   // 220ms
            case 'medium':   return this.SPEED_PRESETS.slow;   // 280ms
            case 'low':      return this.SPEED_PRESETS.dying;  // 350ms
            case 'critical': return this.SPEED_PRESETS.dying;  // 350ms
            default:         return this.SPEECH_SPEED;
        }
    },

    // ============================================================
    // 标点停顿
    // ============================================================
    /** 判断是否为需要额外停顿的标点 */
    _isPunctuation(char) {
        return '，。！？、；：…—'.includes(char);
    },

    /**
     * 计算标点后的额外停顿时间
     * @returns {number} 总延迟（原速度 + 额外停顿）
     */
    _punctuationPause(char, baseSpeed) {
        const pauses = {
            '。': baseSpeed + 600,   // 句号：停一拍
            '！': baseSpeed + 500,   // 感叹号：稍短的停顿
            '？': baseSpeed + 500,   // 问号
            '，': baseSpeed + 250,   // 逗号：换气的间隙
            '、': baseSpeed + 200,   // 顿号
            '；': baseSpeed + 350,   // 分号
            '：': baseSpeed + 300,   // 冒号
            '…': baseSpeed + 800,   // 省略号：师傅在思考
            '—': baseSpeed + 400,   // 破折号：师傅犹豫了一下
        };
        return pauses[char] || baseSpeed;
    },

    // ============================================================
    // 追问模式 — 玩家消耗灯油向师傅提问
    // ============================================================
    /**
     * @param {string} systemPrompt — 系统提示词
     * @param {string} question     — 玩家的问题
     * @param {string} context      — 当前剧情上下文
     * @returns {Promise<string>} 师傅的回答
     */
    async askMaster(systemPrompt, question, context) {
        const userMessage = `学徒追问道："${question}"\n\n当前剧情背景：${context}\n\n请以路师傅的口吻回答学徒的问题。回答要简短，像在幕间休息时压低声音说的话。`;
        return this.call(systemPrompt, userMessage, {
            temperature: 0.7,
            maxTokens: 300
        });
    },

    // ============================================================
    // 工具方法
    // ============================================================

    /** 模拟打字延迟 */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /** API失败时的兜底文本，保证游戏不崩溃 */
    _fallbackText(type) {
        const fallbacks = {
            call: [
                '师傅沉默了，灯火也跟着暗了一下……（网络不太顺畅，请稍后再试）',
                '油灯爆了一个灯花，师傅的声音被吞没了。再试一次吧。',
                '师傅似乎在想着什么，手指轻轻敲着操纵杆。等灯焰稳了再说。'
            ],
            stream: '……（灯火摇晃，师傅的声音传不过来了。再试一次吧。）'
        };

        const list = fallbacks[type] || fallbacks['call'];
        if (Array.isArray(list)) {
            return list[Math.floor(Math.random() * list.length)];
        }
        return list;
    }
};
