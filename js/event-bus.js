/**
 * EventBus - 掌中光项目的通信枢纽
 * ============================================
 * 作用：让四个成员的模块互相通信，但不互相依赖
 *
 * 原理：发布-订阅模式（广播站）
 *   - 某个模块喊一嗓子（emit），不关心谁在听
 *   - 其他模块提前登记（on），听到就行动
 *
 * 8个标准事件：
 *   事件名            触发者  监听者
 *   ─────────────────────────────────────
 *   puppet_placed     A       B扣油 + C记录
 *   puppet_removed    A       B少量扣油
 *   stage_confirmed   A       C开始AI评判
 *   ask_master        A       B扣8油 + C追问AI
 *   oil_changed       B       A更新UI + C调整质量
 *   oil_depleted      B       A灭灯动画
 *   judge_result      C       B更新分数
 *   narration_chunk   C       A逐字显示
 */

const EventBus = {
    // 存储所有监听器：{ 事件名: [回调函数1, 回调函数2, ...] }
    listeners: {},

    /**
     * 登记监听（我订阅这个频道）
     * @param {string} eventName - 事件名，比如 'puppet_placed'
     * @param {function} callback - 听到事件后执行的动作
     *
     * 用法示例（B的灯油系统监听皮影放置）：
     *   EventBus.on('puppet_placed', function(data) {
     *       扣油(5);
     *   });
     */
    on(eventName, callback) {
        if (!this.listeners[eventName]) {
            this.listeners[eventName] = [];
        }
        this.listeners[eventName].push(callback);
    },

    /**
     * 喊一嗓子（我触发这个事件）
     * @param {string} eventName - 事件名，比如 'puppet_placed'
     * @param {*} data - 附带的数据，比如 { puppetName: '老寿星', position: {x: 100, y: 200} }
     *
     * 用法示例（A的皮影拖拽触发事件）：
     *   EventBus.emit('puppet_placed', {
     *       puppetName: '老寿星',
     *       position: { x: 100, y: 200 }
     *   });
     */
    emit(eventName, data) {
        const callbacks = this.listeners[eventName];
        if (!callbacks) return; // 没人听，就什么都不做

        callbacks.forEach(function(callback) {
            try {
                callback(data);
            } catch (error) {
                console.error('EventBus 事件处理出错：' + eventName, error);
            }
        });
    },

    /**
     * 取消监听（我不听了）
     * @param {string} eventName - 事件名
     * @param {function} callback - 之前登记的那个函数
     *
     * 用法示例：
     *   EventBus.off('puppet_placed', myCallback);
     */
    off(eventName, callback) {
        const callbacks = this.listeners[eventName];
        if (!callbacks) return;

        const index = callbacks.indexOf(callback);
        if (index !== -1) {
            callbacks.splice(index, 1);
        }
    },

    /**
     * 调试用：查看某个事件有多少个监听器
     * @param {string} eventName - 事件名
     * @returns {number} 监听器数量
     */
    listenerCount(eventName) {
        const callbacks = this.listeners[eventName];
        return callbacks ? callbacks.length : 0;
    },

    /**
     * 调试用：打印所有事件和监听器数量
     */
    debug() {
        console.log('=== EventBus 调试信息 ===');
        for (const eventName in this.listeners) {
            console.log(eventName + ': ' + this.listeners[eventName].length + ' 个监听器');
        }
        console.log('========================');
    }
};

// 导出到全局，让所有模块都能用
if (typeof window !== 'undefined') {
    window.EventBus = EventBus;
}
