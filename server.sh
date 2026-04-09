#!/bin/bash

set -eu

# Multi-GPU: set GGML_BACKEND to pick a device (CUDA0, CUDA1, Vulkan0...)
#export GGML_BACKEND=CUDA0
#export GGML_BACKEND=Vulkan0

# Create output directory for generation metadata
mkdir -p ../generations

CUDA_VISIBLE_DEVICES=1 ./build/ace-server \
    --host 0.0.0.0 \
    --port 8085 \
    --models ../models/cuda \
    --loras ./loras \
    --max-batch 1 \
    --output-dir ../generations