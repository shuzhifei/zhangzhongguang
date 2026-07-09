// ========================================
// B 逻辑工程师 - lamp.js
// 灯油消耗/奖励/恢复系统 + 第二幕倒计时
// ========================================

// 倒计时全局变量
let countdownTimer = null;
let secondsLeft = 10;

// ===== 刷新灯油 UI =====
function updateOilUI() {
  const oil = gameState.lampOil;
  const oilText = document.getElementById('oilText');
  if (oilText) oilText.textContent = oil + ' / 100';
  const oilBar = document.getElementById('oilBar');
  if (oilBar) oilBar.style.width = oil + '%';
}

// 灯油系统封装
const LampSystem = {
    // 消耗规则
    COSTS: {
        puppet_placed: 3,
        puppet_removed: 1,
        puppet_moved: 1,
        ask_master: 8,
        wrong_puppet: 5,
        time_penalty: 2
    },
    // 加分加油奖励
    REWARDS: {
        correct_judge: 2,
        creativity_bonus: 3,
        partial_correct: 1,
        perfect_scene: 10
    },
    // 幕间恢复油量
    RECOVERY: {
        intermission: 80
    },

    // 消耗油，返回是否油耗尽
    burn(reason) {
        const cost = this.COSTS[reason] || 0;
        gameState.lampOil = Math.max(0, gameState.lampOil - cost);
        gameState.totalOilBurned += cost;
        gameState.updateAIQuality();
        updateOilUI();
        EventBus.emit("oil_changed", { oil: gameState.lampOil, reason });

        if (gameState.lampOil <= 0) {
            EventBus.emit("oil_depleted", { state: gameState });
            return true;
        }
        return false;
    },

    // 获得油奖励
    reward(reason) {
        const gain = this.REWARDS[reason] || 0;
        gameState.lampOil = Math.min(100, gameState.lampOil + gain);
        gameState.updateAIQuality();
        updateOilUI();
        EventBus.emit("oil_changed", { oil: gameState.lampOil, reason });
    },

    // 幕间统一恢复油量
    intermissionRecover() {
        gameState.lampOil = this.RECOVERY.intermission;
        gameState.updateAIQuality();
        updateOilUI();
        EventBus.emit("oil_changed", { oil: gameState.lampOil, reason: "intermission" });
    },

    // 第二幕限时倒计时（每秒扣油+倒计时）
    startCountdown() {
        secondsLeft = 10;
        if (countdownTimer) clearInterval(countdownTimer);
        countdownTimer = setInterval(() => {
            secondsLeft--;
            EventBus.emit("countdown_tick", { time: secondsLeft });
            LampSystem.burn("time_penalty");
            if (secondsLeft <= 0) {
                clearInterval(countdownTimer);
                EventBus.emit("countdown_expired");
            }
        }, 1000);
    }
};

// 全局导出
window.LampSystem = LampSystem;
