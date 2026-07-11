/**
 * config.example.js — 掌中光 全AI服务配置模板
 *
 * ⚠️ 使用方式：
 *   1. 复制此文件 → 重命名为 config.js
 *   2. 在 config.js 中填入你的真实API Key
 *   3. config.js 已在 .gitignore 中，不会被上传到GitHub
 *
 * 🔑 所有API Key统一在阿里云DashScope申请：
 *   https://dashscope.aliyun.com → API-KEY管理
 *   （一个Key可同时调用LLM、文生图、图生视频、TTS、音频生成）
 */

// ============================================================
// API 代理地址
// 生产环境：通过 serve.js 中转，API Key 仅存服务器端，前端不暴露
// 本地调试：指向本地 serve.js 或直连 DashScope
// ============================================================

// 本地调试地址
// const BASE_API = 'http://127.0.0.1:3000/api';
// 替换为你的云服务器公网IP
const BASE_API = 'http://123.57.90.233:3000/api';

const API_CONFIG = {
    // ============================================================
    // 通用配置
    // ============================================================
    /** 统一API Key（仅直连DashScope时需要；走代理时留空即可） */
    API_KEY: '',

    /** API 代理地址（serve.js 中转服务） */
    BASE_API: BASE_API,

    // ============================================================
    // 1. LLM 文本对话（通义千问）— 路师傅说戏 + 影面评判
    // ============================================================
    LLM: {
        /** 代理端点 */
        ENDPOINT: BASE_API + '/llm',
        ENDPOINT_STREAM: BASE_API + '/llm/stream',
        MODEL_DEFAULT:  'qwen-turbo',
        MODEL_PREMIUM:  'qwen-plus',
        MODEL_MAX:      'qwen-max',
        MAX_TOKENS_NARRATION: 500,
        MAX_TOKENS_JUDGE:     400,
        TEMPERATURE_NARRATION: 0.8,
        TEMPERATURE_JUDGE:     0.3,
    },

    // ============================================================
    // 2. 文生图（通义万相 Wan2.6-T2I）— 皮影分镜原画
    // ============================================================
    T2I: {
        ENDPOINT: BASE_API + '/t2i',
        MODEL: 'wan2.6-t2i',
        DEFAULT_SIZE: '1664*928',
        DEFAULT_N: 1,
        NEGATIVE_PROMPT: '写实照片,3D渲染,卡通,动漫,油画,水彩,现代风格,人物正面特写',
        STYLE_PREFIX: '北京非遗皮影戏风格,幕布投影,暖黄灯光,牛皮镂刻质感,半透明皮影,老北京民国年间,暖色调,舞台光影,'
    },

    // ============================================================
    // 3. 图生视频（通义万相 Wan2.2-I2V-Flash）— 皮影动画短片
    // ============================================================
    I2V: {
        ENDPOINT: BASE_API + '/i2v',
        ENDPOINT_POLL: BASE_API + '/i2v/poll',
        MODEL: 'wan2.2-i2v-flash',
        DEFAULT_DURATION: 8,
        CAMERA_PRESETS: {
            'opening':   'slow zoom in from wide shot, gentle pan right',
            'dialogue':  'static shot with subtle breathing movement',
            'climax':    'dramatic push in, lamp flicker, shadow distortion',
            'ending':    'slow zoom out, fade to darkness, lamp extinguishing'
        },
        MOTION_PROMPT: '皮影人物微微摆动,操纵杆细线可见,灯油火焰闪烁晃动,幕布透光质感,影子在幕布上投射出变形光影,'
    },

    // ============================================================
    // 4. TTS 语音合成（通义语音）— 路师傅旁白配音
    // ============================================================
    TTS: {
        ENDPOINT: BASE_API + '/tts',
        MODEL: 'cosyvoice-v1',
        VOICE: 'laochengshuo_narrator',
        SPEED: 0.85,
        VOLUME: 1.0,
        FORMAT: 'mp3',
        SAMPLE_RATE: 22050
    },

    // ============================================================
    // 5. 音频生成（通义音频）— 环境音效 + 皮影戏曲BGM
    // ============================================================
    AUDIO_GEN: {
        ENDPOINT: BASE_API + '/audio',
        MODEL: 'qwen-audio',
        SOUND_PRESETS: {
            'oil_lamp':   '油灯噼啪燃烧声,火苗轻微爆裂,安静室内氛围',
            'wind':       '民国北京胡同秋风,枯叶沙沙,远处鸽哨,轻微门窗吱呀',
            'water':      '寒江水流声,船桨划水,水面波光粼粼氛围',
            'erhu':       '传统二胡独奏,苍凉皮影戏曲调,慢板,散板节奏',
            'market':     '老北京琉璃厂书摊集市人声,远处叫卖,茶碗碰撞',
            'stage':      '皮影戏台开场锣鼓,京胡二胡合奏,戏曲过场音乐',
            'thunder':    '远处闷雷,雨声淅沥,适合剧情转折',
            'silence':    '极度安静,只有微弱的呼吸声,即将灯灭的氛围'
        },
        FORMAT: 'mp3',
        DEFAULT_DURATION: 15
    },

    // ============================================================
    // 全局约束
    // ============================================================
    ART_STYLE: {
        name: '北京非遗皮影戏',
        palette: '暖黄、琥珀、深褐、黑色剪影、橘红火光',
        era: '民国年间（1912-1949）',
        location: '北京琉璃厂 / 胡同 / 茶馆 / 庙会戏台'
    }
};
