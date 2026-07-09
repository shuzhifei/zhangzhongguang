#!/usr/bin/env python3
"""
统一皮影素材尺寸为 200×280px。
策略：保持原始比例，缩小到完全放入200×280画布内，
居中放置，空白区域保持透明。
"""
from PIL import Image
import os

IMAGES_DIR = r'D:\zhangzhongguang\assets\images'
TARGET_W, TARGET_H = 200, 280

files_to_resize = ['elder.png', 'frog.png', 'moon.png', 'scholar.png']

for fname in files_to_resize:
    src_path = os.path.join(IMAGES_DIR, fname)
    if not os.path.exists(src_path):
        print(f'[跳过] {fname} 不存在')
        continue

    img = Image.open(src_path).convert('RGBA')
    ow, oh = img.size
    print(f'{fname}: {ow}×{oh}', end=' → ')

    # 计算缩放比例，使图片完全放入200×280
    scale = min(TARGET_W / ow, TARGET_H / oh)
    new_w = int(ow * scale)
    new_h = int(oh * scale)

    # 缩放
    img_resized = img.resize((new_w, new_h), Image.LANCZOS)

    # 创建200×280透明画布，居中放置
    canvas = Image.new('RGBA', (TARGET_W, TARGET_H), (0, 0, 0, 0))
    x = (TARGET_W - new_w) // 2
    y = (TARGET_H - new_h) // 2
    canvas.paste(img_resized, (x, y), img_resized)

    # 覆盖保存
    canvas.save(src_path, 'PNG')
    print(f'{TARGET_W}×{TARGET_H} (缩放{scale:.1%}, 居中)')

print('\n全部处理完成！')
