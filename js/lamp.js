const Bus = EventBus;

// 固定消耗数值配置
const COSTS = {
  puppet_placed: 3,
  puppet_removed: 1,
  ask_master: 8,
  time_penalty: 2
};
const INTERMISSION_OIL = 80;

// 倒计时全局变量
let countdownTimer = null;
let secondsLeft = 10;

// 灯油系统封装
const LampSystem = {
  // 扣灯油
  burn(reason) {
    const cost = COSTS[reason] || 0;
    gameState.lampOil = Math.max(0, gameState.lampOil - cost);
    gameState.totalOilBurned += cost;
    gameState.updateAIQuality();
    Bus.emit("oil_changed", { oil: gameState.lampOil });
    if (gameState.lampOil === 0) {
      Bus.emit("oil_depleted", { state: gameState });
    }
  },

  // 增加灯油奖励
  reward(reason, amount) {
    gameState.lampOil = Math.min(100, gameState.lampOil + amount);
    gameState.updateAIQuality();
    Bus.emit("oil_changed", { oil: gameState.lampOil });
  },

  // 幕间自动回油
  intermissionRecover() {
    gameState.lampOil = INTERMISSION_OIL;
    gameState.updateAIQuality();
    Bus.emit("oil_changed", { oil: gameState.lampOil });
  },

  // 第二幕限时倒计时
  startCountdown() {
    secondsLeft = 10;
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      secondsLeft--;
      Bus.emit("countdown_tick", { time: secondsLeft });
      LampSystem.burn("time_penalty");
      if (secondsLeft <= 0) {
        clearInterval(countdownTimer);
        Bus.emit("countdown_expired");
      }
    }, 1000);
  }
};

// 监听前端A的所有操作事件
Bus.on("puppet_placed", (data) => {
  LampSystem.burn("puppet_placed");
  gameState.stagedPuppets.push(data.puppetId);
});
Bus.on("puppet_removed", () => LampSystem.burn("puppet_removed"));
Bus.on("ask_master_clicked", () => LampSystem.burn("ask_master"));
Bus.on("act_intermission", () => LampSystem.intermissionRecover());