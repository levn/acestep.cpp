#!/bin/bash

rm -rf build
mkdir build
cd build

cmake .. -DGGML_CUDA=ON -DCMAKE_CUDA_COMPILER=/usr/local/cuda-12.8/bin/nvcc -DCMAKE_CUDA_ARCHITECTURES="75;89"
cmake --build . --config Release -j "$(nproc)"
