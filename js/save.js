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