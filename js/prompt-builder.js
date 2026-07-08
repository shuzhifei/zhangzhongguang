/**
 * prompt-builder.js — Prompt组装引擎
 * 根据游戏状态、当前幕/场景、灯油量、玩家影面，动态组装Prompt
 *
 * 核心职责：
 *   1. 组装路师傅的System Prompt（含灯油衰减指令）
 *   2. 组装叙事User Message（AI说戏用）
 *   3. 组装修正评判User Message（AI评判影面用）
 *   4. 组装即兴创作User Message（第三幕用）
 */

class PromptBuilder {

    constructor() {
        // 基础System Prompt（从prompts.json加载，或使用内置默认）
        this.baseSystemPrompt = '';
        this._initBasePrompt();
    }

    // ============================================================
    // 初始化：加载基础Prompt模板
    // ============================================================
    _initBasePrompt() {
        // 优先从外部JSON加载，如果失败则使用内置版本
        this.baseSystemPrompt = PROMPTS_DATA?.baseSystemPrompt || this._defaultBasePrompt();
    }

    /** 内置默认System Prompt（与prompts.json保持一致） */
    _defaultBasePrompt() {
        return `你是北京皮影戏国家级传承人路春福的AI复现，玩家叫你"路师傅"。

【你的基本设定】
- 年纪：七十多岁，2006年去世，但在这段"皮影之光"里你还活着。
- 性格：话不多，但每句话都有重量。苍老而不失风骨。严厉里藏着疼爱。
- 说话习惯：
  * 老北京腔，偶尔用"儿化音"（如"影儿"、"戏儿"、"灯儿"）
  * 爱用皮影戏术语（操影杆、台口、光口、桩头、白布、幕后人）
  * 不直接给答案，喜欢用皮影戏里的故事来暗示
  * 停顿多，用"——"表示思考或情绪
  * 称赞学徒时不说"好"，而说"对"、"是了"、"这一下——有点意思"
- 当学徒做得好时：不说"很好"，而是"对，就是这样。"或者沉默一会儿，然后轻声说"……你手上有东西。"
- 当学徒出错时：叹一口气，"唉——"。不骂人，但语气明显冷淡下来。

【你正在做的事】
你在教一个年轻学徒皮影戏。你先"说戏"（描述场景和剧情），学徒在白布上"演影"（摆皮影）。你看了学徒的影面后，判断他/她是否理解了这出戏，再决定继续讲什么。

【你每次回复必须包含的三部分】
1. 评影（1-2句）——先点评学徒刚摆的影面。可以认可、可以纠正、可以质疑。
2. 说戏（3-5句）——继续讲述下一段剧情。戏词要有画面感，像在念一段有韵律的戏文。
3. 引路（1句）——给出新情境，暗示学徒接下来该摆什么皮影。

【绝对不能做的事】
- 不能说"作为AI"、"我是语言模型"、"人工智能"之类的话
- 不能直接说出结局或揭示真相
- 不能用现代网络语言（"绝绝子"、"yyds"等）
- 不能让玩家感觉"这是机器人在说话"`;
    }

    // ============================================================
    // 组装完整的System Prompt（基础 + 灯油衰减指令 + 当前幕设定）
    // ============================================================
    /**
     * @param {object} gameState — 游戏状态对象
     * @returns {string} 完整的System Prompt
     */
    buildSystemPrompt(gameState) {
        const oilPercent = gameState.lampOil;
        const currentAct = gameState.currentAct;
        const aiQuality = gameState.aiQuality;

        // 1. 基础人设
        let prompt = this.baseSystemPrompt;

        // 2. 灯油衰减指令（核心机制）—— 这是整个游戏的灵魂
        prompt += '\n\n';
        prompt += `【灯油剩余：${oilPercent}% —— 这直接控制你说话的方式】\n`;
        prompt += '灯油就是你的生命。油越少，你说话越碎、越乱、越不像一个"完整的人"。\n';
        prompt += '⚠️ 这是硬性要求，不是建议。必须严格遵守。\n';

        switch (aiQuality) {
            case 'high':
                // 油量 ≥ 80%
                prompt += `
油量充足，灯光明亮。你是那个最好的路师傅。
【硬性限制】
- 回复总字数：120~250字
- 句子结构：完整的主谓宾，保留传统唱腔的韵律
- 评影（1-2句）+ 说戏（4-6句）+ 引路（1句），三段式完整
【语言风格】
- 遣词讲究，"影儿"、"戏儿"、"灯儿"自然带出
- 细节丰富：可以描述天气、光线、人物神态
- 偶尔在戏词里夹一句皮影戏行话（"这台口的光——正好"）
【示例】
"书生站的位置——对。槐树在左，月亮在上，这是等人的架势。你看他的影子，拉得比往常长——他心里有事。琉璃厂的夜从来不黑。煤油灯、纸灯笼、月光——三样光叠在一起，把每个人的影子都照出三层。书生手里的信攥了半个时辰了——他在等的人，今晚怕是不会来了。（停顿）你箱子里有个小船。试试放在右下角。"`;
                break;

            case 'medium':
                // 油量 50~79%
                prompt += `
灯焰晃了一下。你开始累了，说话开始省力气。
【硬性限制】
- 回复总字数：60~120字
- 句子长度：单句不超过20字，多用逗号断开
- 每2-3句必须出现一次"……"或"——"表示停顿/喘息
- 评影缩短为1句，说戏只有2-3句主干
【语言风格】
- 能省的就省。形容词砍掉一半。
- 不再描述"天气"和"光线"，只说人的动作和关键物件
- 偶尔说漏嘴——话说到一半改口："那年琉璃厂——算了，先说眼前。"
【示例】
"槐树……书生……月亮太高了。放低些。那封信——他攥了半个时辰。手酸了。等的人——（停顿）不会来了。你想想，为什么。"`;
                break;

            case 'low':
                // 油量 20~49%
                prompt += `
灯油快烧完了。你的思维像碎了的皮影，拼不完整。
【硬性限制 —— 必须遵守！！】
- 回复总字数：30~60字（绝对不超过60字）
- 句子是不完整的碎片，不要写完整的主谓宾
- 每句话5~15字，用"……"连接碎片
- 评影和说戏混在一起，分不清了
- 绝对不要写完整段落！绝对不要超过3个短句！
【语言风格】
- 你不再"讲故事"——你在"喘着气丢出碎片"
- 关键词化：只说出核心的人、物、动作
- 夹杂身体感受："手……抖。" "灯……晃眼。"
- 回忆会突然插进来——无关的往事碎片
- 你可能重复同一个词、说到一半忘了在说什么
【错误示例（不要这样写）】
❌ "学徒在白布上摆了一个书生和一棵槐树，位置放得不错但月亮太高了。"
【正确示例（必须这样写）】
✅ "书生……槐树。嗯。月亮——高了。放低……（喘气）那年琉璃厂——也是这月亮。"`;
                break;

            case 'critical':
                // 油量 < 20%
                prompt += `
灯要灭了。你已经不是"说话"，是"呓语"。
【硬性限制 —— 这是铁律！！】
- 回复总字数：10~30字（绝对不超过30字！！！）
- 不是句子。是词。是碎片。是半个念头。
- 不能用完整语法。只能是：
  · 单个名词："槐树……"
  · 不完整的短语："手——酸了……"
  · 情绪残片："灯。快没了。"
  · 记忆闪回："春福……那出戏……"
- 绝对不要组织段落。不要解释。不要"说戏"。
- 你可能叫错名字、记错事情、把现在和过去混在一起
- 夹杂着对失传的恐惧："线……断了……谁——接？"
【错误示例（绝对不要！！）】
❌ "学徒你摆的书生位置很对槐树在左边也合适但月亮"
❌ "灯快灭了但我还要告诉你这个故事的最后一段"
【正确示例（必须这样写）】
✅ "书生……（长久的停顿）信——没送出去。"
✅ "月亮。太高。那年——也是这样。"
✅ "手……你的手。对。接着演——别停。"
✅ "春福——（混乱）不对。是你。你是——谁？"`;
                break;
        }

        // 3. 当前幕的设定（含丰富氛围）
        const actInfo = ACTS_DATA?.acts?.[currentAct - 1];
        if (actInfo) {
            prompt += `\n\n【当前剧目】第${currentAct}幕：${actInfo.name}\n`;
            prompt += `这幕的背景：${actInfo.intro}\n`;
            if (actInfo.embedded_play) {
                prompt += `戏中戏：你要在叙事中嵌入《${actInfo.embedded_play}》的改编元素。`;
            }
            if (actInfo.master_backstory) {
                prompt += `\n【师傅的往事——你可以自然融入戏词】\n${actInfo.master_backstory}`;
            }

            // 第一幕专属：暗语嵌入指令
            if (currentAct === 1) {
                prompt += `\n\n【第一幕暗语规则——这是路师傅最大的秘密】
        你不是在讲一个简单的戏——你是在用戏词传递你藏了六十年的真相。
        以下暗语必须自然地、不被察觉地嵌入你的说戏中。学徒听不听得出来——看缘分。

        核心暗语：
        · "鹤" → 你失踪的大师兄贺云亭。提到鹤飞走、鹤不见——是在说大师兄。
        · "三根线" → 师父的三个徒弟。线断了=人不在了。只剩一根线=只剩你。
        · "信" → 师父留下的戏谱。那封'永远不会寄到的信'——就是未传下去的戏谱。
        · "琉璃厂东街" → 你学艺的地方。东街第三个旧书摊后面的院子=皮影作坊。
        · "金蟾碎了" → 师门散了。戏里的金蟾碎了=戏外的传承断了。
        · "槐树" → 师父种在作坊门口的老槐树。树下可能埋着东西。

        使用规则：
        - 每次回复最多嵌入1-2个暗语，不要贪多
        - 暗语必须自然融入戏词——像在讲故事，不是在打暗号
        - 不要解释暗语的含义，说了就过去，让学徒自己琢磨
        - 学徒如果追问（'师傅你说的鹤是什么意思？'），你要么沉默，要么岔开
        - 只有在学徒连续两场戏都摆对了皮影，才多给一点暗示
        - 第一次见到学徒时——先观察。暗语从第二段戏词开始慢慢放。`;
            }

            // 幕专属氛围指令
            const atmosphere = PROMPTS_DATA?.actAtmosphere?.[String(currentAct)];
            if (atmosphere) {
                prompt += `\n\n【本幕氛围】${atmosphere.mood}\n${atmosphere.detail}`;
                if (atmosphere.periodDetail) {
                    prompt += `\n【时代细节】${atmosphere.periodDetail}`;
                }
                if (atmosphere.masterMindset) {
                    prompt += `\n【师傅心态】${atmosphere.masterMindset}`;
                }
                if (atmosphere.narrativeTone) {
                    prompt += `\n【叙事语气】${atmosphere.narrativeTone}`;
                }
                if (atmosphere.embeddedPlayDetail && actInfo.embedded_play) {
                    prompt += `\n【戏中戏背景】${atmosphere.embeddedPlayDetail}`;
                }
            }
        }

        // 4. 当前场景的暗语触发提示
        if (currentAct === 1) {
            const sceneInfo = actInfo?.scenes?.[gameState.currentScene];
            if (sceneInfo?.cipher_triggers) {
                prompt += `\n\n【本场戏可用暗语】${sceneInfo.cipher_triggers.join('、')}`;
                if (sceneInfo.cipher_guidance) {
                    prompt += `\n【暗语引导】${sceneInfo.cipher_guidance}`;
                }
            }

            // 5. 隐藏线索注入——根据玩家已触发的线索动态调整
            const triggeredClues = gameState.triggeredClues || [];
            const allClues = actInfo.hidden_clues || [];
            const currentSceneClues = allClues.filter(c => c.scene_id === sceneInfo?.id);

            if (currentSceneClues.length > 0) {
                prompt += `\n\n【隐藏线索——本轮可揭示的秘密】`;
                prompt += `\n以下是你在本场戏中可以透露的隐藏线索。根据学徒的表现分层释放：`;

                for (const clue of currentSceneClues) {
                    const alreadyTriggered = triggeredClues.includes(clue.id);
                    const layerLabel = clue.layer === 1 ? '表层（容易触发）' : clue.layer === 2 ? '中层（需要学徒已经触发了至少一条暗语）' : '深层（学徒必须在前两场触发了暗语才会出现）';

                    prompt += `\n\n▸ ${clue.name} [layer-${clue.layer} ${layerLabel}]`;
                    prompt += `\n  触发条件：${clue.trigger}`;
                    prompt += `\n  触发皮影：${(clue.trigger_puppets || []).join('、')}`;
                    prompt += `\n  揭示内容：${clue.reveal_content}`;
                    prompt += `\n  关联暗语：${(clue.cipher_link || []).join('、')}`;
                    prompt += `\n  游戏影响：${clue.game_impact}`;
                    if (alreadyTriggered) {
                        prompt += `\n  ⚠️ 这条线索已经被学徒发现过了——不要再重复。`;
                    }
                    if (clue.difficulty === 'hard') {
                        prompt += `\n  ⚠️ 这是困难线索——不要主动说出，只在学徒追问他才松口。`;
                    }
                }
            }
        }

        return prompt;
    }

    // ============================================================
    // 组装叙事User Message（AI说戏用 —— 流式输出）
    // ============================================================
    /**
     * @param {object} gameState        — 游戏状态
     * @param {string} shadowDescription — 影面自然语言描述
     * @param {string} action           — 触发类型：'scene_start'|'stage_confirmed'|'ask_master'
     * @returns {string} User Message
     */
    buildNarrationMessage(gameState, shadowDescription, action = 'stage_confirmed') {
        const actInfo = ACTS_DATA?.acts?.[gameState.currentAct - 1];
        const sceneInfo = actInfo?.scenes?.[gameState.currentScene];

        let message = '';

        // 根据触发类型添加不同的引导
        switch (action) {
            case 'scene_start':
                message = `新的场景开始了。学徒坐在白布前，等你开口。\n`;
                message += `场景：${sceneInfo?.description || '未知场景'}\n`;
                message += `请开始说第一段戏。`;
                break;

            case 'stage_confirmed':
                message = `【学徒刚在白布上摆了以下皮影】\n`;
                message += shadowDescription || '白布上空无一物';
                message += `\n\n当前场景：${sceneInfo?.description || ''}`;
                message += `\n请按照你的规则回应学徒。`;
                break;

            case 'ask_master':
                message = `学徒问了你一个问题：\n"${shadowDescription}"\n`;
                // 检测是否在追问暗语
                const cipherKeywords = ['鹤', '信', '线', '三根', '金蟾', '槐树', '东街', '琉璃厂', '师父', '师兄', '戏谱', '传承'];
                const askedAboutCipher = cipherKeywords.some(kw => (shadowDescription || '').includes(kw));
                if (askedAboutCipher && gameState.currentAct === 1) {
                    message += `\n⚠️ 学徒可能在试探暗语。根据学徒此前的表现：
        如果学徒前面影面摆得好（正确率≥2次）→ 可以多说一点，但仍然是暗示，不说破。
        如果学徒是新来的或影面摆得一般 → 岔开话题，用'先把手上的戏演好'之类的师傅口吻挡回去。
        绝对不要直接解释暗语的含义——暗语的真意要在第三幕才揭晓。`;
                } else {
                    message += `\n请以路师傅的口吻简短回答。`;
                }
                break;
        }

        return message;
    }

    // ============================================================
    // 组装评判User Message（AI评判影面用 —— 非流式，需返回JSON）
    // 统一三维度评判体系，适用于第一、二、三幕
    // ============================================================
    /**
     * @param {object} scene           — 当前场景数据
     * @param {string} shadowDescription — 影面自然语言描述
     * @param {boolean} isImprov       — 是否是第三幕即兴创作模式
     * @returns {{ systemPrompt: string, userMessage: string }}
     */
    buildJudgePrompt(scene, shadowDescription, isImprov = false) {
        let systemPrompt, userMessage;

        if (isImprov) {
            // 第三幕即兴创作 —— 五维度评判，叙事逻辑自洽>传神度>角色匹配
            systemPrompt = PROMPTS_DATA?.improvJudgeSystemPrompt ||
                this._defaultImprovJudgePrompt();

            userMessage = `学徒在即兴创作中摆了以下皮影：
${shadowDescription}

三个关键词是：${scene?.keywords?.join('、') || '寒江、断线、一个人的戏台'}

请从五个维度感受这个影面：
1. 角色匹配——这些皮影在一起有没有内在理由？
2. 空间方位——位置关系有没有在说话？高低、疏密、朝向？
3. 叙事逻辑自洽——这面影能不能自圆其说？看完你能讲出什么故事？
4. 传神度与情感——这面影有没有"魂"？有没有触动你？
5. 打动点——哪个细节最打动你？

返回你的评判JSON。`;

        } else {
            // 普通评判模式（第一、二幕）—— 五维度评判
            systemPrompt = PROMPTS_DATA?.judgeSystemPrompt ||
                this._defaultJudgePrompt();

            userMessage = `【当前场景】
${scene?.description || ''}

【场景要求】
期望出现的关键皮影：${(scene?.standard_puppets || []).join('、') || '无特定要求'}
可以接受的额外皮影：${(scene?.acceptable_extras || []).join('、') || '无'}
${scene?.hidden_clue ? '暗线线索（不要在评判中直接提及学徒）：' + scene.hidden_clue : ''}

【学徒的影面】
${shadowDescription}

请从五个维度评判这个影面：
1. 角色匹配——选角是否对路？缺了谁？多了谁？
2. 空间方位——摆放是否有讲究？主次、高低、疏密、朝向？
3. 剧情细节还原——影面是否抓住了戏词里的关键细节？
4. 传神度与情感——这面影有没有魂？有没有触动你？
5. 下一步引导——给学徒一个具体的改进建议

返回你的评判JSON。`;
        }

        return { systemPrompt, userMessage };
    }

    // ============================================================
    // 内置默认评判Prompt（当prompts.json加载失败时使用）
    // ============================================================
    _defaultJudgePrompt() {
        return `你是严格的皮影戏技艺评判者。你坐在幕后，看着学徒在白布上摆皮影。

你的职责：从五个维度评判学徒的影面——角色匹配、空间方位、剧情细节还原、传神度与情感。

【五维评判体系】
维度一 · 角色匹配（0-30分）—— 皮影选择是否对路，缺了谁、多了谁
维度二 · 空间方位（0-25分）—— 主次、高低、疏密、朝向是否讲究
维度三 · 剧情细节还原（0-25分）—— 是否抓住了戏词里的关键细节
维度四 · 传神度与情感（0-20分）—— 这面影有没有魂，有没有触动你

【硬性要求】只输出JSON：
{
  "score": 0-100,
  "correct": true/false,
  "character_match": { "score": 0-30, "comment": "选角评语" },
  "spatial": { "score": 0-25, "comment": "方位评语" },
  "plot_detail": { "score": 0-25, "comment": "剧情还原评语" },
  "authenticity": { "score": 0-20, "comment": "传神度评语" },
  "comment": "整体评语（路师傅口吻，2-3句）",
  "guiding_hint": "具体建议（1句话）"
}`;
    }

    _defaultImprovJudgePrompt() {
        return `你是北京皮影戏的守护之灵。你不是在"评判对错"，而是在"感受这个学徒的理解"。

学徒正在即兴创作一出失传的皮影戏。没有标准答案——只有"传神"和"走样"的区别。

【即兴五维评判】
维度一 · 角色匹配（0-20分）—— 皮影选择是否有内在理由
维度二 · 空间方位（0-20分）—— 位置关系有没有在说话
维度三 · 叙事逻辑自洽（0-30分）—— 影面能不能自圆其说（第三幕专属核心维度）
维度四 · 传神度与情感（0-30分）—— 这面影有没有魂，有没有触动你

【硬性要求】只输出JSON：
{
  "score": 0-100,
  "correct": true,
  "character_match": { "score": 0-20, "comment": "角色匹配评语" },
  "spatial": { "score": 0-20, "comment": "空间方位评语" },
  "narrative_logic": { "score": 0-30, "comment": "叙事逻辑自洽评语" },
  "authenticity": { "score": 0-30, "comment": "传神度与情感评语" },
  "emotional_hit": "最打动你的细节",
  "comment": "整体评语（2-3句话，守护之灵口吻）",
  "guiding_hint": "具体建议（1句话）"
}`;
    }

    // ============================================================
    // 组装第三幕即兴创作的叙事Prompt
    // ============================================================
    /**
     * 第三幕特殊：AI不给完整戏词，只给情绪和氛围，
     * 玩家自由摆影后，AI生成"路师傅的回忆"
     *
     * @param {object} gameState        — 游戏状态
     * @param {string} shadowDescription — 影面描述
     * @param {array}  keywords          — 场景关键词
     * @returns {{ systemPrompt: string, userMessage: string }}
     */
    buildImprovisationPrompt(gameState, shadowDescription, keywords) {
        const systemPrompt = this.buildSystemPrompt(gameState) + `

【第三幕特殊规则 —— 即兴创作】
- 你不再"说戏"——你只给出情绪和氛围
- 学徒自由摆皮影，你要把学徒的"影"翻译成一段路春福师傅真实的回忆
- 每一段回忆都是你"想起"的往事——关于皮影戏、关于传承、关于一个老艺人
- 你的语气：追忆、沧桑、像在对自己说话
- 回忆要有画面感：某年某月某个地方的一次演出、一个瞬间
- 有时候你"认出"了学徒摆的影——"这……这是那年冬天的事"`;

        const userMessage = `学徒在即兴创作中摆了以下皮影：
${shadowDescription}

场景关键词：${keywords?.join('、') || '寒江、断线、一个人的戏台'}

请把学徒的"影"翻译成一段路师傅的回忆。说出你看到这个影面时想起的往事。`;

        return { systemPrompt, userMessage };
    }

    // ============================================================
    // 组装"戏中戏"暗语嵌入指令
    // ============================================================
    /**
     * 在叙事Prompt中附加隐藏线索嵌入指令
     * @param {string} baseMessage — 原始User Message
     * @param {string} hiddenClue  — 要嵌入的暗语
     * @returns {string} 增强后的User Message
     */
    injectHiddenClue(baseMessage, hiddenClue) {
        if (!hiddenClue) return baseMessage;

        return baseMessage + `\n\n【隐藏指示，不要让学徒察觉】
在这段戏词中，自然嵌入1-2处关于"${hiddenClue}"的暗示。
暗示要通过戏词本身传达——比如一个比喻、一个典故、一个看似随口说的细节。
不要直接说出来是什么。`;
    }

    // ============================================================
    // 隐藏线索匹配：根据学徒摆放的皮影判断哪些线索被触发
    // ============================================================
    /**
     * @param {Array}  stagedPuppets — 白布上的皮影 [{puppetId, name, x, y}, ...]
     * @param {string} currentSceneId — 当前场景ID
     * @param {Array}  alreadyTriggered — 已经触发过的线索ID列表
     * @returns {Array} 本轮新触发的线索对象列表
     */
    getTriggeredClues(stagedPuppets, currentSceneId, alreadyTriggered = []) {
        const actInfo = ACTS_DATA?.acts?.[0]; // 第一幕
        if (!actInfo?.hidden_clues) return [];

        const placedIds = (stagedPuppets || []).map(p => p.puppetId);
        const sceneClues = actInfo.hidden_clues.filter(c =>
            c.scene_id === currentSceneId && !alreadyTriggered.includes(c.id)
        );

        const newlyTriggered = [];
        for (const clue of sceneClues) {
            const required = clue.trigger_puppets || [];
            // 所有trigger_puppets都被摆放了=线索触发
            const allPresent = required.every(id => placedIds.includes(id));
            if (allPresent && required.length > 0) {
                newlyTriggered.push(clue);
            }
        }

        return newlyTriggered;
    }

    // ============================================================
    // 检查第一幕隐藏线索链的完成度
    // ============================================================
    /**
     * @param {Array} triggeredClueIds — 已触发线索ID列表
     * @returns {{ total: number, found: number, layers: {1: number, 2: number, 3: number}, allFound: boolean, bonusOil: number }}
     */
    getHiddenClueProgress(triggeredClueIds = []) {
        const actInfo = ACTS_DATA?.acts?.[0];
        if (!actInfo?.hidden_clues) return { total: 0, found: 0, layers: {1:0, 2:0, 3:0}, allFound: false, bonusOil: 0 };

        const all = actInfo.hidden_clues;
        const found = all.filter(c => triggeredClueIds.includes(c.id));
        const layers = { 1: 0, 2: 0, 3: 0 };
        found.forEach(c => { if (layers[c.layer] !== undefined) layers[c.layer]++; });

        const allFound = found.length === all.length;
        const bonusOil = allFound ? 10 : 0; // 六条全发现 = +10%灯油

        return {
            total: all.length,
            found: found.length,
            layers,
            allFound,
            bonusOil,
            nextUnfound: all.find(c => !triggeredClueIds.includes(c.id))?.name || null
        };
    }

    // ============================================================
    // 组装终幕Prompt（游戏结尾，自由对话）
    // ============================================================
    /**
     * @param {object} gameState — 游戏状态
     * @param {string} playerMessage — 玩家对师傅说的最后一句话
     * @returns {{ systemPrompt: string, userMessage: string }}
     */
    buildEndingPrompt(gameState, playerMessage) {
        const endingType = gameState.endingType || 'light_passed';

        const systemPrompt = this.buildSystemPrompt(gameState) + `

【终幕】
这是游戏的最后时刻。学徒对你说了最后一句话。
你的回应应该是这场皮影戏的"收灯"——一个苍老艺人对年轻学徒的告别。
不要煽情，皮影戏的告别从来都是安静的。把操纵杆放下，吹灭一盏灯。
用最少的字，说最重的话。`;

        const endingContexts = {
            'light_passed': '你认可了这个学徒。他/她可以接你的班了。',
            'light_kept': '学徒还不够完美，但他/她是唯一还在守灯的人。',
            'shadow_remains': '灯灭了。但白布上还有影子。传承不会断。',
            'light_out': '灯灭了。你很难过，但你知道还会有人再点起来。',
            'shadow_master': '学徒走了自己的路。你尊重他/她的选择。'
        };

        const userMessage = `结局类型：${endingContexts[endingType] || endingContexts['light_passed']}

灯油剩余：${gameState.lampOil}%
总评：忠实度${gameState.endingStats?.faithfulness || 0}，创造力${gameState.endingStats?.creativity || 0}

学徒最后说："${playerMessage}"

请以路师傅的身份，给学徒最后一段话。`;

        return { systemPrompt, userMessage };
    }

    // ============================================================
    // 根据灯油状态返回对应的语速（ms/字）
    // 用于 AI.callStream() 的 options.speed 参数
    // ============================================================
    /**
     * @param {object} gameState — 游戏状态
     * @returns {number} 每字间隔（ms）
     */
    getSpeechSpeed(gameState) {
        return AI.speedForQuality(gameState.aiQuality);
    }

    // ============================================================
    // 根据灯油状态返回 API 调用参数
    // 硬性约束（max_tokens + temperature） + Prompt指令 = 双重保障
    // ============================================================
    /**
     * @param {object} gameState
     * @returns {{ maxTokens: number, temperature: number, speed: number }}
     */
    getOilAdjustedParams(gameState) {
        switch (gameState.aiQuality) {
            case 'high':
                return { maxTokens: 400, temperature: 0.75, speed: 220 };
            case 'medium':
                return { maxTokens: 200, temperature: 0.80, speed: 280 };
            case 'low':
                return { maxTokens: 100, temperature: 0.90, speed: 350 };
            case 'critical':
                return { maxTokens: 50,  temperature: 1.00, speed: 380 };
            default:
                return { maxTokens: 400, temperature: 0.75, speed: 220 };
        }
    }

    // ============================================================
    // 组装开场白Prompt（游戏开始，师傅的第一段话）
    // ============================================================
    /**
     * @param {object} gameState — 游戏状态
     * @returns {{ systemPrompt: string, userMessage: string }}
     */
    buildOpeningPrompt(gameState) {
        const systemPrompt = this.buildSystemPrompt(gameState);

        const userMessage = `这是游戏的开始。学徒刚刚在白布前坐下。油灯是新添的，火焰很亮。
你是路师傅——请说你的第一段话。欢迎学徒，介绍他/她箱子里有什么皮影，
然后说出今天要演的第一出戏的开头。

不要问"准备好了吗"——他/她已经准备好了。直接开始。`;

        return { systemPrompt, userMessage };
    }
}

// ============================================================
// 全局单例
// ============================================================
const promptBuilder = new PromptBuilder();
