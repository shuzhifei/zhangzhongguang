/**
 * animate-player.js — 皮影动画播放器
 * ============================================================
 * 负责：视频序列播放 → 字幕时间轴调度 → 配音/音效同步 → 剧情回调
 *
 * 使用方式：
 *   const player = new AnimatePlayer(animateData);
 *   player.playAllShots();
 */

class AnimatePlayer {
    /**
     * @param {object} animateData — AnimateRequest.generateFullAnimation() 的返回数据
     */
    constructor(animateData) {
        this.script      = animateData.shotScript;
        this.videoList   = animateData.videoSrcList || [];
        this.voiceSrc    = animateData.voiceAudioSrc || null;
        this.bgmSrc      = animateData.bgmSrc || null;
        this.currentIdx  = 0;
        this.isPlaying   = false;

        // DOM 引用
        this.modal    = document.getElementById('animation-modal');
        this.videoDom = document.getElementById('animate-video');
        this.subtitle = document.getElementById('animate-subtitle');
        this.closeBtn = document.getElementById('animate-close');

        this._bindEvents();
    }

    /** 绑定关闭事件 */
    _bindEvents() {
        if (this.closeBtn) {
            this.closeBtn.onclick = () => this.stop();
        }
        if (this.videoDom) {
            this.videoDom.onended = () => this._onVideoEnd();
        }
    }

    /** 播放所有分镜 */
    playAllShots() {
        if (!this.modal || !this.videoDom) {
            console.warn('[播放器] DOM未就绪');
            return;
        }
        this.modal.classList.add('show');
        this.isPlaying = true;
        this.currentIdx = 0;

        // 启动背景音效
        if (this.bgmSrc && typeof audioSystem !== 'undefined') {
            audioSystem.playBgm(this.bgmSrc);
        }

        // 启动师傅配音
        if (this.voiceSrc && typeof audioSystem !== 'undefined') {
            audioSystem.playBgVoice(this.voiceSrc);
        }

        this._playShot(0);
    }

    /** 播放单个分镜 */
    _playShot(index) {
        if (index >= this.videoList.length) {
            this._onAllShotsComplete();
            return;
        }

        this.currentIdx = index;
        const shot = this.script?.shots?.[index];
        const videoSrc = this.videoList[index];

        if (!videoSrc) {
            console.warn('[播放器] 分镜' + index + '无视频，跳过');
            this._playShot(index + 1);
            return;
        }

        // 更新字幕
        if (shot && this.subtitle) {
            const speaker = shot.speaker || '路师傅';
            const text = shot.dialogue || '';
            this.subtitle.textContent = speaker + '：' + text;
            this.subtitle.style.display = 'block';
        }

        // 播放视频
        this.videoDom.src = videoSrc;
        this.videoDom.play().catch(e => {
            console.warn('[播放器] 视频播放失败:', e.message);
            // 自动播放被阻止，静音重试
            this.videoDom.muted = true;
            this.videoDom.play().catch(() => {});
        });
    }

    /** 单个视频播放完毕 */
    _onVideoEnd() {
        if (!this.isPlaying) return;
        this._playShot(this.currentIdx + 1);
    }

    /** 所有分镜播放完毕 */
    _onAllShotsComplete() {
        console.log('[播放器] 全部播放完毕');
        this.isPlaying = false;

        // 停止配音
        if (typeof audioSystem !== 'undefined') {
            audioSystem.stopAllVoice();
        }

        // 隐藏字幕
        if (this.subtitle) {
            this.subtitle.style.display = 'none';
        }

        // 触发剧情回调
        if (typeof gameState !== 'undefined' && gameState.afterAnimationCallback) {
            gameState.afterAnimationCallback();
        }
    }

    /** 停止播放并关闭 */
    stop() {
        this.isPlaying = false;
        if (this.videoDom) {
            this.videoDom.pause();
            this.videoDom.src = '';
        }
        if (this.modal) {
            this.modal.classList.remove('show');
        }
        if (typeof audioSystem !== 'undefined') {
            audioSystem.stopAllVoice();
        }
    }

    /** 跳过当前分镜 */
    skip() {
        if (this.isPlaying) {
            this._playShot(this.currentIdx + 1);
        }
    }
}
