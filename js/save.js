// ========================================
// B 逻辑工程师 - save.js
// 存档/读档/清档系统
// ========================================

const SaveSystem = {
    KEY: "zhangzhongguang_save",

    // 保存游戏到本地存储
    save() {
        try {
            const json = gameState.toJSON();
            localStorage.setItem(this.KEY, json);
            console.log("存档成功");
            return true;
        } catch (e) {
            console.error("存档失败", e);
            return false;
        }
    },

    // 读取存档恢复状态
    load() {
        try {
            const json = localStorage.getItem(this.KEY);
            if (!json) return false;
            const restored = GameState.fromJSON(json);
            Object.assign(gameState, restored);
            console.log("读档成功");
            // 通知全队存档已加载
            EventBus.emit("save_loaded", { state: gameState });
            return true;
        } catch (e) {
            console.error("读档失败", e);
            return false;
        }
    },

    // 清除存档
    clear() {
        localStorage.removeItem(this.KEY);
        console.log("存档已删除");
    }
};
window.SaveSystem = SaveSystem;
