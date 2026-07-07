const SAVE_KEY = "zhangzhongguang_save";

const SaveSystem = {
  // 保存当前进度
  save() {
    const saveStr = gameState.toJSON();
    localStorage.setItem(SAVE_KEY, saveStr);
    console.log("存档完成", saveStr);
  },

  // 读取存档
  load() {
    try {
      const saveStr = localStorage.getItem(SAVE_KEY);
      if (!saveStr) return false;
      const restoreState = GameState.fromJSON(saveStr);
      Object.assign(gameState, restoreState);
      Bus.emit("save_loaded", { state: gameState });
      return true;
    } catch (err) {
      console.error("读档失败", err);
      return false;
    }
  },

  // 删除存档
  clear() {
    localStorage.removeItem(SAVE_KEY);
    console.log("存档已清空");
  }
};

import "./game.js";

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