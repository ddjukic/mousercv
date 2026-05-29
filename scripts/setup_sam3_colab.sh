#!/bin/bash
# MouserCV — SAM3 setup for Google Colab
# Run this once per Colab session before running sam3_silhouette.py
#
# Usage: bash scripts/setup_sam3_colab.sh [HF_TOKEN]

set -e

HF_TOKEN="${1:-$HF_TOKEN}"
SAM3_CHECKPOINT="${SAM3_CHECKPOINT:-/content/sam3.pt}"

echo "=== MouserCV SAM3 Setup ==="

# 1. Install native SAM3 from Facebook repo
if python -c "import sam3" 2>/dev/null; then
    echo "[OK] sam3 package already installed"
else
    echo "[1/3] Cloning facebookresearch/sam3 ..."
    if [ ! -d /tmp/sam3_repo ]; then
        git clone --depth 1 https://github.com/facebookresearch/sam3.git /tmp/sam3_repo
    fi
    echo "[2/3] Installing sam3 ..."
    cd /tmp/sam3_repo && pip install -e . -q
    cd -
    echo "[OK] sam3 installed"
fi

# 2. Download sam3.pt if not present
if [ -f "$SAM3_CHECKPOINT" ]; then
    SIZE=$(stat -c%s "$SAM3_CHECKPOINT" 2>/dev/null || stat -f%z "$SAM3_CHECKPOINT")
    echo "[OK] sam3.pt already present ($((SIZE / 1024 / 1024)) MB)"
else
    echo "[3/3] Downloading sam3.pt from HuggingFace ..."
    if [ -z "$HF_TOKEN" ]; then
        echo "ERROR: HF_TOKEN required for gated model download"
        echo "Usage: HF_TOKEN=hf_xxx bash $0"
        exit 1
    fi
    pip install -q huggingface_hub
    python3 -c "
from huggingface_hub import hf_hub_download
import os
hf_hub_download(
    repo_id='facebook/sam3',
    filename='sam3.pt',
    local_dir=os.path.dirname('$SAM3_CHECKPOINT'),
    token='$HF_TOKEN',
)
print('Downloaded sam3.pt')
"
fi

# 3. Verify
echo ""
echo "=== Verification ==="
python3 -c "
import torch
print(f'PyTorch:  {torch.__version__}')
print(f'CUDA:     {torch.cuda.is_available()} ({torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"N/A\"})')
import sam3
print(f'SAM3:     installed')
import os
p = '$SAM3_CHECKPOINT'
if os.path.exists(p):
    print(f'Weights:  {p} ({os.path.getsize(p) // 1024 // 1024} MB)')
else:
    print(f'Weights:  NOT FOUND at {p}')
"

echo ""
echo "=== Ready ==="
echo "Run: python scripts/sam3_silhouette.py \\"
echo "       --video '/content/drive/MyDrive/mousercv/Cage 17082 video.MOV' \\"
echo "       --model $SAM3_CHECKPOINT \\"
echo "       --start 13:50 --end 14:05 \\"
echo "       --text mouse \\"
echo "       --out /tmp/mousercv_sam3_results"
