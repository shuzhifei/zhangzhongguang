/**
 * shadow-judge.js — 影面评判系统
 * 将玩家摆放的皮影转化为自然语言，调用AI评判影面是否"对路"
 *
 * 评判流程：
 *   玩家确认影面 → puppetsToText() → buildJudgePrompt() → AI.call() → 解析结果 → 通知EventBus
 */

const ShadowJudge = {

    // ============================================================
    // 主入口：评判玩家的影面
    // ============================================================
    /**
     * @param {Array}  stagedPuppets  — 白布上当前的皮影列表 [{puppetId, name, x, y}, ...]
     * @param {string} currentSceneId — 当前场景ID
     * @param {boolean} isImprov      — 是否是第三幕即兴创作模式
     * @returns {Promise<object>} { score, correct, puppet_choice, composition, creativity, comment, emotional_hit?, guiding_hint? }
     */
    async judge(stagedPuppets, currentSceneId, isImprov = false) {
        // 1. 获取场景数据
        const scene = this._getSceneData(currentSceneId);
        if (!scene) {
            console.warn('[影面评判] 未找到场景数据:', currentSceneId);
            return this._defaultResult();
        }

        // 2. 把皮影列表转为自然语言描述
        const shadowDesc = this.puppetsToText(stagedPuppets);

        // 3. 检查是否有值得评判的内容
        if (stagedPuppets.length === 0) {
            console.log('[影面评判] 白布为空，跳过AI调用');
            const emptyResult = {
                score: 0,
                correct: false,
                character_match: { score: 0, comment: '白布上什么都没有。' },
                spatial: { score: 0, comment: '没有影面，无从评判方位。' },
                plot_detail: { score: 0, comment: '没有皮影，剧情无处落脚。' },
                authenticity: { score: 0, comment: '空白的白布——也许学徒在想别的。' },
                comment: '白布上什么都没有。学徒在犹豫？'
            };
            EventBus.emit('judge_result', emptyResult);
            return emptyResult;
        }

        // 4. 组装评判Prompt
        const { systemPrompt, userMessage } = promptBuilder.buildJudgePrompt(
            scene, shadowDesc, isImprov
        );

        // 5. 调用AI评判（非流式，需要完整JSON结果）
        console.log('[影面评判] 开始评判...', { puppets: stagedPuppets.length, isImprov });
        const rawResult = await AI.call(systemPrompt, userMessage, {
            temperature: 0.2,  // 评判需要稳定输出
            maxTokens: 300,
            model: AI.MODEL_DEFAULT
        });

        // 6. 解析AI返回的JSON
        const result = this._parseJSON(rawResult, isImprov);

        // 7. 通过事件总线通知游戏逻辑
        EventBus.emit('judge_result', {
            score: result.score,
            correct: result.correct,
            character_match: result.character_match,
            spatial: result.spatial,
            plot_detail: result.plot_detail,
            narrative_logic: result.narrative_logic,
            authenticity: result.authenticity,
            comment: result.comment,
            emotional_hit: result.emotional_hit,
            guiding_hint: result.guiding_hint
        });

        console.log('[影面评判] 完成:', result);
        return result;
    },

    // ============================================================
    // 皮影 → 自然语言 转化（核心算法）
    // ============================================================
    /**
     * 将白布上的皮影数组转化为一段AI可读的自然语言描述
     *
     * @param {Array} puppets — [{puppetId, name, x, y}, ...]
     *   x, y 是0~1的比例值（相对于白布宽高）
     * @returns {string} 如："书生在白布中央中间，月亮在右侧上方，槐树在左下角"
     */
    puppetsToText(puppets) {
        if (!puppets || puppets.length === 0) {
            return '白布上空无一物，学徒还没有摆任何皮影。';
        }

        const descriptions = puppets.map(p => {
            const area = this._getAreaDescription(p.x, p.y);
            return `${p.name}在${area}`;
        });

        return descriptions.join('，') + '。';
    },

    /**
     * 根据坐标(0~1)返回皮影戏的方位描述
     */
    _getAreaDescription(x, y) {
        // 边界情况（皮影戏特有的说法）
        if (x < 0.1) return '台口左侧（几乎要出框了）';
        if (x > 0.9) return '台尾右侧（快要走出光了）';
        if (y < 0.1) return '白布上边缘（靠近顶光）';
        if (y > 0.9) return '白布下缘（贴近台面）';

        // 水平方位
        let hPos;
        if (x < 0.33) hPos = '左侧';
        else if (x > 0.66) hPos = '右侧';
        else hPos = '中央';

        // 垂直方位
        let vPos;
        if (y < 0.33) vPos = '上方';
        else if (y > 0.66) vPos = '下方';
        else vPos = '中间';

        // 角落组合
        if (hPos === '左侧' && vPos === '上方') return '左上角';
        if (hPos === '右侧' && vPos === '上方') return '右上角';
        if (hPos === '左侧' && vPos === '下方') return '左下角';
        if (hPos === '右侧' && vPos === '下方') return '右下角';

        // 中央 + 中间 = 就是正中间
        if (hPos === '中央' && vPos === '中间') return '白布正中央';

        return hPos + vPos;
    },

    // ============================================================
    // 快速本地评判（不调用AI，用于低油量时的降级方案）
    // ============================================================
    /**
     * 当灯油极低或网络不通时，使用简单的规则评判
     * 不调用AI，只做基本的皮影匹配检查
     */
    quickJudge(stagedPuppets, currentSceneId) {
        const scene = this._getSceneData(currentSceneId);
        if (!scene || !scene.standard_puppets) {
            return {
                score: 50, correct: true,
                character_match: { score: 15, comment: '灯太暗了……' },
                spatial: { score: 10, comment: '看不清位置……' },
                plot_detail: { score: 10, comment: '灯将灭，戏词模糊……' },
                authenticity: { score: 15, comment: '……（灯太暗了，看不清影面）' },
                comment: '……（灯太暗了，看不清影面）'
            };
        }

        const placedIds = stagedPuppets.map(p => p.puppetId);
        const required = scene.standard_puppets || [];
        const extras = scene.acceptable_extras || [];

        const covered = required.filter(id => placedIds.includes(id));
        const coverage = required.length > 0 ? covered.length / required.length : 1;

        const allowed = [...required, ...extras];
        const unexpected = placedIds.filter(id => !allowed.includes(id));

        let charScore = Math.round(coverage * 30);
        let spatialScore = Math.round(coverage * 25 * 0.6); // 本地无法分析方位，打折
        let plotScore = Math.round(coverage * 25 * 0.6);
        let authScore = coverage >= 0.8 ? 16 : coverage >= 0.5 ? 12 : 6;
        let score = charScore + spatialScore + plotScore + authScore;
        let correct = coverage >= 0.6;

        if (coverage < 0.5) score -= 20;

        const comment = coverage >= 0.8
            ? '大致对路。'
            : coverage >= 0.5
                ? '还差一些。'
                : '不太对。';

        return {
            score: Math.max(0, score),
            correct,
            character_match: { score: charScore, comment: covered.length ? `选了${covered.join('、')}` : '缺了关键角色' },
            spatial: { score: spatialScore, comment: '（本地评判，无法精确分析方位）' },
            plot_detail: { score: plotScore, comment: '（本地评判，无法分析剧情还原）' },
            authenticity: { score: authScore, comment: unexpected.length ? `额外选了${unexpected.join('、')}` : '中规中矩' },
            comment
        };
    },

    // ============================================================
    // 工具方法
    // ============================================================

    /** 从acts.json获取场景数据 */
    _getSceneData(sceneId) {
        if (!ACTS_DATA || !ACTS_DATA.acts) return null;

        for (const act of ACTS_DATA.acts) {
            if (act.scenes) {
                const found = act.scenes.find(s => s.id === sceneId);
                if (found) return found;
            }
        }
        return null;
    },

    /** 解析AI返回的JSON（容错处理） */
    _parseJSON(rawText, isImprov = false) {
        try {
            // 尝试直接解析
            return JSON.parse(rawText);
        } catch (e1) {
            // 尝试从文本中提取JSON块（AI可能在JSON前后加了文字）
            try {
                const match = rawText.match(/\{[\s\S]*\}/);
                if (match) return JSON.parse(match[0]);
            } catch (e2) {
                // 最后的fallback
                console.warn('[影面评判] JSON解析失败，使用默认值。原始返回:', rawText);
            }
        }

        return this._defaultResult(isImprov);
    },

    /** 默认评判结果（解析失败时使用） */
    _defaultResult(isImprov = false) {
        if (isImprov) {
            return {
                score: 50,
                correct: true,
                character_match: { score: 10, comment: '角色选择……（解析异常，无法详评）' },
                spatial: { score: 10, comment: '方位有待细看……' },
                narrative_logic: { score: 15, comment: '叙事逻辑……说不清。' },
                authenticity: { score: 15, comment: '有些东西在影面里——说不清。' },
                emotional_hit: '这个影面里有些东西……说不清。',
                comment: '守护之灵沉默了一会儿。这个影面里有些东西——说不清。',
                guiding_hint: '继续。你觉得对，就继续。'
            };
        }
        return {
            score: 50,
            correct: true,
            character_match: { score: 15, comment: '选角尚可……（解析异常，无法详评）' },
            spatial: { score: 12, comment: '方位有待细看……' },
            plot_detail: { score: 12, comment: '剧情还原……说不清。' },
            authenticity: { score: 11, comment: '有些东西——说不清。' },
            comment: '师傅沉默了一会儿，微微点了点头。',
            guiding_hint: '再想想。'
        };
    }
};
