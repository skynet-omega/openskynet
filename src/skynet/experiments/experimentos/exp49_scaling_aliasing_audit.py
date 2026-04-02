"""
Exp49: Audit of V28/V29 Scaling Interference (The Aliasing Problem)
===================================================================

Hypothesis from Thesis:
"Al escalar grids pequeños (3x3) a grandes (30x30), la interferencia de 
bloques destruye la detección de micro-patrones. La holografía necesita 
Interpolación de Área y Geometric Quantizer para mantener la fidelidad."

This script simulates the aliasing problem when applying Lenia's 
donut kernels to an upscaled grid, and tests the 'Geometric Quantizer' 
(smooth area interpolation + quantization) as a solution.
"""

import torch
import torch.nn.functional as F
import json
from pathlib import Path

# Donut kernel from V28
def _init_ring_kernel(size):
    center = size // 2
    y, x = torch.meshgrid(torch.arange(size), torch.arange(size), indexing='ij')
    dist = torch.sqrt((x - center).float()**2 + (y - center).float()**2)
    radius = size / 3.0
    sigma = size / 6.0
    kernel = torch.exp(-(dist - radius)**2 / (2 * sigma**2))
    return (kernel / kernel.sum()).view(1, 1, size, size)

def audit_scaling_interference():
    # 1. Create a simple 3x3 'micro-pattern' (a single active pixel in the center)
    grid_3x3 = torch.zeros(1, 1, 3, 3)
    grid_3x3[0, 0, 1, 1] = 1.0
    
    # 2. The Lenia Kernel (micro-detector)
    kernel_7x7 = _init_ring_kernel(7)
    pad = 7 // 2
    
    # --- METHOD A: Naive Scaling (Nearest Neighbor / Blocky) ---
    grid_30x30_naive = F.interpolate(grid_3x3, size=(30, 30), mode='nearest')
    
    # Apply Lenia physics
    padded_naive = F.pad(grid_30x30_naive, (pad, pad, pad, pad), mode='constant', value=0)
    response_naive = F.conv2d(padded_naive, kernel_7x7)
    
    # A single pixel scaled up becomes a 10x10 block.
    # The Lenia kernel should ideally fire once for the "object".
    # Instead, with naive scaling, the kernel fires all along the inner perimeter of the 10x10 block,
    # creating a "ring of fire" (multiple false detections).
    # We measure this by counting how many local maxima exist in the response.
    
    def count_local_maxima(tensor):
        max_pool = F.max_pool2d(tensor, kernel_size=3, stride=1, padding=1)
        return ((tensor == max_pool) & (tensor > 0.1)).sum().item()
        
    false_detections_naive = count_local_maxima(response_naive)
    
    # --- METHOD B: Geometric Quantizer (Bilinear/Gaussian Blur + MaxPool Snapping) ---
    # The thesis says "Interpolación de Área y Geometric Quantizer".
    # If we scale up, we want the object to remain a single cohesive Gaussian-like blob 
    # for the micro-kernel, or we need to scale the kernel (which V28 does with multi-scale).
    # But if the kernel is fixed, the Geometric Quantizer must convert the 10x10 block 
    # back into a smooth shape that has ONLY ONE center of mass.
    
    grid_30x30_area = F.interpolate(grid_3x3, size=(30, 30), mode='bilinear', align_corners=False)
    
    # Geometric Quantizer: Apply a Gaussian blur to round the corners of the block,
    # then apply a slight exponentiation to "snap" the core.
    blur_kernel = torch.tensor([[[[1, 2, 1], [2, 4, 2], [1, 2, 1]]]], dtype=torch.float32) / 16.0
    blurred = F.conv2d(F.pad(grid_30x30_area, (1, 1, 1, 1), mode='replicate'), blur_kernel)
    grid_30x30_quantized = torch.pow(blurred, 2.0) # Core snapping
    
    padded_quantized = F.pad(grid_30x30_quantized, (pad, pad, pad, pad), mode='constant', value=0)
    response_quantized = F.conv2d(padded_quantized, kernel_7x7)
    
    false_detections_quantized = count_local_maxima(response_quantized)
    
    report = {
        "experiment": "exp49_scaling_aliasing_audit",
        "problem_description": "A single dot scaled 10x becomes a 10x10 block. Lenia kernel fires on all its edges.",
        "naive_scaling": {
            "false_detections": false_detections_naive
        },
        "geometric_quantizer": {
            "false_detections": false_detections_quantized
        },
        "conclusion": "VERIFIED" if false_detections_quantized < false_detections_naive else "FAILED"
    }
    
    Path("exp49_scaling_audit.json").write_text(json.dumps(report, indent=2))

    print(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    audit_scaling_interference()
