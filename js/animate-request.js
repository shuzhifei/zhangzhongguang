/**
 * animate-request.js — 动画生成请求模块
 * ============================================================
 * 负责：收集皮影布局 → 组装分镜Prompt → 调用AI管线生成完整动画
 *
 * 调用流程：
 *   puppetStage.getShadowLayoutJSON()  →  获取皮影布局
 *   AnimatePrompt.buildShotScript()    →  组装分镜Prompt
 *   AI.call()                          →  获取分镜脚本
 *   MediaPipeline.produceAct()         →  生成全套视听内容
 *
 * 如果AI失败 → FallbackAnimate.runSimpleStage() 兜底
 */

const AnimateRequest = {

    /** 单次动画生成的最大灯油消耗 */
    OIL_COST_PER_GENERATION: 10,

    /**
     * 主入口：生成完整皮影动画
     * @param {object} layout    — puppetStage.getShadowLayoutJSON() 的输出
     * @param {object} gameState — 当前游戏状态
     * @returns {Promise<{success: boolean, data: object|null, error: string|null}>}
     */
    async generateFullAnimation(layout, gameState) {
        console.log('[动画生成] 开始...', { puppets: layout.puppets.length, oil: gameState.lampOil });

        // 1. 校验皮影数量
        if (!layout.puppets || layout.puppets.length === 0) {
            return { success: false, data: null, error: '白布上没有任何皮影，无法生成动画' };
        }

        // 2. 校验灯油
        if (gameState.lampOil < this.OIL_COST_PER_GENERATION) {
            return { success: false, data: null, error: '灯油不足，无法起影开戏' };
        }

        try {
            // 3. 构建皮影描述文本
            const shadowDesc = this._buildShadowDescription(layout);

            // 4. 组装分镜Prompt + 调用LLM生成分镜脚本
            const shotScript = await this._generateShotScript(shadowDesc, gameState);
            if (!shotScript || !shotScript.shots || shotScript.shots.length === 0) {
                throw new Error('AI分镜脚本生成为空');
            }

            // 5. 提取镜头描述和旁白
            const shotDescriptions = shotScript.shots.map(s => s.description || s.dialogue || '');
            const narrationLines = shotScript.shots.map(s => s.dialogue || '');
            const soundTypes = shotScript.shots.map(s => s.bgSound || s.soundType || 'oil_lamp');

            // 6. 调用媒体管线生成视听内容
            const pipeline = new MediaPipeline();
            const actNumber = gameState.currentAct || 1;
            const cameraStyle = actNumber === 1 ? 'opening' : actNumber === 2 ? 'climax' : 'ending';

            const mediaResult = await pipeline.produceAct(actNumber, shotDescriptions, narrationLines, {
                cameraStyle,
                soundTypes
            });

            // 7. 组装返回数据
            const data = {
                shotScript: shotScript,
                videoSrcList: mediaResult.videos.map(v => v.videoUrl).filter(Boolean),
                voiceAudioSrc: this._pickVoiceSrc(mediaResult.narrations),
                bgmSrc: mediaResult.sounds.length > 0 ? mediaResult.sounds[0].audioUrl : null,
                pipeline: mediaResult
            };

            console.log('[动画生成] 完成 ✅', {
                videos: data.videoSrcList.length,
                voice: !!data.voiceAudioSrc,
                bgm: !!data.bgmSrc
            });

            return { success: true, data, error: null };

        } catch (e) {
            console.error('[动画生成] 失败:', e.message);
            return { success: false, data: null, error: e.message };
        }
    },

    /**
     * 将皮影布局转为自然语言描述
     */
    _buildShadowDescription(layout) {
        const parts = [];
        if (layout.sceneName) parts.push('场景：' + layout.sceneName);
        for (const p of (layout.puppets || [])) {
            const h = p.x < 0.33 ? '左' : p.x > 0.66 ? '右' : '中央';
            const v = p.y < 0.33 ? '上' : p.y > 0.66 ? '下' : '中间';
            parts.push(p.name + '在白布' + h + v);
        }
        return parts.join('；') + '。';
    },

    /**
     * 调用LLM生成分镜脚本
     */
    async _generateShotScript(shadowDesc, gameState) {
        const actInfo = (typeof ACTS_DATA !== 'undefined' && ACTS_DATA.acts)
            ? ACTS_DATA.acts[gameState.currentAct - 1] : null;
        const sceneInfo = actInfo?.scenes?.[gameState.currentScene || 0];

        const systemPrompt = `你是北京皮影戏的分镜师。根据学徒在白布上摆放的皮影，设计一段皮影动画的分镜脚本。

【规则】
- 每个分镜必须包含：镜头类型、运镜方式、皮影动作、对白、灯光、音效
- 分镜数量2-5个，串联成一个完整的微叙事
- 对白必须是路师傅苍老口吻（老北京腔，停顿用"——"）
- 灯光描述要体现油灯效果（暖黄光、火焰抖动、影子变形）
- 这是第${gameState.currentAct || 1}幕：${actInfo?.name || '未知'}——${actInfo?.mood || ''}`;

        const userMessage = `学徒在白布上摆了以下皮影：
${shadowDesc}

当前场景：${sceneInfo?.description || '自由创作'}
灯油剩余：${gameState.lampOil || 100}%

请生成分镜脚本JSON：
{
  "scene": "场景名",
  "shots": [
    {
      "shotId": "shot_01",
      "startTime": 0, "endTime": 5,
      "cameraType": "远景/中景/特写",
      "cameraMove": "运镜描述",
      "description": "画面描述",
      "puppetActions": [{"puppet":"皮影名","targetX":0.5,"targetY":0.5,"swingRange":0.05}],
      "dialogue": "路师傅对白",
      "speaker": "路师傅",
      "lightingDesc": "灯光描述",
      "bgSound": "oil_lamp/wind/water/erhu/stage/silence"
    }
  ]
}
只输出JSON。`;

        const raw = await AI.call(systemPrompt, userMessage, { temperature: 0.7, maxTokens: 800 });
        try {
            return JSON.parse(raw);
        } catch (e) {
            const m = raw.match(/\{[\s\S]*\}/);
            return m ? JSON.parse(m[0]) : null;
        }
    },

    /** 从旁白数组中选取有效配音 */
    _pickVoiceSrc(narrations) {
        const valid = (narrations || []).filter(n => n.audioUrl);
        return valid.length > 0 ? valid[0].audioUrl : null;
    }
};
