// ==========================================
// main.js — 游戏流程控制器
// A组（前端工程师）负责
// ==========================================
// 职责：
//   1. 页面加载 → 显示"第一幕"Intro → 启动第一场
//   2. 监听 scene_judged → 判断场景通过 → 推进到下一场
//   3. 同一幕内场景切换
//   4. 幕间切换（清场+回油+显示下一幕Intro）
//   5. 第二幕限时场景 → 启动倒计时
//   6. 第三幕即兴 → 宽松通过条件
//   7. 三幕结束 → 判定结局 → 展示结局，锁定UI
// ==========================================

(function() {
    'use strict';

    // ===== 状态 =====
    let sceneConfirmCount = 0;
    let scenePassed = false;
    let advancing = false;

    // ============================================================
    // 工具：重置场景状态（每次进入新场景都必须调用！）
    // ============================================================
    function resetSceneState() {
        sceneConfirmCount = 0;
        scenePassed = false;
        advancing = false;
        console.log('[main] 场景状态已重置');
    }

    // ============================================================
    // 工具：更新页面标题和场景信息
    // ============================================================
    function updateHeader() {
        var header = document.querySelector('.header');
        var sceneInfo = document.getElementById('sceneInfo');
        var actNum = gameState.currentAct;
        var sceneNum = gameState.currentScene + 1;

        if (header && ACTS_DATA && ACTS_DATA.acts) {
            var actData = ACTS_DATA.acts[actNum - 1];
            if (actData) {
                header.textContent = '掌 中 光 · 第 ' + getActNum(actNum) + ' 幕 — ' + actData.name;
            }
        }

        if (sceneInfo && ACTS_DATA && ACTS_DATA.acts) {
            var actData = ACTS_DATA.acts[actNum - 1];
            if (actData && actData.scenes && actData.scenes[gameState.currentScene]) {
                sceneInfo.textContent = '第' + sceneNum + '场 · ' + actData.scenes[gameState.currentScene].name;
            }
        }
    }

    // ============================================================
    // 入口：DOM就绪后启动
    // ============================================================
    function init() {
        try {
            console.log('[main] 游戏流程控制器就绪');
            console.log('[main] 第' + gameState.currentAct + '幕 第' + (gameState.currentScene + 1) + '场');

            // 安全检查：确保数据已加载
            if (typeof ACTS_DATA === 'undefined') {
                console.error('[main] 致命错误：ACTS_DATA 未定义！检查 data/acts.json 是否正常加载');
                showDialogue('路师傅', '（数据加载失败。请刷新页面重试。）');
                return;
            }

            // 初始加载：显示第一幕皮影
            updatePuppetCards(gameState.currentAct);
            updateHeader();

            // 显示第一幕Intro
            var act1 = ACTS_DATA.acts[0];
            showActIntro(act1, function() {
                setTimeout(function() { startCurrentScene(); }, 1000);
            });
        } catch(e) {
            console.error('[main] 初始化崩溃:', e);
            showDialogue('系统', '游戏初始化出错：（' + e.message + '）。请刷新页面。');
        }
    }

    // ============================================================
    // 显示幕的Intro（读完后回调）
    // ============================================================
    function showActIntro(act, callback) {
        EventBus.emit('narration_chunk', {
            speaker: '路师傅',
            text: act.intro,
            speed: 38
        });

        // 估算朗读时间：中文约 3字/秒，最少4秒
        var ms = Math.max(4000, Math.ceil(act.intro.length / 3 * 1000) + 1000);
        if (callback) setTimeout(callback, ms);
    }

    // ============================================================
    // 开始当前场景
    // ============================================================
    function startCurrentScene() {
        try {
            // ★ 关键修复：每次进入新场景都重置标志位！
            resetSceneState();

            // ★ 加固：通知灯油系统停止上一场景遗留的倒计时定时器
            //   （防止第二幕Scene2的计时器泄漏到第三幕持续扣油）
            //   若 lamp.js 未实现该监听则静默忽略，不影响其他逻辑
            EventBus.emit('countdown_stop_request');

            var act = ACTS_DATA.acts[gameState.currentAct - 1];
            var scene = act.scenes[gameState.currentScene];

            // 更新标题和场景信息
            updateHeader();

            // 清空舞台
            if (window.TheaterSystem && TheaterSystem.clearStage) {
                TheaterSystem.clearStage();
            }

            // 确保按钮可用
            var btnC = document.getElementById('btnConfirm');
            var btnA = document.getElementById('btnAsk');
            if (btnC) btnC.disabled = false;
            if (btnA) btnA.disabled = false;

            // 显示场景标题+描述
            EventBus.emit('narration_chunk', {
                speaker: '路师傅',
                text: '「' + scene.name + '」\n\n' + scene.description,
                speed: 35
            });

            // 第二幕场景2：限时倒计时（等描述读完再启动）
            if (scene.time_limit && window.LampSystem) {
                setTimeout(function() {
                    console.log('[main] 限时：' + scene.time_limit + '秒倒计时启动');
                    LampSystem.startCountdown();
                }, 5000);
            }

            // 第三幕即兴：特殊提示
            if (scene.is_improvisation && scene.keywords) {
                setTimeout(function() {
                    EventBus.emit('narration_chunk', {
                        speaker: '路师傅',
                        text: '三个词——' + scene.keywords.join('、') + '。\n\n剩下的——该你了。',
                        speed: 40
                    });
                }, 6000);
            }

            console.log('[main] 场景开始：' + scene.id + ' | ' + scene.name);
        } catch(e) {
            console.error('[main] startCurrentScene 崩溃:', e);
            showDialogue('路师傅', '（……灯晃了一下。刚才说到哪了？——请刷新页面。）');
        }
    }

    // ============================================================
    // 监听评判结果 → 决定是否通过
    // ============================================================
    EventBus.on('scene_judged', function(data) {
        try {
            if (scenePassed || advancing) {
                console.log('[main] 场景已通过/推进中，跳过（这是正常的，不要慌）');
                return;
            }

            sceneConfirmCount++;

            var coverage = data.coverage || 0;
            var score = data.score || 0;

            // 第三幕即兴场景：宽松标准
            var act = ACTS_DATA.acts[gameState.currentAct - 1];
            var scene = act.scenes[gameState.currentScene];
            var isImprov = scene.is_improvisation === true;

            console.log('[main] 评判 #' + sceneConfirmCount +
                ' | 覆盖率=' + (coverage * 100).toFixed(0) + '%' +
                ' | 得分=' + score +
                (isImprov ? ' | 即兴模式' : ''));

            // 通过条件：
            //   即兴场：第一次确认就通过
            //   普通场：覆盖率≥80% 或 AI评分≥60 或 第3次确认强制通过
            var pass;
            if (isImprov) {
                pass = sceneConfirmCount >= 1;
            } else {
                pass = (coverage >= 0.8) || (score >= 60) || (sceneConfirmCount >= 3);
            }

            if (pass) {
                scenePassed = true;
                advancing = true;

                // ★ 修复：通过判定时累加结局打分，否则三幕版永远判定为"灯灭"
                accumulateEndingStats(data);

                // 多次失败后给台阶
                if (!isImprov && sceneConfirmCount >= 3 && coverage < 0.6) {
                    setTimeout(function() {
                        EventBus.emit('narration_chunk', {
                            speaker: '路师傅',
                            text: '……也罢。影子这东西——有时候歪一点，反而有味道。走吧，下一场。',
                            speed: 40
                        });
                    }, 2000);
                }

                // 延迟推进
                var delay = isImprov ? 2500 : 3500;
                setTimeout(function() {
                    advanceScene();
                }, delay);
            }
        } catch(e) {
            console.error('[main] scene_judged 处理崩溃:', e);
            // 出错时手动重置，让玩家可以再试一次
            scenePassed = false;
            advancing = false;
            var btnC = document.getElementById('btnConfirm');
            var btnA = document.getElementById('btnAsk');
            if (btnC) btnC.disabled = false;
            if (btnA) btnA.disabled = false;
        }
    });

    // ============================================================
    // 推进：下一场 / 下一幕 / 结局
    // ============================================================
    function advanceScene() {
        try {
            // ★ 加固：推进场景前也尝试停止遗留的倒计时（防御性）
            EventBus.emit('countdown_stop_request');

            var act = ACTS_DATA.acts[gameState.currentAct - 1];
            var totalScenes = act.scenes.length;

            if (gameState.currentScene + 1 < totalScenes) {
                // → 下一场（同一幕）
                gameState.currentScene++;

                // 简短过渡
                EventBus.emit('narration_chunk', {
                    speaker: '',
                    text: '——',
                    speed: 300
                });

                setTimeout(function() {
                    startCurrentScene();
                }, 1200);

            } else {
                // → 当前幕结束
                if (gameState.currentAct < 3) {
                    advanceToNextAct();
                } else {
                    endGame();
                }
            }
        } catch(e) {
            console.error('[main] advanceScene 崩溃:', e);
            // 重置以便玩家可以重试
            resetSceneState();
        }
    }

    // ============================================================
    // 幕间切换
    // ============================================================
    function advanceToNextAct() {
        try {
            var prevActNum = gameState.currentAct;
            gameState.currentAct++;
            gameState.currentScene = 0;

            console.log('[main] 第' + prevActNum + '幕结束 → 进入第' + gameState.currentAct + '幕');

            // lamp.js 监听 → 回油到80；theater.js 监听 → 清空舞台/恢复亮度
            EventBus.emit('act_intermission');

            // 切换皮影箱角色
            updatePuppetCards(gameState.currentAct);

            // 更新标题
            updateHeader();

            var nextAct = ACTS_DATA.acts[gameState.currentAct - 1];

            // 幕间过渡文本
            var intermission = [
                '',
                '—— 第' + getActNum(gameState.currentAct) + '幕 ——',
                '',
                nextAct.intro
            ].join('\n');

            EventBus.emit('narration_chunk', {
                speaker: '',
                text: intermission,
                speed: 36
            });

            // 等 Intro 读完
            var ms = Math.max(6000, Math.ceil(nextAct.intro.length / 3 * 1000) + 3000);
            setTimeout(function() {
                startCurrentScene();
            }, ms);
        } catch(e) {
            console.error('[main] advanceToNextAct 崩溃:', e);
            showDialogue('路师傅', '（幕间换场时出了点岔子……请刷新页面。）');
        }
    }

    // ============================================================
    // 结局判定
    // ============================================================
    function endGame() {
        try {
            gameState.isGameOver = true;

            var ending = determineEnding(gameState);
            var endingName = typeof ending === 'object' ? ending.name : ending;
            var endingDesc = typeof ending === 'object' ? ending.desc : '';
            var endingData = ACTS_DATA.endings ? (
                ACTS_DATA.endings['light_passed'] ||
                ACTS_DATA.endings[Object.keys(ACTS_DATA.endings)[0]]
            ) : null;

            // 兼容 determineEnding 返回对象或字符串
            if (typeof ending === 'object' && ending.desc) {
                endingData = ending;
            }

            console.log('[main] 游戏结束 — 结局：' + endingName);

            if (endingData) {
                EventBus.emit('narration_chunk', {
                    speaker: '',
                    text: '【' + endingData.name + '】\n\n' + endingData.description,
                    speed: 30
                });
            }

            // 锁定操作按钮
            var btnConfirm = document.getElementById('btnConfirm');
            var btnAsk = document.getElementById('btnAsk');
            if (btnConfirm) { btnConfirm.disabled = true; btnConfirm.textContent = '剧终'; }
            if (btnAsk)     { btnAsk.disabled = true; btnAsk.textContent     = '谢幕'; }

            // 隐藏下一场按钮
            var btnNext = document.getElementById('btnNext');
            if (btnNext) btnNext.style.display = 'none';

            // 舞台渐暗
            var stage = document.getElementById('stage');
            if (stage) stage.classList.add('stage-dark');

            // 最终更新标题
            updateHeader();
        } catch(e) {
            console.error('[main] endGame 崩溃:', e);
        }
    }

    // ============================================================
    // 工具
    // ============================================================
    function getActNum(n) {
        return ['', '一', '二', '三'][n];
    }

    // ============================================================
    // 工具：根据评判数据累加结局打分（faithfulness / creativity）
    // 参考 act1-core.js 的 localJudge 公式：
    //   score      = round(coverage*70) + extra*5 - wrong*10  （限幅 0~100）
    //   creativity = extra>0 ? min(30, extra*10+5) : 0
    // 不累加则 endingStats 恒为 0，determineEnding 永远返回"灯灭"
    // ============================================================
    function accumulateEndingStats(data) {
        try {
            var act = ACTS_DATA.acts[gameState.currentAct - 1];
            var scene = act && act.scenes ? act.scenes[gameState.currentScene] : null;
            if (!scene) {
                console.warn('[main] accumulateEndingStats：找不到当前场景数据，跳过');
                return;
            }

            var required = scene.standard_puppets || [];
            var extras   = scene.acceptable_extras || [];

            // 已摆皮影的 id 列表（兼容 {puppetId} / {id} / 纯字符串）
            var placedIds = (data.puppets || []).map(function(p) {
                return p && (p.puppetId || p.id || p);
            });

            // 标准角色覆盖率
            var covered = required.filter(function(id) { return placedIds.indexOf(id) !== -1; });
            var coverage = required.length > 0 ? covered.length / required.length : 1;

            // 额外创意角色数 & 错误角色数
            var extraCount = placedIds.filter(function(id) { return extras.indexOf(id) !== -1; }).length;
            var wrongCount = placedIds.filter(function(id) {
                return required.indexOf(id) === -1 && extras.indexOf(id) === -1;
            }).length;

            // 还原度得分（与 act1-core 一致）
            var score = Math.round(coverage * 70) + extraCount * 5 - wrongCount * 10;
            score = Math.max(0, Math.min(100, score));

            // 创造力得分：用了额外角色才加分
            var creativity = extraCount > 0 ? Math.min(30, extraCount * 10 + 5) : 0;

            gameState.endingStats.faithfulness += score;
            gameState.endingStats.creativity   += creativity;

            console.log('[main] 结局打分累加 → faithfulness=' + gameState.endingStats.faithfulness +
                        ' | creativity=' + gameState.endingStats.creativity);
        } catch(e) {
            console.error('[main] accumulateEndingStats 崩溃:', e);
        }
    }

    // 快捷显示对话（用于错误提示等）
    function showDialogue(speaker, text) {
        var speakerEl = document.getElementById('speaker');
        var dialogueEl = document.getElementById('dialogueText');
        if (speakerEl) speakerEl.textContent = speaker || '';
        if (dialogueEl) dialogueEl.textContent = text || '';
    }

    // ============================================================
    // 皮影箱切换：根据当前幕号显示/隐藏对应皮影卡片
    // ============================================================
    function updatePuppetCards(actNum) {
        var cards = document.querySelectorAll('.puppet-card');
        var visibleCount = 0;
        cards.forEach(function(card) {
            var acts = (card.dataset.act || '').split(',');
            if (acts.indexOf(String(actNum)) >= 0) {
                card.classList.remove('hidden');
                visibleCount++;
            } else {
                card.classList.add('hidden');
            }
        });
        console.log('[main] 皮影箱已切换至第' + getActNum(actNum) + '幕（显示' + visibleCount + '个角色）');
    }

    // ============================================================
    // DOM 加载完成后启动
    // ============================================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
