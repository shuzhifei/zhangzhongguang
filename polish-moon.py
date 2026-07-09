#!/usr/bin/env python3
"""
润色皮影月亮图片：
1. 裁剪掉边缘水印区域
2. 去掉深蓝色背景，转为透明PNG
3. 保存到项目 assets/images/
"""
from PIL import Image
import os

src = r'C:\Users\licha\.workbuddy\clipboard-images\clipboard-2026-07-09T02-01-04-456Z-63be1319.jpg'
dst = r'D:\zhangzhongguang\assets\images\moon.png'

img = Image.open(src).convert('RGBA')
w, h = img.size
print(f'原始尺寸: {w}x{h}')

# 1. 裁剪掉边缘有水印的区域（左上"AI生成"、右下"通义万相"、右侧竖条装饰）
# 保守裁剪：左80、上80、右120、下120（右边有装饰条，下边有水印）
crop_box = (80, 80, w - 120, h - 120)
img = img.crop(crop_box)
print(f'裁剪后尺寸: {img.size}')

# 2. 去掉深蓝色背景（变透明）
# 背景色大约在 #1a2b5a 附近，但有渐变，所以用阈值判断
pixels = img.load()
for y in range(img.height):
    for x in range(img.width):
        r, g, b, a = pixels[x, y]
        # 判断是否为深蓝背景：蓝色分量高，红绿分量低
        # 背景色大约 RGB(20, 40, 90) 左右
        if b > 60 and r < 50 and g < 50 and (b - r > 30) and (b - g > 20):
            # 深蓝背景 → 透明
            pixels[x, y] = (0, 0, 0, 0)
        elif r < 30 and g < 30 and b < 60:
            # 更暗的角落
            pixels[x, y] = (0, 0, 0, 0)

# 3. 可选：稍微缩放让图片适中（原始1920x1920太大，舞台上只有60px）
# 保持较高分辨率供CSS缩放，缩到 600x600 左右
img.thumbnail((600, 600), Image.LANCZOS)
print(f'缩放后尺寸: {img.size}')

img.save(dst, 'PNG')
print(f'已保存: {dst}')
print(f'文件大小: {os.path.getsize(dst) / 1024:.1f} KB')
