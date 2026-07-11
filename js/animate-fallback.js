/**
 * animate-fallback.js — AI生成失败兜底动画
 * ============================================================
 * 当AI动画生成失败时，使用预设分镜脚本 + CSS动画驱动皮影，
 * 在幕布上直接播放简易的静态动画，保证玩家体验不中断。
 *
 * 使用方式：
 *   FallbackAnimate.runSimpleStage(layout, gameState);
 */

const FallbackAnimate = {

    /** 默认动画时长（ms） */
    DEFAULT_DURATION: 10000,

    /**
     * 在幕布上运行简易CSS皮影动画
     * @param {object} layout    — puppetStage.getShadowLayoutJSON()
     * @param {object} gameState — 游戏状态
     */
    runSimpleStage(layout, gameState) {
        console.log('[兜底动画] 启动简易动画...', { puppets: layout.puppets.length });

        const stage = document.getElementById('shadow-stage');
        if (!stage) {
            console.warn('[兜底动画] 幕布DOM未找到');
            return;
        }

        // 1. 获取当前幕的兜底分镜
        const actIdx = (gameState?.currentAct || 1) - 1;
        const fallbackScript = (typeof ANIMATE_FALLBACK_DATA !== 'undefined')
            ? ANIMATE_FALLBACK_DATA[actIdx] || ANIMATE_FALLBACK_DATA[0]
            : null;

        const shots = fallbackScript?.shots || [];
        const subtitle = document.getElementById('animate-subtitle');

        // 2. 给幕布上的皮影添加CSS动画
        layout.puppets.forEach(puppet => {
            const dom = document.querySelector(`[data-puppet-id="${puppet.id}"]`);
            if (!dom) return;

            // 微摆动动画
            dom.style.transition = 'all 2s ease-in-out';
            dom.style.transform =
                `translate(${(puppet.x + 0.1) * 100}%, ${(puppet.y - 0.08) * 100}%) ` +
                `scale(${puppet.scale || 1})`;
            dom.classList.add('puppet-swing');

            // 10秒后移除动画
            setTimeout(() => {
                dom.classList.remove('puppet-swing');
            }, this.DEFAULT_DURATION);
        });

        // 3. 逐条显示字幕
        let idx = 0;
        const showNextSubtitle = () => {
            if (idx >= shots.length || !subtitle) return;
            const shot = shots[idx];
            subtitle.textContent = (shot.speaker || '路师傅') + '：' + (shot.dialogue || '');
            subtitle.style.display = 'block';

            const duration = ((shot.endTime || 5) - (shot.startTime || 0)) * 1000;
            idx++;
            if (idx < shots.length) {
                setTimeout(showNextSubtitle, duration);
            } else {
                // 全部播放完毕
                setTimeout(() => {
                    if (subtitle) subtitle.style.display = 'none';
                    if (gameState?.afterAnimationCallback) {
                        gameState.afterAnimationCallback();
                    }
                }, duration);
            }
        };
        showNextSubtitle();

        // 4. 播放兜底音效
        if (typeof audioSystem !== 'undefined') {
            const firstSound = shots[0]?.bgSound || 'oil_lamp';
            audioSystem.playBgVoice('assets/audio/animate_voice.mp3');
        }

        console.log('[兜底动画] 运行中... (' + shots.length + '条字幕)');
    },

    /**
     * 纯CSS皮影摆动关键帧（注入到幕布皮影上）
     */
    injectSwingStyle() {
        if (document.getElementById('fallback-swing-style')) return;
        const style = document.createElement('style');
        style.id = 'fallback-swing-style';
        style.textContent = `
            @keyframes puppet-swing-fallback {
                0%   { transform: translate(0, 0) rotate(-1deg); }
                25%  { transform: translate(2px, -1px) rotate(1deg); }
                50%  { transform: translate(-1px, 1px) rotate(-0.5deg); }
                75%  { transform: translate(1px, -1px) rotate(0.5deg); }
                100% { transform: translate(0, 0) rotate(-1deg); }
            }
            .puppet-swing {
                animation: puppet-swing-fallback 2s ease-in-out infinite;
                filter: brightness(0) !important;
            }
        `;
        document.head.appendChild(style);
    }
};
