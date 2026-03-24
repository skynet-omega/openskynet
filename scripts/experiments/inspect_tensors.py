import torch
import os

jepa_path = ".openskynet/omega/jepa_core.pt"
fossil_path = ".openskynet/omega/fossil_memory.pt"

try:
    jepa = torch.load(jepa_path, map_location="cpu", weights_only=True)
    print(f"JEPA Core loaded successfully. Keys: {list(jepa.keys())}")
except Exception as e:
    print(f"Failed to load JEPA: {e}")

try:
    fossil = torch.load(fossil_path, map_location="cpu", weights_only=True)
    print(f"\nFossil Memory loaded successfully. Keys: {list(fossil.keys())}")
    if 'bank_size' in fossil:
        print(f"Current bank_size: {fossil['bank_size'].item()}")
    if 'write_ptr' in fossil:
        print(f"Current write_ptr: {fossil['write_ptr'].item()}")
except Exception as e:
    print(f"Failed to load Fossil: {e}")
