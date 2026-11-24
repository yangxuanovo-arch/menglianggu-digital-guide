#!/usr/bin/env bash
set -euo pipefail
HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
HOME_DIR=${NARRATOR_HOME:-"$HOME/narrator_work/runtime"}
REV=cd4c0465ae0b54a6f85af57f5c65fec9fe23e7f8
mkdir -p "$HOME_DIR"
exec 9>"$HOME_DIR/setup.lock"
flock 9

install_system_packages() {
    if ((EUID == 0)); then
        apt-get update && apt-get install -y "$@"
    elif command -v sudo >/dev/null && sudo -n true 2>/dev/null; then
        sudo -n apt-get update && sudo -n apt-get install -y "$@"
    else
        printf 'Install system prerequisites first: apt-get install %s\n' "$*" >&2
        exit 1
    fi
}
missing=()
for command in git curl ffmpeg ffprobe; do
    command -v "$command" >/dev/null || missing+=("$command")
done
if ((${#missing[@]})); then
    install_system_packages git curl ffmpeg ca-certificates
fi

if [[ ! -x "$HOME_DIR/venv/bin/python" ]]; then
    if command -v python3.10 >/dev/null && python3.10 -m venv "$HOME_DIR/venv"; then
        :
    else
        case $(uname -m) in
            x86_64) arch=x86_64 ;;
            aarch64) arch=aarch64 ;;
            *) echo 'Unsupported CPU architecture' >&2; exit 1 ;;
        esac
        curl -fL --retry 3 "https://github.com/astral-sh/uv/releases/download/0.9.11/uv-${arch}-unknown-linux-gnu.tar.gz" -o "$HOME_DIR/uv.tar.gz"
        tar -xzf "$HOME_DIR/uv.tar.gz" -C "$HOME_DIR"
        "$HOME_DIR/uv-${arch}-unknown-linux-gnu/uv" venv --clear --seed --python 3.10 "$HOME_DIR/venv"
    fi
fi
PYTHON="$HOME_DIR/venv/bin/python"
"$PYTHON" -c 'import sys; assert sys.version_info[:2] == (3, 10), "Python 3.10 is required"'
if ! "$PYTHON" -c 'import ctypes; ctypes.CDLL("libGL.so.1"); ctypes.CDLL("libgthread-2.0.so.0")' 2>/dev/null; then
    install_system_packages libgl1 libglib2.0-0
fi

if [[ ! -d "$HOME_DIR/SadTalker/.git" ]]; then
    git clone https://github.com/OpenTalker/SadTalker.git "$HOME_DIR/SadTalker"
fi
git -C "$HOME_DIR/SadTalker" checkout --detach "$REV"
fingerprint=$(sha256sum "$HERE/requirements.txt" "$HERE/setup.sh" | sha256sum | cut -d' ' -f1)
if [[ ! -f "$HOME_DIR/installed" ]] || [[ $(<"$HOME_DIR/installed") != "$fingerprint" ]]; then
    "$PYTHON" -m pip install 'pip==24.3.1' 'setuptools==69.5.1' 'wheel==0.45.1'
    "$PYTHON" -m pip install 'torch==2.5.1' 'torchvision==0.20.1' --index-url https://download.pytorch.org/whl/cpu
    "$PYTHON" -m pip install --no-build-isolation -r "$HERE/requirements.txt"
    "$PYTHON" - <<'PY'
from pathlib import Path
import sysconfig
path = Path(sysconfig.get_paths()['purelib']) / 'basicsr/data/degradations.py'
source = path.read_text()
path.write_text(source.replace('from torchvision.transforms.functional_tensor import rgb_to_grayscale',
                               'from torchvision.transforms.functional import rgb_to_grayscale'))
PY
    printf '%s\n' "$fingerprint" > "$HOME_DIR/installed"
fi

download() {
    local relative=$1 url=$2
    local target="$HOME_DIR/SadTalker/$relative"
    mkdir -p "$(dirname -- "$target")"
    if [[ ! -s "$target" ]]; then
        curl -fL --retry 3 "$url" -o "$target.part"
        mv "$target.part" "$target"
    fi
}
RELEASE=https://github.com/OpenTalker/SadTalker/releases/download/v0.0.2-rc
download checkpoints/SadTalker_V0.0.2_256.safetensors "$RELEASE/SadTalker_V0.0.2_256.safetensors"
download checkpoints/mapping_00109-model.pth.tar "$RELEASE/mapping_00109-model.pth.tar"
download gfpgan/weights/alignment_WFLW_4HG.pth https://github.com/xinntao/facexlib/releases/download/v0.1.0/alignment_WFLW_4HG.pth
download gfpgan/weights/detection_Resnet50_Final.pth https://github.com/xinntao/facexlib/releases/download/v0.1.0/detection_Resnet50_Final.pth
download gfpgan/weights/GFPGANv1.4.pth https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth
download gfpgan/weights/parsing_parsenet.pth https://github.com/xinntao/facexlib/releases/download/v0.2.2/parsing_parsenet.pth
(cd "$HOME_DIR/SadTalker" && sha256sum --check "$HERE/checkpoints.sha256")
"$PYTHON" -c 'import torch, torchvision, gfpgan, face_alignment, librosa; print("CPU runtime ready:", torch.__version__, torchvision.__version__)'
printf 'NARRATOR_HOME=%s\n' "$HOME_DIR"
