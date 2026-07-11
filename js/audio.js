/**
 * audio.js — 掌中光 音频系统
 * ============================================================
 * 管理：背景音乐 / 师傅配音 / 环境音效 / 动画音画同步
 *
 * 使用方式：
 *   audioSystem.playBgm(src);
 *   audioSystem.playBgVoice(src);
 *   audioSystem.playSfx('oil_lamp');
 *   audioSystem.stopAllVoice();
 */

const audioSystem = {

    _bgmAudio: null,
    _voiceAudio: null,
    _sfxAudios: [],

    // ---- 背景音乐 ----
    playBgm(src) {
        if (!src) return;
        this.stopBgm();
        this._bgmAudio = new Audio(src);
        this._bgmAudio.loop = true;
        this._bgmAudio.volume = 0.3;
        this._bgmAudio.play().catch(() => {});
    },

    stopBgm() {
        if (this._bgmAudio) { this._bgmAudio.pause(); this._bgmAudio = null; }
    },

    // ---- 师傅配音（单轨，不可叠加） ----
    playBgVoice(src) {
        if (!src) return;
        this.stopAllVoice();
        this._voiceAudio = new Audio(src);
        this._voiceAudio.volume = 0.8;
        this._voiceAudio.play().catch(() => {});
    },

    stopAllVoice() {
        if (this._voiceAudio) { this._voiceAudio.pause(); this._voiceAudio = null; }
    },

    // ---- 环境音效（可叠加） ----
    playSfx(src, volume = 0.5) {
        if (!src) return;
        const a = new Audio(src);
        a.volume = volume;
        a.play().catch(() => {});
        a.onended = () => {
            const idx = this._sfxAudios.indexOf(a);
            if (idx > -1) this._sfxAudios.splice(idx, 1);
        };
        this._sfxAudios.push(a);
        return a;
    },

    stopAllSfx() {
        this._sfxAudios.forEach(a => a.pause());
        this._sfxAudios = [];
    },

    // ---- 全部停止 ----
    stopAll() {
        this.stopBgm();
        this.stopAllVoice();
        this.stopAllSfx();
    }
};
