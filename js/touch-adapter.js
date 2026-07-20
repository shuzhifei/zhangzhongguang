// ==========================================
// touch-adapter.js — 触屏→鼠标事件适配器
// ==========================================
// 手机端触屏操作自动映射为鼠标事件。
// 不修改任何现有鼠标事件代码，桌面端完全不受影响。
// 在 act1.html 中最早加载（于 EventBus 之前）。
// ==========================================
(function() {
    'use strict';

    // 仅触屏设备启用（桌面端直接跳过）
    var isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isTouchDevice) return;

    console.log('[touch-adapter] 触屏设备检测到，启用触屏→鼠标适配');

    var activeTouchId = null;

    /**
     * 从 TouchEvent 中取出当前跟踪的触点坐标
     */
    function getTouchPos(e) {
        if (activeTouchId === null) return null;
        // touchend / touchcancel 的触点信息在 changedTouches 里
        var touches = (e.type === 'touchend' || e.type === 'touchcancel')
            ? e.changedTouches
            : e.touches;
        for (var i = 0; i < touches.length; i++) {
            if (touches[i].identifier === activeTouchId) {
                return { clientX: touches[i].clientX, clientY: touches[i].clientY };
            }
        }
        return null;
    }

    // ---- touchstart → mousedown ----
    document.addEventListener('touchstart', function(e) {
        // 已经有一个触点被跟踪，忽略多点触控
        if (activeTouchId !== null) return;
        if (e.touches.length === 0) return;

        var touch = e.touches[0];
        activeTouchId = touch.identifier;

        // 找到触摸点下方的实际 DOM 元素
        var target = document.elementFromPoint(touch.clientX, touch.clientY);
        if (!target) target = e.target;

        var mouseEvent = new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: touch.clientX,
            clientY: touch.clientY,
            screenX: touch.screenX,
            screenY: touch.screenY,
            button: 0,
            buttons: 1
        });
        target.dispatchEvent(mouseEvent);
    }, { passive: true });

    // ---- touchmove → mousemove ----
    document.addEventListener('touchmove', function(e) {
        if (activeTouchId === null) return;
        var pos = getTouchPos(e);
        if (!pos) return;

        // 拖拽过程中阻止页面滚动
        e.preventDefault();

        var mouseEvent = new MouseEvent('mousemove', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: pos.clientX,
            clientY: pos.clientY,
            button: 0,
            buttons: 1
        });
        document.dispatchEvent(mouseEvent);
    }, { passive: false });

    // ---- touchend → mouseup ----
    document.addEventListener('touchend', function(e) {
        if (activeTouchId === null) return;
        var pos = getTouchPos(e);

        // 即使拿不到坐标也要清理状态（防止状态泄漏）
        if (!pos) {
            activeTouchId = null;
            return;
        }

        var mouseEvent = new MouseEvent('mouseup', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: pos.clientX,
            clientY: pos.clientY,
            screenX: pos.screenX,
            screenY: pos.screenY,
            button: 0,
            buttons: 0
        });
        document.dispatchEvent(mouseEvent);

        activeTouchId = null;
    }, { passive: true });

    // ---- touchcancel → mouseleave（拖拽中断，强制取消） ----
    document.addEventListener('touchcancel', function(e) {
        if (activeTouchId === null) return;
        var pos = getTouchPos(e);

        if (pos) {
            // 派发 mouseleave 让 endDrag 的 isMouseLeave 分支接管
            var mouseEvent = new MouseEvent('mouseleave', {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: pos.clientX,
                clientY: pos.clientY
            });
            document.dispatchEvent(mouseEvent);
        }

        activeTouchId = null;
    }, { passive: true });

    console.log('[touch-adapter] 就绪 — 触屏拖拽已映射为鼠标事件');
})();
