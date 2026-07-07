// 游戏全局状态管理类，存储全部数值数据
class GameState {
  constructor() {
    // 基础进度
    this.currentAct = 1;
    this.currentScene = 0;
    this.isGameOver = false;

    // 灯油数值系统
    this.lampOil = 100;
    this.totalOilBurned = 0;

    // 皮影数据
    this.ownedPuppets = ["scholar", "tree", "moon", "elder", "frog"];
    this.stagedPuppets = [];
    this.usedPuppets = [];

    // 结局评分
    this.endingStats = {
      faithfulness: 0,
      creativity: 0,
      oilConservation: 0,
      questionsAsked: 0,
    };

    this.aiQuality = "high";
  }

  // 根据油量自动更新AI等级
  updateAIQuality() {
    if (this.lampOil >= 80) this.aiQuality = "high";
    else if (this.lampOil >= 50) this.aiQuality = "medium";
    else if (this.lampOil >= 20) this.aiQuality = "low";
    else this.aiQuality = "critical";
  }

  // 序列化：转字符串用于存档
  toJSON() {
    return JSON.stringify(this);
  }

  // 静态方法：读取存档恢复游戏数据
  static fromJSON(jsonStr) {
    const data = JSON.parse(jsonStr);
    const state = new GameState();
    Object.assign(state, data);
    return state;
  }
}

// 全局唯一游戏数据实例，全项目共用
const gameState = new GameState();

// 工具函数：根据油量返回档位
function getAIQuality(oilPercent) {
  if (oilPercent >= 80) return "high";
  else if (oilPercent >= 50) return "medium";
  else if (oilPercent >= 20) return "low";
  else return "critical";
}

// 核心结局判定函数
function determineEnding(state) {
  const { lampOil, endingStats } = state;
  const { faithfulness, creativity } = endingStats;

  if (creativity >= 80) return "shadow_master";
  if (lampOil >= 30 && faithfulness >= 70 && creativity >= 50) return "light_passed";
  if (lampOil >= 15 && faithfulness >= 60) return "light_kept";
  if (faithfulness >= 40) return "shadow_remains";
  return "light_out";
}