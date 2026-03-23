import json
import torch

def run_smoke():
    print(
        json.dumps(
            {
                "ok": True,
                "core_profile": f"torch-{torch.__version__}",
                "available_profiles": ["torch"],
                "n_input": 0,
                "n_actions": 0,
                "d_state": 0,
            }
        )
    )

if __name__ == "__main__":
    run_smoke()
