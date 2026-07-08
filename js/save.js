// ========================================
// B 逻辑工程师 - save.js
// 存档/读档/清档系统
// ========================================

const SaveSystem = {
    KEY: "zhangzhongguang_save",
    _memoryStore: {},  // 当 localStorage 不可用时用内存存储

    // 检测浏览器是否支持 localStorage
    _isStorageAvailable() {
        try {
            const test = "__test__";
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (e) {
            return false;
        }
    },

    // 获取存储引擎
    _getStorage() {
        return this._isStorageAvailable() ? localStorage : this._memoryStore;
    },

    // 保存游戏到本地存储
    save() {
        try {
            const json = gameState.toJSON();
            const storage = this._getStorage();
            if (storage === localStorage) {
                localStorage.setItem(this.KEY, json);
            } else {
                this._memoryStore[this.KEY] = json;
            }
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
            const storage = this._getStorage();
            let json;
            if (storage === localStorage) {
                json = localStorage.getItem(this.KEY);
            } else {
                json = this._memoryStore[this.KEY] || null;
            }
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
        try {
            const storage = this._getStorage();
            if (storage === localStorage) {
                localStorage.removeItem(this.KEY);
            } else {
                delete this._memoryStore[this.KEY];
            }
            console.log("存档已删除");
        } catch (e) {
            console.error("清档失败", e);
        }
    }
};
window.SaveSystem = SaveSystem;
