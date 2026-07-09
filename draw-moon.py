#!/usr/bin/env python3
"""
生成简洁皎洁圆月

一轮皎洁的圆形满月，带柔光边缘，无复杂花纹，
透明背景，200×280 画布居中。
"""
from PIL import Image, ImageDraw, ImageFilter
import math

W, H = 200, 280
r = 80  # 月亮半径

# 步骤1：画一个带模糊辉光的月亮（在 RGB 画布上操作，最后转 RGBA）
# 先画在大一点的临时画布上，方便做模糊溢出
pad = 60
tmp_size = W + pad * 2
tmp = Image.new('RGBA', (tmp_size, tmp_size), (0, 0, 0, 0))
draw_tmp = ImageDraw.Draw(tmp)

# 辉光：浅金色大圆
glow_cx, glow_cy = tmp_size // 2, tmp_size // 2 - 10  # 略偏上
for gr in range(r + 40, r - 5, -2):
    alpha = max(0, int(60 * (gr - r) / 40))  # 越往外越淡
    color = (255, 250, 235, alpha)
    draw_tmp.ellipse(
        (glow_cx - gr, glow_cy - gr, glow_cx + gr, glow_cy + gr),
        fill=color
    )

# 月亮主体：柔白到微黄渐变（用多层叠加模拟）
for layer_r in range(r, r - 20, -1):
    t = (r - layer_r) / 20  # 0(边缘) → 1(中心)
    # 边缘更暖(255,245,220)，中心更亮(255,255,248)
    rr = int(255)
    gg = int(245 + 10 * t)
    bb = int(220 + 28 * t)
    draw_tmp.ellipse(
        (glow_cx - layer_r, glow_cy - layer_r, glow_cx + layer_r, glow_cy + layer_r),
        fill=(rr, gg, bb, 255)
    )

# 裁剪到 200×280
tmp = tmp.crop((pad, pad, pad + W, pad + H))

# 整体轻微高斯模糊让月亮更柔
tmp = tmp.filter(ImageFilter.GaussianBlur(radius=0.8))

tmp.save(r'D:\zhangzhongguang\assets\images\moon.png', 'PNG')
print(f'圆月已生成: 200×280, 半径{r}px, 居中偏上')
print('效果：皎洁白月+浅金辉光+透明背景')
