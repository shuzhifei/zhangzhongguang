// ==========================================
// act1-core.js — 第一幕游戏核心逻辑
// 场景控制 / 拖拽 / 评判 / UI事件 / 启动
// 依赖: event-bus.js / game.js / lamp.js / save.js / puppet-images.js / act1-scenes.js
// ==========================================

// ---- 舞台上各皮影渲染尺寸（宽×高，用于居中放置） ----
const PUPPET_RENDER = {
    scholar: { w: 100, h: 140 }, elder: { w: 100, h: 140 }, frog: { w: 100, h: 140 },
    tree: { w: 100, h: 252 }, moon: { w: 100, h: 100 },
    letter: { w: 80, h: 80 }, lamp: { w: 80, h: 80 }, master: { w: 100, h: 140 }
};

// ---- 本地评判器（不依赖AI） ----
function localJudge(sceneId) {
    var scene = ACT1.scenes[gameState.currentScene - 1];
    var placedIds = gameState.stagedPuppets;
    var required = scene.standard, extras = scene.extras;
    var covered = required.filter(function (id) { return placedIds.indexOf(id) >= 0; });
    var coverage = required.length > 0 ? covered.length / required.length : 1;
    var extraCount = placedIds.filter(function (id) { return extras.indexOf(id) >= 0; }).length;
    var wrongCount = placedIds.filter(function (id) { return required.indexOf(id) < 0 && extras.indexOf(id) < 0; }).length;
    var score = Math.round(coverage * 70) + extraCount * 5 - wrongCount * 10;
    score = Math.max(0, Math.min(100, score));
    var correct = coverage >= 0.6;
    var creativity = extraCount > 0 ? Math.min(30, extraCount * 10 + 5) : 0;
    var cmt;
    if (coverage >= 1 && wrongCount === 0) cmt = "影面对了——路师傅微微点头：「不错。有点影感。」";
    else if (coverage >= 0.6) cmt = "大致对路。师傅看了看：「还差一点——再想想。」";
    else cmt = "不太对。路师傅沉默了一会儿：「你摆的——不是戏里要的。」";
    gameState.endingStats.faithfulness += score;
    gameState.endingStats.creativity += creativity;
    if (correct) LampSystem.reward("correct_judge");
    if (creativity > 20) LampSystem.reward("creativity_bonus");
    else if (creativity > 10) LampSystem.reward("partial_correct");
    SaveSystem.save();
    return { score: score, correct: correct, creativity: creativity, comment: cmt, covered: covered };
}

// ---- 场景控制器 ----
var currentSceneIdx = 0;
var sceneNames = ACT1.scenes.map(function (s) { return s.name; });

function loadScene(idx) {
    currentSceneIdx = idx;
    gameState.currentScene = idx + 1;
    var scene = ACT1.scenes[idx];
    document.getElementById("sceneInfo").textContent = "第" + (idx + 1) + "场 · " + scene.name;
    document.getElementById("speaker").textContent = "路师傅";
    document.getElementById("dialogueText").innerHTML =
        "<b>" + scene.name + "</b><br><br>" + scene.desc +
        "<br><br><i style=\"color:#8b6914;\">" + scene.masterLine + "</i>" +
        "<br><br><span style=\"color:#c48a3e;\">💡 " + scene.hint + "</span>";
    clearStage();
    document.getElementById("btnNext").style.display = "none";
    document.getElementById("btnConfirm").disabled = false;
    document.getElementById("btnAsk").disabled = false;
}

function clearStage() {
    var stage = document.getElementById("stage");
    var pups = stage.querySelectorAll(".stage-puppet");
    pups.forEach(function (p) { p.remove(); });
    var hint = stage.querySelector(".stage-hint");
    if (hint) hint.style.display = "block";
    gameState.stagedPuppets = [];
}

// ---- 拖拽系统 ----
var stageEl = document.getElementById("stage");
var dragClone = null, dragPuppetId = null, offsetX = 0, offsetY = 0;
var dragSource = null, dragPuppetEl = null;

function buildPuppetBox() {
    var box = document.getElementById("puppetBox");
    var ids = gameState.ownedPuppets;
    var nameMap = { scholar: "书生", elder: "老者", tree: "槐树", moon: "月亮", letter: "信", frog: "金蟾", lamp: "灯", master: "师傅" };
    ids.forEach(function (id) {
        var card = document.createElement("div");
        card.className = "puppet-card";
        card.dataset.puppet = id;
        var icon = document.createElement("div");
        icon.className = "puppet-icon";
        icon.innerHTML = PuppetImageRenderer.render(id, 80);
        var name = document.createElement("div");
        name.className = "puppet-name";
        name.textContent = nameMap[id] || id;
        card.appendChild(icon);
        card.appendChild(name);
        card.addEventListener("mousedown", onCardDown);
        box.appendChild(card);
    });
}

function onCardDown(e) {
    if (dragClone || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    document.getSelection().removeAllRanges();
    dragSource = "card";
    var card = e.currentTarget;
    dragPuppetId = card.dataset.puppet;
    dragClone = document.createElement("div");
    dragClone.className = "puppet-drag-clone";
    dragClone.style.zIndex = "9999";
    dragClone.innerHTML = PuppetImageRenderer.render(dragPuppetId, 70);
    var rect = card.getBoundingClientRect();
    offsetX = e.clientX - rect.left; offsetY = e.clientY - rect.top;
    dragClone.style.left = (e.clientX - offsetX) + "px";
    dragClone.style.top = (e.clientY - offsetY) + "px";
    document.body.appendChild(dragClone);
    card.classList.add("dragging");
}

function onStagePuppetDown(e) {
    if (dragClone || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    dragSource = "stage";
    dragPuppetEl = e.currentTarget;
    dragPuppetId = dragPuppetEl.dataset.puppet;
    var rect = dragPuppetEl.getBoundingClientRect();
    offsetX = e.clientX - rect.left; offsetY = e.clientY - rect.top;
    dragClone = document.createElement("div");
    dragClone.className = "puppet-drag-clone";
    dragClone.style.zIndex = "9999";
    var cloneW = rect.width;
    dragClone.style.width = cloneW + "px";
    dragClone.innerHTML = PuppetImageRenderer.render(dragPuppetId, cloneW);
    dragClone.style.left = (e.clientX - offsetX) + "px";
    dragClone.style.top = (e.clientY - offsetY) + "px";
    document.body.appendChild(dragClone);
    dragPuppetEl.style.opacity = "0.25";
}

document.addEventListener("mousemove", function (e) {
    if (!dragClone) return;
    dragClone.style.left = (e.clientX - offsetX) + "px";
    dragClone.style.top = (e.clientY - offsetY) + "px";
});

function endDrag(e) {
    if (!dragClone) return;
    if (e && e.type === "mouseup" && e.button !== 0) return;

    var isMouseLeave = e && e.type === "mouseleave";

    if (dragSource === "card") {
        var cards = document.querySelectorAll(".puppet-card");
        cards.forEach(function (c) { c.classList.remove("dragging"); });
    }
    dragClone.remove();

    // mouseleave 时强制取消，不放置/不移动
    if (isMouseLeave) {
        if (dragSource === "stage" && dragPuppetEl) dragPuppetEl.style.opacity = "1";
        dragClone = null; dragPuppetId = null; dragSource = null; dragPuppetEl = null;
        return;
    }

    var sr = stageEl.getBoundingClientRect();
    var clientX = e && e.clientX !== undefined ? e.clientX : 0;
    var clientY = e && e.clientY !== undefined ? e.clientY : 0;
    var onStage = clientX >= sr.left && clientX <= sr.right && clientY >= sr.top && clientY <= sr.bottom;

    if (dragSource === "card") {
        if (onStage) placePuppet(clientX, clientY);
    } else if (dragSource === "stage") {
        if (onStage) {
            dragPuppetEl.style.left = (clientX - offsetX - sr.left) + "px";
            dragPuppetEl.style.top = (clientY - offsetY - sr.top) + "px";
            dragPuppetEl.style.opacity = "1";
            LampSystem.burn("puppet_moved");
            EventBus.emit("puppet_moved", { id: dragPuppetId, x: parseInt(dragPuppetEl.style.left), y: parseInt(dragPuppetEl.style.top) });
        } else {
            dragPuppetEl.style.opacity = "1";
        }
    }

    dragClone = null; dragPuppetId = null; dragSource = null; dragPuppetEl = null;
}

document.addEventListener("mouseup", endDrag);
document.addEventListener("mouseleave", endDrag);

// 阻止浏览器默认拖拽行为（防止 ghost image）
document.addEventListener("dragstart", function (e) { e.preventDefault(); });

// ESC 取消拖拽
document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && dragClone) endDrag(null);
});

function placePuppet(x, y) {
    var sr = stageEl.getBoundingClientRect();
    var pup = document.createElement("div");
    pup.className = "stage-puppet";
    pup.dataset.puppet = dragPuppetId;
    var sz = PUPPET_RENDER[dragPuppetId] || { w: 100, h: 140 };
    pup.dataset.renderWidth = sz.w;
    pup.innerHTML = PuppetImageRenderer.render(dragPuppetId, sz.w);
    pup.style.left = (x - sr.left - sz.w / 2) + "px";
    pup.style.top = (y - sr.top - sz.h / 2) + "px";
    pup.addEventListener("mousedown", onStagePuppetDown);
    stageEl.appendChild(pup);
    EventBus.emit("puppet_placed", { id: dragPuppetId, x: parseInt(pup.style.left), y: parseInt(pup.style.top) });
    var hint = stageEl.querySelector(".stage-hint");
    if (hint) hint.style.display = "none";
}

// ---- 事件监听：皮影放置 → 扣油 + 入列 ----
EventBus.on("puppet_placed", function (data) {
    LampSystem.burn("puppet_placed");
    gameState.stagedPuppets.push(data.id);
});

EventBus.on("puppet_moved", function (data) {
    // 油耗已在 mouseup 中扣除，这里只做日志
    console.log("🎭 皮影移动: " + data.id + " → (" + data.x + "," + data.y + ")");
});

// ---- 事件监听：灯油变化 → 更新 UI ----
EventBus.on("oil_changed", function (data) {
    document.getElementById("oilBar").style.width = data.oil + "%";
    document.getElementById("oilText").textContent = data.oil + " / 100";
    var flame = document.getElementById("flame");
    if (data.oil <= 10) flame.style.opacity = "0.3";
    else if (data.oil <= 30) flame.style.opacity = "0.6";
    else flame.style.opacity = "1";
    document.getElementById("endingHint").textContent = determineEnding(gameState).name;
});

// ---- 事件监听：油耗尽 → 游戏结束 ----
EventBus.on("oil_depleted", function () {
    document.getElementById("flame").style.opacity = "0";
    document.getElementById("dialogueText").innerHTML = "<b style=\"color:#c45050;\">灯灭了。</b><br><br>舞台陷入黑暗。路师傅的声音从暗处传来：<br><br><i>\"没事。灯灭过很多次。每次都会有人再点起来。\"</i><br><br><span style=\"color:#8b6914;\">结局：灯灭</span>";
    document.getElementById("btnConfirm").disabled = true;
    document.getElementById("btnAsk").disabled = true;
    document.getElementById("btnNext").style.display = "none";
});

// ---- 按钮：确认摆影 ----
document.getElementById("btnConfirm").addEventListener("click", function () {
    if (gameState.stagedPuppets.length === 0) {
        document.getElementById("dialogueText").innerHTML = "<span style=\"color:#c45050;\">白布上什么都没有。先把皮影放上去吧。</span>";
        return;
    }
    document.getElementById("btnConfirm").disabled = true;
    var result = localJudge(currentSceneIdx);
    var scene = ACT1.scenes[currentSceneIdx];
    var html = "<b>📋 评判结果</b><br><br>";
    html += "得分：<span style=\"color:#e8c97a;\">" + result.score + "</span> / 100<br>";
    html += "判定：" + (result.correct ? "<span style=\"color:#6b8a40;\">✓ 对路</span>" : "<span style=\"color:#c45050;\">✗ 不太对</span>") + "<br>";
    html += "已摆皮影：" + gameState.stagedPuppets.join("、") + "<br>";
    html += "必需皮影覆盖：" + result.covered.join("、") + "<br>";
    html += "创造力加分：+" + result.creativity + "<br><br>";
    html += "<i>\"" + result.comment + "\"</i><br><br>";
    if (currentSceneIdx < 2) {
        html += "<span style=\"color:#c48a3e;\">点击「下一场」继续。</span>";
        document.getElementById("btnNext").style.display = "inline-block";
    } else {
        html += "<span style=\"color:#e8c97a;\">第一幕完成！共3场。</span>";
        var ending = determineEnding(gameState);
        html += "<br>当前倾向结局：<b>" + ending.name + "</b> —— " + ending.desc;
    }
    document.getElementById("dialogueText").innerHTML = html;
    document.getElementById("btnConfirm").disabled = false;
});

// ---- 按钮：追问师父 ----
document.getElementById("btnAsk").addEventListener("click", function () {
    LampSystem.burn("ask_master");
    gameState.endingStats.questionsAsked++;
    var replies = [
        "路师傅看了你一眼：「问得好——但有些事，你得自己从戏里看出来。」",
        "「你倒是有心。」路师傅捻了捻手中的操纵杆，没有正面回答。",
        "师傅沉默了一会儿：「戏里的事——有时候比真的还真。」",
        "路师傅摆了摆手：「先把这出戏演好。等灯油再亮些——我再告诉你。」"
    ];
    document.getElementById("dialogueText").innerHTML = "<b>你向师父追问……</b><br><br><i>\"" + replies[Math.floor(Math.random() * replies.length)] + "\"</i><br><br><span style=\"color:#c48a3e;\">灯油 -8</span>";
});

// ---- 按钮：下一场 ----
document.getElementById("btnNext").addEventListener("click", function () {
    if (currentSceneIdx < 2) {
        loadScene(currentSceneIdx + 1);
    }
});

// ---- 启动游戏 ----
buildPuppetBox();
loadScene(0);
document.getElementById("endingHint").textContent = determineEnding(gameState).name;

console.log("🎭 掌中光 · 第一幕就绪！共3场戏：", sceneNames.join(" → "));
console.log("📦 皮影箱：", gameState.ownedPuppets.join("、"));
console.log("🖼 可用图片：scholar✓ elder✓ frog✓ tree✓ moon✓ master✓（其余用emoji兜底）");
console.log("💡 拖皮影到白布 → 点「确认摆影」查看评判");
