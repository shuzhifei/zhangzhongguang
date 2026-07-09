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
    // 入口：DOM就绪后启动
    // ============================================================
    function init() {
        console.log('[main] 游戏流程控制器就绪');
        console.log('[main] 第' + gameState.currentAct + '幕 第' + (gameState.currentScene + 1) + '场');

        // 显示第一幕Intro
        const act1 = ACTS_DATA.acts[0];
        showActIntro(act1, function() {
            setTimeout(function() { startCurrentScene(); }, 1000);
        });
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
        const ms = Math.max(4000, Math.ceil(act.intro.length / 3 * 1000) + 1000);
        if (callback) setTimeout(callback, ms);
    }

    // ============================================================
    // 开始当前场景
    // ============================================================
    function startCurrentScene() {
        const act = ACTS_DATA.acts[gameState.currentAct - 1];
        const scene = act.scenes[gameState.currentScene];

        sceneConfirmCount = 0;
        scenePassed = false;
        advancing = false;

        // 清空舞台
        if (window.TheaterSystem && TheaterSystem.clearStage) {
            TheaterSystem.clearStage();
        }

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
    }

    // ============================================================
    // 监听评判结果 → 决定是否通过
    // ============================================================
    EventBus.on('scene_judged', function(data) {
        if (scenePassed || advancing) {
            console.log('[main] 场景已通过/推进中，跳过');
            return;
        }

        sceneConfirmCount++;

        const coverage = data.coverage || 0;
        const score = data.score || 0;

        // 第三幕即兴场景：宽松标准（standard_puppets为空，coverage=1但无意义）
        const act = ACTS_DATA.acts[gameState.currentAct - 1];
        const scene = act.scenes[gameState.currentScene];
        const isImprov = scene.is_improvisation === true;

        console.log('[main] 评判 #' + sceneConfirmCount +
            ' | 覆盖率=' + (coverage * 100).toFixed(0) + '%' +
            ' | 得分=' + score +
            (isImprov ? ' | 即兴模式' : ''));

        // 通过条件：
        //   即兴场：第一次确认就通过（鼓励自由创作）
        //   普通场：覆盖率≥80% 或 AI评分≥60 或 第3次确认强制通过
        let pass;
        if (isImprov) {
            pass = sceneConfirmCount >= 1; // 即兴场摆一次就过
        } else {
            pass = (coverage >= 0.8) || (score >= 60) || (sceneConfirmCount >= 3);
        }

        if (pass) {
            scenePassed = true;
            advancing = true;

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

            // 延迟推进（让评语有足够时间显示）
            const delay = isImprov ? 2500 : 3500;
            setTimeout(function() {
                advanceScene();
            }, delay);
        }
    });

    // ============================================================
    // 推进：下一场 / 下一幕 / 结局
    // ============================================================
    function advanceScene() {
        const act = ACTS_DATA.acts[gameState.currentAct - 1];
        const totalScenes = act.scenes.length;

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
    }

    // ============================================================
    // 幕间切换
    // ============================================================
    function advanceToNextAct() {
        const prevActNum = gameState.currentAct;
        gameState.currentAct++;
        gameState.currentScene = 0;

        console.log('[main] 第' + prevActNum + '幕结束 → 进入第' + gameState.currentAct + '幕');

        // lamp.js 监听 → 回油到80；theater.js 监听 → 清空舞台/恢复亮度
        EventBus.emit('act_intermission');

        const nextAct = ACTS_DATA.acts[gameState.currentAct - 1];

        // 幕间过渡文本
        const intermission = [
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
        const ms = Math.max(6000, Math.ceil(nextAct.intro.length / 3 * 1000) + 3000);
        setTimeout(function() {
            startCurrentScene();
        }, ms);
    }

    // ============================================================
    // 结局判定
    // ============================================================
    function endGame() {
        gameState.isGameOver = true;

        const ending = determineEnding(gameState);
        const endingData = ACTS_DATA.endings[ending];

        console.log('[main] 游戏结束 — 结局：' + ending);

        if (endingData) {
            EventBus.emit('narration_chunk', {
                speaker: '',
                text: '【' + endingData.name + '】\n\n' + endingData.description,
                speed: 30
            });
        }

        // 锁定操作按钮
        const btnConfirm = document.getElementById('btnConfirm');
        const btnAsk = document.getElementById('btnAsk');
        if (btnConfirm) { btnConfirm.disabled = true; btnConfirm.textContent = '剧终'; }
        if (btnAsk)     { btnAsk.disabled     = true; btnAsk.textContent     = '谢幕'; }

        // 舞台渐暗
        const stage = document.getElementById('stage');
        if (stage) stage.classList.add('stage-dark');
    }

    // ============================================================
    // 工具
    // ============================================================
    function getActNum(n) {
        return ['', '一', '二', '三'][n];
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
