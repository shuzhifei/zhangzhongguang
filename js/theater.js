// ==========================================
// theater.js — 舞台管理系统
// A组（前端工程师）负责
// ==========================================
// 职责：
//   1. 舞上皮影管理（点击移除、拖动调位）
//   2. 按钮逻辑（确认摆影 → AI评判；追问师父 → 扣油+追问）
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
    let hasMoved = false;  // 区分"点击移除"和"拖动移位"

    // ============================================================
    // 1. 舞上皮影：点击移除 / 拖动移位
    // ============================================================

    // 在舞台上按下鼠标 → 准备拖动（也可能是点击移除）
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

        e.preventDefault();  // 阻止默认行为，防止选中文字
    });

    // 鼠标移动 → 如果正在拖舞台皮影，就跟着移
    document.addEventListener('mousemove', function(e) {
        if (!draggingStagePuppet) return;

        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;

        // 移动超过5像素才算"拖动"，否则当作"点击"
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

    // 松手 → 判断是点击移除还是拖动结束
    document.addEventListener('mouseup', function(e) {
        if (!draggingStagePuppet) return;

        const puppet = draggingStagePuppet;
        puppet.style.cursor = 'grab';
        draggingStagePuppet = null;

        // 如果没移动过 → 点击移除
        if (!hasMoved) {
            removeStagePuppet(puppet);
        }
    });

    // 移除舞台上的皮影
    function removeStagePuppet(puppetEl) {
        const puppetId = puppetEl.dataset.puppet;

        // 从 gameState 中移除
        const idx = gameState.stagedPuppets.indexOf(puppetId);
        if (idx > -1) gameState.stagedPuppets.splice(idx, 1);

        // 从 DOM 中移除
        puppetEl.remove();

        // 通知其他模块（B 扣少量油）
        EventBus.emit('puppet_removed', { id: puppetId });

        // 如果舞台上没皮影了，重新显示提示
        if (stage.querySelectorAll('.stage-puppet').length === 0) {
            const hint = stage.querySelector('.stage-hint');
            if (hint) hint.style.display = '';
        }
    }

    // ============================================================
    // 2. "确认摆影" 按钮 → 触发 AI 评判
    // ============================================================
    btnConfirm.addEventListener('click', function() {
        // 收集舞台上所有皮影
        const stagedPuppets = collectStagedPuppets();

        if (stagedPuppets.length === 0) {
            speaker.textContent = '路师傅';
            typewriter(dialogueText, '白布上还空着呢——先摆几个影儿。');
            return;
        }

        // 禁用按钮，防止重复点击
        btnConfirm.disabled = true;
        btnAsk.disabled = true;

        speaker.textContent = '路师傅';
        dialogueText.textContent = '（师傅凑近白布，眯着眼细细端详……）';

        // 通知其他模块：玩家确认了影面
        EventBus.emit('stage_confirmed', { puppets: stagedPuppets });

        // 调用 AI 评判
        const sceneId = getCurrentSceneId();
        const isImprov = (gameState.currentAct === 3);

        if (window.ShadowJudge) {
            ShadowJudge.judge(stagedPuppets, sceneId, isImprov)
                .then(function(result) {
                    displayJudgeResult(result);
                })
                .catch(function(err) {
                    console.error('[theater] AI评判失败', err);
                    dialogueText.textContent = '（灯影恍惚，师傅没看清楚……再试试。）';
                })
                .finally(function() {
                    btnConfirm.disabled = false;
                    btnAsk.disabled = false;
                });
        } else {
            // ShadowJudge 未加载，用本地快速评判
            dialogueText.textContent = '（师傅看了看，点了点头。）';
            btnConfirm.disabled = false;
            btnAsk.disabled = false;
        }
    });

    // ============================================================
    // 3. "追问师父" 按钮 → 扣油 + 触发追问
    // ============================================================
    btnAsk.addEventListener('click', function() {
        // 通知 B 扣油、C 追问 AI
        EventBus.emit('ask_master', {
            puppets: collectStagedPuppets(),
            sceneId: getCurrentSceneId()
        });

        speaker.textContent = '路师傅';
        typewriter(dialogueText, '（你向师傅请教——师傅沉吟片刻……）', 40);
    });

    // ============================================================
    // 4. 收集舞台皮影信息（传给 AI 评判用）
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

            // 坐标转为 0~1 的比例值（shadow-judge.js 需要这个格式）
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

    // 根据 puppetId 获取中文名
    function getPuppetName(id) {
        const card = document.querySelector('.puppet-card[data-puppet="' + id + '"]');
        if (card) {
            const nameEl = card.querySelector('.puppet-name');
            if (nameEl) return nameEl.textContent.trim();
        }
        // 兜底
        const names = {
            shouxing: '老寿星', tudi: '土地公', lang: '狼',
            he: '鹤', yu: '鱼', dao: '刀',
            scholar: '书生', elder: '老者', tree: '槐树',
            moon: '月亮', letter: '信', frog: '金蟾',
            lamp: '灯', master: '师傅', demon: '白骨精',
            monkey: '孙悟空', bamboo: '竹子'
        };
        return names[id] || id;
    }

    // 获取当前场景 ID（格式：act1_scene1）
    function getCurrentSceneId() {
        return 'act' + gameState.currentAct + '_scene' + (gameState.currentScene + 1);
    }

    // ============================================================
    // 5. 显示 AI 评判结果
    // ============================================================
    function displayJudgeResult(result) {
        speaker.textContent = '路师傅';

        let text = '';

        // 评语
        if (result.comment) {
            text += result.comment;
        }

        // 引路提示
        if (result.guiding_hint) {
            text += '\n\n' + result.guiding_hint;
        }

        // 如果都没有，给个兜底
        if (!text) {
            text = '……（师傅看了看，没说话。）';
        }

        typewriter(dialogueText, text, 60);
    }

    // ============================================================
    // 6. 逐字显示（打字机效果）
    // ============================================================
    let typewriterTimer = null;

    function typewriter(el, text, speed) {
        speed = speed || 50;

        // 清掉上一个打字机
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
                // 遇到换行符 → 插入 <br>
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
    // 7. 清空舞台（幕间切换用）
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
    // 8. 监听其他模块的事件
    // ============================================================

    // --- 油耗尽 → 幕布变暗 + 灭灯 ---
    EventBus.on('oil_depleted', function() {
        stage.classList.add('stage-dark');
        if (flame) flame.classList.add('flame-gone');

        speaker.textContent = '路师傅';
        if (typewriterTimer) clearInterval(typewriterTimer);
        dialogueText.textContent = '灯——灭了。';

        // 禁用按钮
        btnConfirm.disabled = true;
        btnAsk.disabled = true;
    });

    // --- AI 叙事文字 → 逐字显示 ---
    EventBus.on('narration_chunk', function(data) {
        if (data.speaker) speaker.textContent = data.speaker;
        if (data.text) {
            typewriter(dialogueText, data.text, data.speed || 50);
        }
    });

    // --- 评判结果 → 显示（如果 confirm 按钮没显示的话，兜底） ---
    EventBus.on('judge_result', function(result) {
        // 只在按钮没禁用时才显示（避免和 confirm 流程重复）
        if (!btnConfirm.disabled) {
            displayJudgeResult(result);
        }
    });

    // --- 倒计时（第二幕限时） ---
    EventBus.on('countdown_tick', function(data) {
        // 在对话区顶部显示倒计时
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

        // 最后5秒变红
        if (data.time <= 5) {
            countdownEl.style.color = '#ff4444';
        }
    });

    // --- 倒计时结束 ---
    EventBus.on('countdown_expired', function() {
        const countdownEl = document.getElementById('countdownDisplay');
        if (countdownEl) countdownEl.remove();

        speaker.textContent = '路师傅';
        dialogueText.textContent = '时间到了——灯油烧完了。';

        btnConfirm.disabled = true;
        btnAsk.disabled = true;
    });

    // --- 幕间切换 → 清空舞台 ---
    EventBus.on('act_intermission', function() {
        clearStage();

        // 恢复舞台亮度（如果之前暗了）
        stage.classList.remove('stage-dark');
        if (flame) flame.classList.remove('flame-gone');

        // 恢复按钮
        btnConfirm.disabled = false;
        btnAsk.disabled = false;
    });

    // --- 存档加载 → 恢复 UI ---
    EventBus.on('save_loaded', function(data) {
        if (data && data.state) {
            // 刷新灯油显示
            if (oilText) oilText.textContent = data.state.lampOil + ' / 100';
            if (oilBar)  oilBar.style.width  = data.state.lampOil + '%';
        }
    });

    // ============================================================
    // 9. 全局暴露（供其他模块调用）
    // ============================================================
    window.TheaterSystem = {
        clearStage: clearStage,
        collectStagedPuppets: collectStagedPuppets,
        getCurrentSceneId: getCurrentSceneId,
        typewriter: typewriter
    };

    console.log('[theater] 舞台管理系统就绪');

})();
