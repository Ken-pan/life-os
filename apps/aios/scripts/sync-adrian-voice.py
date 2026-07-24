#!/usr/bin/env python3
"""重生 + 安装 Adrian Lin 的本机克隆参考音(VoiceDesign → Base 克隆管线,同 Leo)。

声线 = C4b「温暖 devoted·近场私密」(Ken 2026-07-24 实听定版)。人设:林知遠·31·
亚裔美籍健康医疗码农;白天能干 tech-lead,私下 sub/bottom(用户主导);英文为主。

关键坑(与 Leo 同):Qwen3-TTS ICL 克隆会把参考音**结尾音素**漏进合成开头(听感
=说话前一声「呼麦」)→ 必须给参考音补 ~0.5s 尾静音。见 ensure_trailing_silence。

用法:python3 apps/aios/scripts/sync-adrian-voice.py
装到:~/.local-ai/voices/adrian/{ref.wav,ref.txt}(运行时) + apps/aios/static/adrian/voice/(前端试听)
"""
import os
import shutil
import subprocess
import wave
from pathlib import Path

APPS = Path(__file__).resolve().parents[2]
VOICE_DESIGN_MODEL = "mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit"
OUT_DIR = APPS / "fitness/tools/gpt-image-runner/character/adrian_lin/voice/reference"

# C4b 定版:英文原生 + 高拟真纹理 + 近场私密(更多气声轻停)
REF_TEXT = (
    "Hey… you're back. I've been waiting for you. Whatever you need tonight — "
    "just tell me, and I'll follow. I'm yours to guide. Take your time with me; I've got you."
)
DESIGN = (
    "Distinctly MALE Asian-American man, age 31, native fluent US English. Clear warm LOW-mid "
    "masculine fundamental — a capable grown man, never female, never boyish, never gravelly "
    "uncle. Character: warm and devoted, steady but attentive and eager-to-please, a touch of "
    "sunny brightness over a low-warm calm base; he hands himself over and wants to be guided — "
    "soft, willing, sincere. High realism and fine detail: natural soft breaths between phrases, "
    "subtle living micro-intonation that rises and falls, gentle warmth blooming on the vowels, "
    "tiny catches and a soft break here and there, a light living vocal texture. A real present "
    "person right next to you — never a flat read-out. Lean closer, close-mic and hushed; softer "
    "breaks, more breath, a quiet intimate hush between phrases."
)
TEMPERATURE = 0.4


def ensure_trailing_silence(path: Path, seconds: float = 0.5) -> None:
    """补足尾静音,根治克隆「说话前呼麦」。幂等:先剪纯零尾帧再补。仅用 stdlib wave。"""
    with wave.open(str(path), "rb") as w:
        ch, sw, fr, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        frames = w.readframes(n)
    fsize = ch * sw
    zero = b"\x00" * fsize
    end = len(frames)
    while end >= fsize and frames[end - fsize : end] == zero:
        end -= fsize
    padded = frames[:end] + zero * int(seconds * fr)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(ch); w.setsampwidth(sw); w.setframerate(fr); w.writeframes(padded)
    print(f"  padded trailing silence -> {seconds}s @ {path.name}")


def generate(out_wav: Path) -> None:
    venv_py = Path.home() / ".local-ai/runtime/mlx/.venv/bin/python"
    if not venv_py.exists():
        venv_py = Path.home() / "Library/Application Support/LocalAI/runtime/mlx/.venv/bin/python"
    if not venv_py.exists():
        raise SystemExit(f"missing mlx venv python near ~/.local-ai/runtime/mlx")
    out_wav.parent.mkdir(parents=True, exist_ok=True)
    for old in out_wav.parent.glob(f"{out_wav.stem}*.wav"):
        old.unlink()
    script = f"""
from mlx_audio.tts.utils import load_model
from mlx_audio.tts.generate import generate_audio
m = load_model({VOICE_DESIGN_MODEL!r})
generate_audio(text={REF_TEXT!r}, model=m, instruct={DESIGN!r}, lang_code="a",
               temperature={TEMPERATURE!r}, use_zero_spk_emb=True,
               output_path={str(out_wav.parent)!r}, file_prefix={out_wav.stem!r},
               audio_format="wav", join_audio=True, play=False, verbose=False)
"""
    subprocess.check_call([str(venv_py), "-c", script])
    produced = sorted(out_wav.parent.glob(f"{out_wav.stem}*.wav"))
    if not produced:
        raise SystemExit("VoiceDesign produced no wav")
    if produced[0] != out_wav:
        shutil.copy2(produced[0], out_wav)


def main() -> int:
    designed = OUT_DIR / "adrian_c4b_ref.wav"
    if not designed.exists() or designed.stat().st_size < 1000:
        generate(designed)
    ensure_trailing_silence(designed, 0.5)  # 防「呼麦」

    runtime = Path.home() / ".local-ai/voices/adrian"
    runtime.mkdir(parents=True, exist_ok=True)
    shutil.copy2(designed, runtime / "ref.wav")
    (runtime / "ref.txt").write_text(REF_TEXT + "\n", encoding="utf-8")
    print("installed runtime ->", runtime)

    static = APPS / "aios/static/adrian/voice"
    static.mkdir(parents=True, exist_ok=True)
    shutil.copy2(designed, static / "ref.wav")
    (static / "ref.txt").write_text(REF_TEXT + "\n", encoding="utf-8")
    print("installed static ->", static)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
