// ==========================================
// theater.js — 舞台管理系统
// A组（前端工程师）负责
// ==========================================
// 职责：
//   1. 舞上皮影管理（点击移除、拖动调位）
//   2. 按钮逻辑（确认摆影 → AI评判/离线评判；追问师父 → 扣油+追问）
//   3. 监听事件（油耗尽灭灯、AI叙事逐字显示、评判结果展示）
//   4. 幕间切换（清空舞台）
// ==========================================

(function() {
    'use strict';

    // ===== 缓存 DOM 元素 =====
    const stage       = document.getElementById('stage');
    const btnConfirm  = document.getElementById('btnConfirm');
    const btnAsk      = document.getElementById('btnAsk');
    const dialogueText = document.getElementById('dialogueText');
    const speaker     = document.getElementById('speaker');
    const flame       = document.getElementById('flame');
    const oilBar      = document.getElementById('oilBar');
    const oilText     = document.getElementById('oilText');

    // ===== 拖动舞台上皮影的状态变量 =====
    let draggingStagePuppet = null;
    let dragStartX = 0, dragStartY = 0;
    let puppetStartLeft = 0, puppetStartTop = 0;
    let hasMoved = false;

    // ===== 离线模式检测 =====
    // 如果 API Key 没配置（还是占位符），自动切换到离线模式
    const OFFLINE_MODE = (function() {
        if (typeof API_CONFIG === 'undefined') return true;
        const key = API_CONFIG.API_KEY || '';
        // 占位符或空值 → 离线
        if (!key || key.indexOf('请在这里') !== -1 || key === 'sk-未配置') return true;
        return false;
    })();

    if (OFFLINE_MODE) {
        console.log('[theater] ⚠ 离线模式：API Key 未配置，使用本地评判');
        // 在灯油面板下方显示离线提示
        const infoPanel = document.querySelector('.info-panel');
        if (infoPanel) {
            const badge = document.createElement('div');
            badge.style.cssText = 'margin-top:16px;padding:4px 8px;font-size:11px;color:#c48a3e;border:1px solid #5a2d15;border-radius:2px;letter-spacing:1px;';
            badge.textContent = '离 线 模 式';
            infoPanel.appendChild(badge);
        }
    }

    // ============================================================
    // 1. 舞上皮影：点击移除 / 拖动移位
    // ============================================================

    stage.addEventListener('mousedown', function(e) {
        const puppet = e.target.closest('.stage-puppet');
        if (!puppet) return;

        draggingStagePuppet = puppet;
        hasMoved = false;

        const rect = puppet.getBoundingClientRect();
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        puppetStartLeft = parseInt(puppet.style.left) || 0;
        puppetStartTop  = parseInt(puppet.style.top)  || 0;

        e.preventDefault();
    });

    document.addEventListener('mousemove', function(e) {
        if (!draggingStagePuppet) return;

        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;

        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
            hasMoved = true;
            draggingStagePuppet.style.cursor = 'grabbing';
        }

        if (hasMoved) {
            const newLeft = puppetStartLeft + dx;
            const newTop  = puppetStartTop  + dy;
            draggingStagePuppet.style.left = newLeft + 'px';
            draggingStagePuppet.style.top  = newTop  + 'px';
        }
    });

    document.addEventListener('mouseup', function(e) {
        if (!draggingStagePuppet) return;

        const puppet = draggingStagePuppet;
        puppet.style.cursor = 'grab';
        draggingStagePuppet = null;

        if (!hasMoved) {
            removeStagePuppet(puppet);
        } else {
            // 在舞台上拖动调整位置 → 扣 1 油
            EventBus.emit('puppet_moved', { id: puppet.dataset.puppet });
        }
    });

    function removeStagePuppet(puppetEl) {
        const puppetId = puppetEl.dataset.puppet;
        const idx = gameState.stagedPuppets.indexOf(puppetId);
        if (idx > -1) gameState.stagedPuppets.splice(idx, 1);
        puppetEl.remove();
        EventBus.emit('puppet_removed', { id: puppetId });
        if (stage.querySelectorAll('.stage-puppet').length === 0) {
            const hint = stage.querySelector('.stage-hint');
            if (hint) hint.style.display = '';
        }
    }

    // ============================================================
    // 2. "确认摆影" 按钮
    // ============================================================
    btnConfirm.addEventListener('click', function() {
        const stagedPuppets = collectStagedPuppets();

        if (stagedPuppets.length === 0) {
            speaker.textContent = '路师傅';
            typewriter(dialogueText, '白布上还空着呢——先摆几个影儿。');
            return;
        }

        btnConfirm.disabled = true;
        btnAsk.disabled = true;

        speaker.textContent = '路师傅';
        dialogueText.textContent = '（师傅凑近白布，眯着眼细细端详……）';

        EventBus.emit('stage_confirmed', { puppets: stagedPuppets });

        const sceneId = getCurrentSceneId();
        const isImprov = (gameState.currentAct === 3);

        if (OFFLINE_MODE) {
            // ===== 离线模式：本地评判 =====
            setTimeout(function() {
                const result = ShadowJudge.quickJudge(stagedPuppets, sceneId);
                // 附加场景化评语
                result.comment = buildOfflineComment(stagedPuppets, sceneId, result);
                result.guiding_hint = buildOfflineHint(stagedPuppets, sceneId);
                displayJudgeResult(result);

                // 通知流程控制器
                emitSceneJudged(stagedPuppets, sceneId, result);

                btnConfirm.disabled = false;
                btnAsk.disabled = false;
            }, 800);
        } else {
            // ===== 在线模式：AI 评判 =====
            if (window.ShadowJudge) {
                ShadowJudge.judge(stagedPuppets, sceneId, isImprov)
                    .then(function(result) {
                        displayJudgeResult(result);
                        emitSceneJudged(stagedPuppets, sceneId, result);
                    })
                    .catch(function(err) {
                        console.error('[theater] AI评判失败', err);
                        // 失败时回退到本地评判
                        const result = ShadowJudge.quickJudge(stagedPuppets, sceneId);
                        result.comment = '（灯影恍惚，师傅没看清……）\n\n' + buildOfflineComment(stagedPuppets, sceneId, result);
                        displayJudgeResult(result);
                        emitSceneJudged(stagedPuppets, sceneId, result);
                    })
                    .finally(function() {
                        btnConfirm.disabled = false;
                        btnAsk.disabled = false;
                    });
            } else {
                dialogueText.textContent = '（师傅看了看，点了点头。）';
                btnConfirm.disabled = false;
                btnAsk.disabled = false;
            }
        }
    });

    // ============================================================
    // 3. "追问师父" 按钮
    // ============================================================
    btnAsk.addEventListener('click', function() {
        EventBus.emit('ask_master', {
            puppets: collectStagedPuppets(),
            sceneId: getCurrentSceneId()
        });

        speaker.textContent = '路师傅';

        if (OFFLINE_MODE) {
            // 离线模式：从 acts.json 取场景提示
            const hint = buildOfflineHint(collectStagedPuppets(), getCurrentSceneId());
            typewriter(dialogueText, hint, 45);
        } else {
            typewriter(dialogueText, '（你向师傅请教——师傅沉吟片刻……）', 40);
        }
    });

    // ============================================================
    // 4. 离线模式：生成本地评语
    // ============================================================
    function buildOfflineComment(stagedPuppets, sceneId, judgeResult) {
        const scene = ShadowJudge._getSceneData(sceneId);
        if (!scene) return '师傅看了看书生，又看了看月亮。';

        const placedIds = stagedPuppets.map(function(p) { return p.puppetId; });
        const required = scene.standard_puppets || [];
        const extras = scene.acceptable_extras || [];
        const covered = required.filter(function(id) { return placedIds.indexOf(id) !== -1; });
        const coverage = required.length > 0 ? covered.length / required.length : 1;
        const missing = required.filter(function(id) { return placedIds.indexOf(id) === -1; });
        const unexpected = placedIds.filter(function(id) { return required.indexOf(id) === -1 && extras.indexOf(id) === -1; });

        // 场景描述
        const sceneDesc = scene.description ? scene.description.substring(0, 40) + '……' : '';

        var text = '';

        if (coverage >= 0.8) {
            // 几乎全对
            text = '嗯——' + scene.name + '，就是这个意思。\n';
            text += '影面里该有的，都有了。';

            // 检查是否有隐藏线索触发
            if (scene.hidden_clue_ids && scene.hidden_clue_ids.length > 0) {
                var clues = ACTS_DATA.acts[gameState.currentAct - 1].hidden_clues || [];
                for (var i = 0; i < clues.length; i++) {
                    var clue = clues[i];
                    if (clue.scene_id !== sceneId) continue;
                    var triggerPuppets = clue.trigger_puppets || [];
                    var allTriggered = triggerPuppets.every(function(id) { return placedIds.indexOf(id) !== -1; });
                    if (allTriggered && triggerPuppets.length > 0) {
                        text += '\n\n' + clue.reveal_content;
                        break;
                    }
                }
            }
        } else if (coverage >= 0.5) {
            // 部分正确
            text = '差了点意思。\n';
            if (missing.length > 0) {
                text += '还缺——' + missing.map(getPuppetName).join('、') + '。\n';
            }
            text += '\n' + (scene.cipher_guidance || '再想想，这出戏还差什么？');
        } else {
            // 大部分不对
            text = '不对路。\n';
            text += '这出戏讲的是"' + scene.name + '"——\n';
            text += sceneDesc + '\n\n';
            if (missing.length > 0) {
                text += '得有：' + missing.map(getPuppetName).join('、') + '。';
            }
            if (unexpected.length > 0) {
                text += '\n（' + unexpected.map(getPuppetName).join('、') + '——这出戏里用不上。）';
            }
        }

        return text;
    }

    // ============================================================
    // 5. 离线模式：生成本地追问提示
    // ============================================================
    function buildOfflineHint(stagedPuppets, sceneId) {
        const scene = ShadowJudge._getSceneData(sceneId);
        if (!scene) return '师傅没说话，手指敲了敲操纵杆。';

        const placedIds = stagedPuppets.map(function(p) { return p.puppetId; });
        const required = scene.standard_puppets || [];

        // 如果有 cipher_guidance，直接用
        if (scene.cipher_guidance) {
            // 根据已摆放的皮影，选择最相关的提示
            var guidance = scene.cipher_guidance;

            // 检查每个触发条件
            if (placedIds.indexOf('tree') !== -1) {
                return '路师傅说：我认得一棵槐树，在东街第三个书摊后面。那棵树——比我还老。';
            }
            if (placedIds.indexOf('letter') !== -1) {
                return '路师傅低声说：那封信——写了三年。不是我写的，是我师父。颜体，一笔一画。';
            }
            if (placedIds.indexOf('elder') !== -1 && placedIds.indexOf('letter') !== -1) {
                return '路师傅停了一下：这根杆——本来有三根的。我师父当年……算了。';
            }
            if (placedIds.indexOf('frog') !== -1 && placedIds.indexOf('elder') !== -1) {
                return '路师傅的声音变了：金蟾碎了。戏里是这么写的——但戏外——也碎了。';
            }
            if (placedIds.indexOf('scholar') !== -1) {
                return '路师傅说：书生等的那封信——不是情书。比命还重的东西。';
            }

            // 没有特殊触发 → 给通用提示
            var missing = required.filter(function(id) { return placedIds.indexOf(id) === -1; });
            if (missing.length > 0) {
                return '路师傅眯着眼看了看白布：还差点东西。你觉得——' + missing.map(getPuppetName).join('、') + '该摆在哪？';
            }

            return '路师傅沉吟片刻：' + guidance;
        }

        // 没有 cipher_guidance 的场景
        var missing = required.filter(function(id) { return placedIds.indexOf(id) === -1; });
        if (missing.length > 0) {
            return '路师傅说：这出戏，光有这些不够。还缺' + missing.map(getPuppetName).join('、') + '。';
        }

        return '路师傅点了点头：影面齐了。不过——摆的位置，还要再想想。';
    }

    // ============================================================
    // 6. 收集舞台皮影信息
    // ============================================================
    function collectStagedPuppets() {
        const puppets = stage.querySelectorAll('.stage-puppet');
        const stageRect = stage.getBoundingClientRect();

        return Array.from(puppets).map(function(p) {
            const id = p.dataset.puppet;
            const left = parseInt(p.style.left) || 0;
            const top  = parseInt(p.style.top)  || 0;
            const w = parseInt(p.style.width)   || 80;
            const h = parseInt(p.style.height)  || 110;

            const x = stageRect.width  > 0 ? (left + w / 2) / stageRect.width  : 0.5;
            const y = stageRect.height > 0 ? (top  + h / 2) / stageRect.height : 0.5;

            return {
                puppetId: id,
                name: getPuppetName(id),
                x: Math.max(0, Math.min(1, x)),
                y: Math.max(0, Math.min(1, y))
            };
        });
    }

    function getPuppetName(id) {
        const card = document.querySelector('.puppet-card[data-puppet="' + id + '"]');
        if (card) {
            const nameEl = card.querySelector('.puppet-name');
            if (nameEl) return nameEl.textContent.trim();
        }
        const names = {
            scholar: '书生', tree: '槐树', moon: '月亮',
            elder: '老者', letter: '信', frog: '金蟾', lamp: '灯',
            demon: '白骨精', monkey: '孙悟空', bamboo: '竹子',
            master: '师傅', shouxing: '老寿星', tudi: '土地公',
            lang: '狼', he: '鹤', yu: '鱼', dao: '刀'
        };
        return names[id] || id;
    }

    function getCurrentSceneId() {
        return 'act' + gameState.currentAct + '_scene' + (gameState.currentScene + 1);
    }

    // ===== 辅助：计算皮影覆盖率 =====
    function computeCoverage(stagedPuppets, sceneId) {
        const scene = ShadowJudge._getSceneData(sceneId);
        if (!scene || !scene.standard_puppets || scene.standard_puppets.length === 0) return 1;
        const placedIds = stagedPuppets.map(function(p) { return p.puppetId; });
        const required = scene.standard_puppets || [];
        const covered = required.filter(function(id) { return placedIds.indexOf(id) !== -1; });
        return covered.length / required.length;
    }

    // ===== 辅助：发送场景评判完成事件 =====
    function emitSceneJudged(stagedPuppets, sceneId, result) {
        EventBus.emit('scene_judged', {
            score: result.score || 0,
            correct: result.correct,
            coverage: computeCoverage(stagedPuppets, sceneId),
            puppets: stagedPuppets,
            sceneId: sceneId
        });
    }

    // ============================================================
    // 7. 显示评判结果
    // ============================================================
    function displayJudgeResult(result) {
        speaker.textContent = '路师傅';

        let text = '';
        if (result.comment) text += result.comment;
        if (result.guiding_hint) text += '\n\n' + result.guiding_hint;
        if (!text) text = '……（师傅看了看，没说话。）';

        typewriter(dialogueText, text, 55);
    }

    // ============================================================
    // 8. 逐字显示（打字机效果）
    // ============================================================
    let typewriterTimer = null;

    function typewriter(el, text, speed) {
        speed = speed || 50;

        if (typewriterTimer) {
            clearInterval(typewriterTimer);
            typewriterTimer = null;
        }

        el.textContent = '';
        el.innerHTML = '';

        let i = 0;
        typewriterTimer = setInterval(function() {
            if (i < text.length) {
                const ch = text[i];
                if (ch === '\n') {
                    el.innerHTML += '<br>';
                } else {
                    el.innerHTML += ch;
                }
                i++;
            } else {
                clearInterval(typewriterTimer);
                typewriterTimer = null;
            }
        }, speed);
    }

    // ============================================================
    // 9. 清空舞台
    // ============================================================
    function clearStage() {
        const puppets = stage.querySelectorAll('.stage-puppet');
        puppets.forEach(function(p) { p.remove(); });
        gameState.stagedPuppets = [];

        const hint = stage.querySelector('.stage-hint');
        if (hint) hint.style.display = '';

        console.log('[theater] 舞台已清空');
    }

    // ============================================================
    // 10. 监听事件
    // ============================================================

    EventBus.on('oil_depleted', function() {
        stage.classList.add('stage-dark');
        if (flame) flame.classList.add('flame-gone');

        speaker.textContent = '路师傅';
        if (typewriterTimer) clearInterval(typewriterTimer);
        dialogueText.textContent = '灯——灭了。';

        btnConfirm.disabled = true;
        btnAsk.disabled = true;
    });

    EventBus.on('narration_chunk', function(data) {
        if (data.speaker) speaker.textContent = data.speaker;
        if (data.text) {
            typewriter(dialogueText, data.text, data.speed || 50);
        }
    });

    EventBus.on('judge_result', function(result) {
        if (!btnConfirm.disabled) {
            displayJudgeResult(result);
        }
    });

    EventBus.on('countdown_tick', function(data) {
        let countdownEl = document.getElementById('countdownDisplay');
        if (!countdownEl) {
            countdownEl = document.createElement('div');
            countdownEl.id = 'countdownDisplay';
            countdownEl.style.cssText =
                'position:absolute;top:10px;right:20px;' +
                'color:#e8c97a;font-size:20px;font-weight:bold;' +
                'text-shadow:0 0 10px rgba(232,180,90,0.5);z-index:100;';
            document.body.appendChild(countdownEl);
        }
        countdownEl.textContent = '⏱ ' + data.time + ' 秒';
        if (data.time <= 5) {
            countdownEl.style.color = '#ff4444';
        }
    });

    EventBus.on('countdown_expired', function() {
        const countdownEl = document.getElementById('countdownDisplay');
        if (countdownEl) countdownEl.remove();

        // ★ 加固：场景守卫
        // 倒计时只在第二幕 Scene2（影速对决）启用。
        // 若定时器泄漏到其它场景才触发本事件，必须忽略，
        // 否则会在第三幕误判灭灯、锁死按钮。
        const isTimeLimitedScene =
            gameState.currentAct === 2 && gameState.currentScene === 1;
        if (!isTimeLimitedScene) {
            console.warn('[theater] countdown_expired 触发但不在限时场景，已忽略（疑似定时器泄漏）');
            return;
        }

        // 强制油耗尽：归零 + 刷新UI + 触发灭灯效果
        gameState.lampOil = 0;
        if (typeof updateOilUI === 'function') updateOilUI();
        if (oilText) oilText.textContent = '0 / 100';
        if (oilBar) oilBar.style.width = '0%';

        // 灭灯视觉
        stage.classList.add('stage-dark');
        if (flame) flame.classList.add('flame-gone');

        speaker.textContent = '路师傅';
        typewriter(dialogueText, '时间到了——灯油耗尽了。\n\n白布上一片漆黑……什么也看不见了。', 50);

        btnConfirm.disabled = true;
        btnAsk.disabled = true;

        // 通知流程控制器：倒计时耗尽
        EventBus.emit('oil_depleted', { reason: 'countdown' });
    });

    EventBus.on('act_intermission', function() {
        clearStage();
        stage.classList.remove('stage-dark');
        if (flame) flame.classList.remove('flame-gone');
        btnConfirm.disabled = false;
        btnAsk.disabled = false;
    });

    EventBus.on('save_loaded', function(data) {
        if (data && data.state) {
            if (oilText) oilText.textContent = data.state.lampOil + ' / 100';
            if (oilBar)  oilBar.style.width  = data.state.lampOil + '%';
        }
    });

    // ============================================================
    // 11. 全局暴露
    // ============================================================
    window.TheaterSystem = {
        clearStage: clearStage,
        collectStagedPuppets: collectStagedPuppets,
        getCurrentSceneId: getCurrentSceneId,
        typewriter: typewriter,
        isOfflineMode: function() { return OFFLINE_MODE; }
    };

    console.log('[theater] 舞台管理系统就绪' + (OFFLINE_MODE ? '（离线模式）' : '（在线模式）'));

})();
