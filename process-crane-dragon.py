from PIL import Image
import numpy as np

def process_image(src_path, dest_path, target_w, target_h, threshold=240):
    """通用：去白底 + 居中缩放"""
    img = Image.open(src_path).convert("RGBA")
    arr = np.array(img, dtype=np.float32)
    
    # 去白底：接近白色的像素 alpha=0
    rgb = arr[:,:,:3]
    bg = (rgb[:,:,0] > threshold) & (rgb[:,:,1] > threshold) & (rgb[:,:,2] > threshold)
    arr[bg, 3] = 0
    
    # 转成PIL
    img2 = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')
    
    # 获取内容bbox（alpha>0的部分）
    alpha = np.array(img2)[:,:,3]
    coords = np.argwhere(alpha > 0)
    if len(coords) == 0:
        print(f"警告: {dest_path} 没有非透明内容")
        img2.save(dest_path)
        return
    
    y1, x1 = coords.min(axis=0)
    y2, x2 = coords.max(axis=0)
    bbox = (int(x1), int(y1), int(x2)+1, int(y2)+1)
    
    # 裁剪到内容
    cropped = img2.crop(bbox)
    
    # 等比缩放到目标尺寸内
    cw, ch = cropped.size
    ratio_w = target_w / cw
    ratio_h = target_h / ch
    ratio = min(ratio_w, ratio_h)
    new_w = int(cw * ratio)
    new_h = int(ch * ratio)
    
    resized = cropped.resize((new_w, new_h), Image.LANCZOS)
    
    # 贴到目标画布中央
    canvas = Image.new('RGBA', (target_w, target_h), (0, 0, 0, 0))
    ox = (target_w - new_w) // 2
    oy = (target_h - new_h) // 2
    canvas.paste(resized, (ox, oy))
    
    canvas.save(dest_path)
    print(f"保存: {dest_path}  {canvas.size}")

# 鹤：竖长，200×280（像人物）
process_image(
    r'C:\Users\licha\.workbuddy\clipboard-images\clipboard-2026-07-09T08-27-31-032Z-ef56f6eb.jpg',
    'D:/zhangzhongguang/assets/images/crane.png',
    200, 280
)

# 龙：正方形，等比放到 200×280 画布中央
process_image(
    r'C:\Users\licha\.workbuddy\clipboard-images\clipboard-2026-07-09T08-27-31-035Z-db0150e4.jpg',
    'D:/zhangzhongguang/assets/images/dragon.png',
    200, 280
)

print("完成")
