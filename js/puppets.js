// ==========================================
// puppets.js — 皮影拖拽交互
// A组（前端工程师）负责
// ==========================================

(function() {
    'use strict';

    // ===== 缓存 DOM =====
    const stage = document.getElementById('stage');
    const cards = document.querySelectorAll('.puppet-card');

    // ===== 拖拽状态变量 =====
    let dragClone = null;        // 正在拖的皮影副本（跟着鼠标跑的）
    let dragPuppetId = null;    // 正在拖的是哪张皮影
    let offsetX = 0, offsetY = 0; // 鼠标相对于卡片左上角的偏移

    // ===== 1. 按住皮影卡片 → 创建拖拽副本 =====
    function onCardMouseDown(e) {
        const card = e.currentTarget;
        dragPuppetId = card.dataset.puppet;

        // 创建跟随鼠标的副本
        dragClone = document.createElement('div');
        dragClone.className = 'puppet-drag-clone';
        dragClone.innerHTML = card.innerHTML;
        dragClone.dataset.puppet = dragPuppetId;

        // 定位到鼠标位置
        const rect = card.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        dragClone.style.left = (e.clientX - offsetX) + 'px';
        dragClone.style.top  = (e.clientY - offsetY) + 'px';

        document.body.appendChild(dragClone);
        card.classList.add('dragging'); // 原卡片变灰
    }

    // ===== 2. 鼠标移动 → 副本跟随 =====
    function onMouseMove(e) {
        if (!dragClone) return;
        dragClone.style.left = (e.clientX - offsetX) + 'px';
        dragClone.style.top  = (e.clientY - offsetY) + 'px';
    }

    // ===== 3. 松手 → 判断放哪 =====
    function onMouseUp(e) {
        if (!dragClone) return;

        // 恢复原卡片外观
        cards.forEach(c => c.classList.remove('dragging'));
        dragClone.remove();

        // 判断鼠标是否在舞台上
        const stageRect = stage.getBoundingClientRect();
        const onStage =
            e.clientX >= stageRect.left &&
            e.clientX <= stageRect.right &&
            e.clientY >= stageRect.top &&
            e.clientY <= stageRect.bottom;

        if (onStage) {
            placeOnStage(e.clientX, e.clientY);
        }

        // 重置状态
        dragClone = null;
        dragPuppetId = null;
    }

    // ===== 4. 把皮影放到舞台上 =====
    function placeOnStage(x, y) {
        const stageRect = stage.getBoundingClientRect();

        // 创建舞台上的皮影元素
        const pup = document.createElement('div');
        pup.className = 'stage-puppet';
        pup.dataset.puppet = dragPuppetId;

        // 用 emoji 当图标（临时方案）
        const originalCard = stage.querySelector('.stage-hint');
        const cardEl = document.querySelector(`.puppet-card[data-puppet="${dragPuppetId}"]`);
        const icon = cardEl ? cardEl.querySelector('.puppet-icon').textContent : '🎭';
        pup.innerHTML = `<span style="font-size:40px;">${icon}</span>`;

        // 定位（相对于舞台）
        pup.style.left = (x - stageRect.left - 20) + 'px';
        pup.style.top  = (y - stageRect.top  - 20) + 'px';

        stage.appendChild(pup);

        // 通知其他模块
        EventBus.emit('puppet_placed', {
            id: dragPuppetId,
            x: parseInt(pup.style.left),
            y: parseInt(pup.style.top)
        });

        // 隐藏提示文字
        const hint = stage.querySelector('.stage-hint');
        if (hint) hint.style.display = 'none';
    }

    // ===== 5. 绑定事件 =====
    cards.forEach(card => {
        card.addEventListener('mousedown', onCardMouseDown);
    });
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    console.log('[puppets] 拖拽系统就绪，共', cards.length, '张皮影');
})();
