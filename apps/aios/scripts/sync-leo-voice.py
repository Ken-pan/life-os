#!/usr/bin/env python3
"""Download Leo voice candidates + generate VoiceDesign reference clip."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

# apps/aios/scripts → apps/fitness/.../leo_kuft/voice
APPS = Path(__file__).resolve().parents[2]
VOICE_DIR = APPS / "fitness/tools/gpt-image-runner/character/leo_kuft/voice"
CAND_DIR = VOICE_DIR / "candidates"
REF_DIR = VOICE_DIR / "reference"
MANIFEST = VOICE_DIR / "manifest.json"

STABLE = {
    # early-20s casual American — best Leo match among free StableVoice samples
    "andy": {
        "url": "https://stablevoice.dev/samples/voices/andy.mp3",
        "why": "Casual American male, laid-back guy in his 20s/30s — closest free match for young US boyfriend energy.",
        "score": 4.5,
        "ref_text": "This sample is legally a vibe, technically a waveform.",
    },
    "ethan": {
        "url": "https://stablevoice.dev/samples/voices/ethan.mp3",
        "why": "Upbeat North American male, clear and brisk — youthful athletic cadence.",
        "score": 4.0,
        "ref_text": "Audio sample number nine is feeling extremely compiled.",
    },
    "dylan": {
        "url": "https://stablevoice.dev/samples/voices/dylan.mp3",
        "why": "Relaxed American male, natural understated — intimate everyday tone.",
        "score": 3.8,
        "ref_text": "If this loads fast, pretend I planned it that way.",
    },
}

QWEN_CLONE_DEMO = {
    "url": "https://qianwen-res.oss-cn-beijing.aliyuncs.com/Qwen3-TTS-Repo/clone.wav",
    "name": "qwen_official_clone_demo.wav",
    "why": "Official Qwen3-TTS clone demo clip (format reference only, not Leo persona).",
}

VOICE_DESIGN_MODEL = "mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit"
BASE_CLONE_MODEL = "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit"

LEO_DESIGN = (
    'A tender American boy of 18 or 19 whose voice is mid-change. Warm, round, velvety core — comforting like a young man — but still light on top with an airy edge and soft, occasional voice-cracks that slip between registers. Native US English, relaxed. Slow, unhurried, quietly seductive and affectionate, completely at ease with you. Intimate close-mic. Youthful, not deep, not a grown adult — just-maturing warmth. High realism and detail: natural soft breaths between phrases, subtle living intonation that rises and falls, gentle warmth blooming on the vowels, tiny catches and a light break here and there. Expressive but understated — a real person, not a read-out.'
)

LEO_REF_TEXT = (
    "Hey… you're back. Mmm, come here — I missed you. Yeah, just like that. Stay."
)


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"GET {url} -> {dest}")
    req = urllib.request.Request(url, headers={"User-Agent": "life-os-leo-voice/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
        shutil.copyfileobj(r, f)
    print(f"  bytes={dest.stat().st_size}")


def ensure_hf_model(repo: str) -> None:
    print(f"HF download {repo}")
    subprocess.check_call(["huggingface-cli", "download", repo])


def ensure_trailing_silence(path: Path, seconds: float = 0.5) -> None:
    """给克隆参考音补足尾部静音,根治「说话前一声呼麦」。

    Qwen3-TTS 的 ICL 语音克隆坑:生成的第一个 token 会受参考音**结尾音素**
    影响,ref 尾部不够静就把气声/尾音漏进合成开头(听感 = 说话前一声「呼麦」)。
    官方修法是给参考音补 ~0.5s 尾静音再编码。见:
    https://ocdevel.com/blog/20260302-qwen-tts-voice-cloning

    幂等:先剪掉已有的纯零尾帧,再补足 ``seconds``——重复 sync 不会越补越长。
    仅用标准库 ``wave``,不引 numpy。
    """
    import wave

    with wave.open(str(path), "rb") as w:
        ch, sw, fr, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        frames = w.readframes(n)
    fsize = ch * sw
    zero = b"\x00" * fsize
    end = len(frames)
    while end >= fsize and frames[end - fsize : end] == zero:
        end -= fsize  # 剪掉尾部纯零帧(幂等关键)
    padded = frames[:end] + zero * int(seconds * fr)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(ch)
        w.setsampwidth(sw)
        w.setframerate(fr)
        w.writeframes(padded)
    print(f"  padded trailing silence -> {seconds}s @ {path.name}")


def generate_voice_design(out_wav: Path) -> Path:
    venv_py = (
        Path.home()
        / "Library/Application Support/LocalAI/runtime/mlx/.venv/bin/python"
    )
    if not venv_py.exists():
        raise SystemExit(f"missing mlx venv python: {venv_py}")
    out_wav.parent.mkdir(parents=True, exist_ok=True)
    # Clear old numbered chunks so we can pick the newest cleanly
    for old in out_wav.parent.glob(f"{out_wav.stem}*.wav"):
        old.unlink()

    script = f"""
from pathlib import Path
from mlx_audio.tts.utils import load_model
from mlx_audio.tts.generate import generate_audio

model = load_model({VOICE_DESIGN_MODEL!r})
out = Path({str(out_wav.parent)!r})
generate_audio(
    text={LEO_REF_TEXT!r},
    model=model,
    instruct={LEO_DESIGN!r},
    speed=1.0,
    lang_code="a",
    output_path=str(out),
    file_prefix={out_wav.stem!r},
    audio_format="wav",
    join_audio=True,
    play=False,
    verbose=True,
)
print("wrote", sorted(out.glob({out_wav.stem!r} + "*.wav")))
"""
    subprocess.check_call([str(venv_py), "-c", script])
    produced = sorted(out_wav.parent.glob(f"{out_wav.stem}*.wav"))
    if not produced:
        raise SystemExit("VoiceDesign produced no wav")
    if produced[0] != out_wav:
        shutil.copy2(produced[0], out_wav)
    return out_wav


def main() -> int:
    CAND_DIR.mkdir(parents=True, exist_ok=True)
    REF_DIR.mkdir(parents=True, exist_ok=True)

    entries = []
    for name, meta in STABLE.items():
        dest = CAND_DIR / f"stablevoice_{name}.mp3"
        if not dest.exists() or dest.stat().st_size < 1000:
            download(meta["url"], dest)
        entries.append(
            {
                "id": f"stablevoice_{name}",
                "path": str(dest.relative_to(VOICE_DIR)),
                "source": meta["url"],
                "why": meta["why"],
                "score": meta["score"],
                "role": "candidate_preview",
                "ref_text": meta["ref_text"],
            }
        )

    demo = REF_DIR / QWEN_CLONE_DEMO["name"]
    if not demo.exists():
        download(QWEN_CLONE_DEMO["url"], demo)
    entries.append(
        {
            "id": "qwen_official_clone_demo",
            "path": str(demo.relative_to(VOICE_DIR)),
            "source": QWEN_CLONE_DEMO["url"],
            "why": QWEN_CLONE_DEMO["why"],
            "role": "format_demo",
        }
    )

    preferred = CAND_DIR / "stablevoice_andy.mp3"
    preferred_link = REF_DIR / "leo_preferred_ref.mp3"
    if preferred.exists():
        shutil.copy2(preferred, preferred_link)
        entries.append(
            {
                "id": "leo_preferred_ref",
                "path": str(preferred_link.relative_to(VOICE_DIR)),
                "source": STABLE["andy"]["url"],
                "why": "Primary free clone reference (StableVoice Andy).",
                "role": "clone_reference",
                "ref_text": STABLE["andy"]["ref_text"],
            }
        )

    ensure_hf_model(VOICE_DESIGN_MODEL)
    ensure_hf_model(BASE_CLONE_MODEL)

    designed = REF_DIR / "leo_voicedesign_ref.wav"
    if not designed.exists() or designed.stat().st_size < 1000:
        generate_voice_design(designed)
    # 补尾静音,消除克隆语音「说话前呼麦」伪影(幂等,详见函数注释)
    ensure_trailing_silence(designed, 0.5)
    entries.append(
        {
            "id": "leo_voicedesign_ref",
            "path": str(designed.relative_to(VOICE_DIR)),
            "source": VOICE_DESIGN_MODEL,
            "why": "Qwen3 VoiceDesign clip from Leo persona prompt (young US sexy athletic BF).",
            "role": "designed_reference",
            "ref_text": LEO_REF_TEXT,
            "design": LEO_DESIGN,
        }
    )

    # Install runtime files for LocalAI speech shell + aios static audition
    runtime = Path.home() / ".local-ai/voices/leo"
    runtime.mkdir(parents=True, exist_ok=True)
    shutil.copy2(designed, runtime / "ref.wav")
    (runtime / "ref.txt").write_text(LEO_REF_TEXT + "\n", encoding="utf-8")
    print("installed runtime ->", runtime)

    static = APPS / "aios/static/leo/voice"
    static.mkdir(parents=True, exist_ok=True)
    shutil.copy2(designed, static / "ref.wav")
    for mp3 in CAND_DIR.glob("stablevoice_*.mp3"):
        shutil.copy2(mp3, static / mp3.name)
    print("installed static ->", static)

    manifest = {
        "updated": "2026-07-23",
        "persona": "Leo Kuft",
        "goal": "younger / more American / sexier than stock Aiden",
        "models": {
            "voiceDesign": VOICE_DESIGN_MODEL,
            "baseClone": BASE_CLONE_MODEL,
            "currentCustomVoice": "mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit",
        },
        "preferredCloneRef": "reference/leo_voicedesign_ref.wav",
        "fallbackCloneRef": "reference/leo_preferred_ref.mp3",
        "runtimeInstall": str(runtime),
        "files": entries,
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print("manifest ->", MANIFEST)
    return 0


if __name__ == "__main__":
    sys.exit(main())
