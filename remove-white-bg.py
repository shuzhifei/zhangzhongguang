#!/usr/bin/env python3
"""
批量去除皮影图片白色背景，输出为透明 PNG。
把 assets/images/ 下所有 .jpg 处理，覆盖保存为 .png。
"""
import os
from PIL import Image

SRC_DIR = r"D:\zhangzhongguang\assets\images"
THRESHOLD = 230  # RGB 每个通道 > 230 就认为是白色背景

def remove_white_bg(input_path, output_path):
    img = Image.open(input_path).convert("RGBA")
    data = img.load()
    w, h = img.size

    for y in range(h):
        for x in range(w):
            r, g, b, a = data[x, y]
            # 白色/接近白色 → 透明
            if r > THRESHOLD and g > THRESHOLD and b > THRESHOLD:
                data[x, y] = (r, g, b, 0)

    img.save(output_path, "PNG")
    print(f"  ✅ {os.path.basename(input_path)} → {os.path.basename(output_path)}")

def main():
    files = [f for f in os.listdir(SRC_DIR) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
    if not files:
        print("没有找到图片文件")
        return

    print(f"找到 {len(files)} 张图片，开始去白底...\n")
    for f in files:
        in_path = os.path.join(SRC_DIR, f)
        out_name = os.path.splitext(f)[0] + ".png"
        out_path = os.path.join(SRC_DIR, out_name)
        remove_white_bg(in_path, out_path)

    print(f"\n全部完成！{len(files)} 张图已转为透明 PNG")

if __name__ == "__main__":
    main()
