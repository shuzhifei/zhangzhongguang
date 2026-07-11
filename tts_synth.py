# -*- coding: utf-8 -*-
"""
掌中光 · 语音克隆合成脚本
用 assets/audio/voice-opening.mp3（老师傅原声）作为音色样本，
克隆音色合成中文短句，输出到 assets/audio/。
依赖：TTS (coqui-tts, XTTS-v2)，以及 imageio-ffmpeg（内置 ffmpeg，用于加载 mp3 参考音频）。
"""
import os
import sys

# 让 torchaudio 能找到 ffmpeg（加载 mp3 参考音频需要）
try:
    import imageio_ffmpeg
    _ff = imageio_ffmpeg.get_ffmpeg_exe()
    _dir = os.path.dirname(_ff)
    os.environ["PATH"] = _dir + os.pathsep + os.environ.get("PATH", "")
    os.environ["FFMPEG_BINARY"] = _ff
    print("[ffmpeg] using:", _ff)
except Exception as e:
    print("[ffmpeg] imageio-ffmpeg 未安装，将依赖系统 ffmpeg:", e)

import torch
from TTS.api import TTS

PROJECT = r"D:/zhangzhongguang"
REF_WAV = os.path.join(PROJECT, "assets/audio/voice-opening.mp3")

# 要合成的文本（按顺序）。可在此扩展更多台词。
TARGETS = [
    ("voice-light-lamp", "点燃油灯吧"),
]

device = "cuda" if torch.cuda.is_available() else "cpu"
print("[device]", device)

print("[load] XTTS-v2 ...")
tts = TTS(model_name="tts_models/multilingual/multi-dataset/xtts_v2").to(device)
print("[load] done")

for name, text in TARGETS:
    out_path = os.path.join(PROJECT, "assets/audio", name + ".wav")
    print(f"[synth] {name} -> {text!r}")
    tts.tts_to_file(
        text=text,
        speaker_wav=REF_WAV,
        language="zh",
        file_path=out_path,
    )
    print("  saved:", out_path)

print("ALL_DONE")
