// ==========================================
// puppet-images.js — 皮影图片素材映射
// B组（逻辑工程师）负责维护
// ==========================================
// 说明：把照片/图片素材和皮影 ID 对应起来。
// 有图片就显示图片，没图片就用 emoji 兜底。
// A 只需要按下面格式加一行，把图片放到 assets/images/ 即可。
// ==========================================

const PuppetImageMap = {
    // 第一幕 —— 琉璃厂·书生与鹤
    scholar:  'assets/images/scholar.png',   // 书生
    elder:    'assets/images/elder.png',     // 老者
    tree:     'assets/images/tree.png',       // 槐树（已处理：去水印+去背景+透明PNG）
    moon:     'assets/images/moon.png',      // 月亮（已润色：去水印+去背景+透明PNG）
    letter:   null,                           // 信
    frog:     'assets/images/frog.png',       // 金蟾
    lamp:     null,                           // 灯
    master:   'assets/images/master.png',       // 师傅（已处理：去背景+透明PNG）

    // 第二幕 —— 大栅栏·灯灭之前
    demon:    null,                           // 白骨精
    monkey:   null,                           // 孙悟空
    bamboo:   null,                           // 竹子

    // 第三幕 —— 影子自己的戏（即兴，无固定皮影）
};

// 兜底 emoji（图片没到位时显示）
const PUPPET_EMOJI = {
    scholar: '📜', elder: '👴', tree: '🌳', moon: '🌙',
    letter: '✉️', frog: '🐸', demon: '👹', monkey: '🐵',
    lamp: '💡', master: '👨‍🏫', bamboo: '🎋'
};

const PuppetImageRenderer = {
    // 获取图片路径（无图则返回 null）
    getPath(id) {
        return PuppetImageMap[id] || null;
    },

    // 判断该皮影是否有图片
    hasImage(id) {
        return !!PuppetImageMap[id];
    },

    // 渲染为 HTML 字符串（img 标签 或 emoji span）
    // opts: { width, height } —— 可选，控制图片尺寸
    render(id, opts = {}) {
        const path = this.getPath(id);
        const w = opts.width || 120;
        const h = opts.height || 'auto';

        if (path) {
            return `<img src="${path}" alt="${id}" 
                style="width:${w}px;${h !== 'auto' ? 'height:'+h+'px;' : ''}object-fit:contain;pointer-events:none;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));" 
                draggable="false">`;
        }
        // 兜底 emoji
        const emoji = PUPPET_EMOJI[id] || '🎭';
        return `<span style="font-size:40px;user-select:none;">${emoji}</span>`;
    },

    // 预加载所有已配置的图片（可选，游戏启动时调用）
    preload() {
        const ids = Object.keys(PuppetImageMap).filter(id => PuppetImageMap[id]);
        const promises = ids.map(id => new Promise((resolve) => {
            const img = new Image();
            img.src = PuppetImageMap[id];
            img.onload = () => resolve({ id, ok: true });
            img.onerror = () => {
                console.warn(`[PuppetImage] 加载失败: ${id} → ${PuppetImageMap[id]}`);
                resolve({ id, ok: false });
            };
        }));
        return Promise.all(promises);
    }
};

// 全局暴露
window.PuppetImageMap = PuppetImageMap;
window.PuppetImageRenderer = PuppetImageRenderer;
