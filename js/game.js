// ========================================
// B 逻辑工程师 - game.js
// 游戏全局状态管理类，存储全部数值数据
// ========================================

class GameState {
    constructor() {
        // 基础进度
        this.currentAct = 1;
        this.currentScene = 0;
        this.isGameOver = false;

        // 灯油系统
        this.lampOil = 100;
        this.totalOilBurned = 0;

        // 皮影管理
        this.ownedPuppets = ["scholar", "tree", "moon", "elder", "frog", "letter", "lamp", "demon", "monkey", "bamboo", "master"];
        this.stagedPuppets = [];   // 当前白布皮影
        this.usedPuppets = [];     // 本幕已使用皮影
        this.triggeredClues = [];  // 已触发的隐藏线索ID列表

        // 结局打分指标
        this.endingStats = {
            faithfulness: 0,
            creativity: 0,
            oilConservation: 0,
            questionsAsked: 0
        };

        // AI画质等级 high/medium/low/critical
        this.aiQuality = "high";
    }

    // 根据油量更新AI文字质量等级
    updateAIQuality() {
        if (this.lampOil >= 60) this.aiQuality = "high";
        else if (this.lampOil >= 30) this.aiQuality = "medium";
        else if (this.lampOil > 0) this.aiQuality = "low";
        else this.aiQuality = "critical";
    }

    // 序列化为存档字符串
    toJSON() {
        return JSON.stringify({
            currentAct: this.currentAct,
            currentScene: this.currentScene,
            isGameOver: this.isGameOver,
            lampOil: this.lampOil,
            totalOilBurned: this.totalOilBurned,
            ownedPuppets: this.ownedPuppets,
            stagedPuppets: this.stagedPuppets,
            usedPuppets: this.usedPuppets,
            triggeredClues: this.triggeredClues,
            endingStats: this.endingStats,
            aiQuality: this.aiQuality
        });
    }

    // 从存档恢复实例
    static fromJSON(jsonStr) {
        const data = JSON.parse(jsonStr);
        const state = new GameState();
        Object.assign(state, data);
        return state;
    }
}

// 全局唯一游戏状态单例
const gameState = new GameState();
window.gameState = gameState;

// 正式版结局判定，游戏结束调用
// 判定优先级：隐藏结局 > 传灯 > 守灯 > 残影 > 灯灭
function determineEnding(state) {
    const { lampOil, endingStats } = state;
    const { faithfulness, creativity } = endingStats;

    // 隐藏结局：影子师傅（优先级最高）
    if (creativity >= 80) return { name: "影子师傅", desc: "你走了自己的路——成为了非传统的传承人。" };
    // 传灯完美结局
    if (lampOil >= 30 && faithfulness >= 70 && creativity >= 50) return { name: "传灯", desc: "你成为新的说戏人。" };
    // 守灯
    if (lampOil >= 15 && faithfulness >= 60) return { name: "守灯", desc: "灯一直在闪，但没有灭。" };
    // 残影
    if (faithfulness >= 40) return { name: "残影", desc: "灯灭了。但白布上还有影子。" };
    // 灯灭最差结局
    return { name: "灯灭", desc: "全黑。师傅最后一句：「没事。灯灭过很多次。每次都会有人再点起来。」" };
}
window.determineEnding = determineEnding;
