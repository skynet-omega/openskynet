import json
import sys
import torch
import os
from .components import JEPAPredictor, EpisodicFossilMemory

def compute_tension_signal(payload: dict) -> dict:
    """
    Calcula señal de tensión basada en frustración Termodinámica (JEPA) con persistencia.
    
    Args:
        payload: { "workspaceRoot": str, "kernel": dict }
    """
    workspace_root = payload.get("workspaceRoot", ".")
    kernel_state = payload.get("kernel", {})
    
    # Rutas de persistencia bajo .openskynet/omega/
    omega_dir = os.path.join(workspace_root, ".openskynet", "omega")
    os.makedirs(omega_dir, exist_ok=True)
    
    checkpoint_path = os.path.join(omega_dir, "jepa_core.pt")
    memory_path = os.path.join(omega_dir, "fossil_memory.pt")
    
    d_state = 64
    predictor = JEPAPredictor(d_state=d_state, device="cpu")
    memory = EpisodicFossilMemory(d_state=d_state, device="cpu")
    
    # Cargar estado previo si existe
    if os.path.exists(checkpoint_path):
        try:
            predictor.load_state_dict(torch.load(checkpoint_path, map_location="cpu"))
        except:
            pass
            
    if os.path.exists(memory_path):
        try:
            memory.load_state(torch.load(memory_path, map_location="cpu"))
        except:
            pass
    
    timeline = kernel_state.get("timeline", [])
    if len(timeline) < 2:
        return {"frustration": 0.0, "confidence": 0.0}
    
    # Extraer métricas reales (Somatic Mapping)
    states = []
    for entry in timeline[-8:]:
        outcome = entry.get("outcome", {})
        status_val = 1.0 if outcome.get("status") == "ok" else 0.0
        lines_changed = float(len(outcome.get("observedChangedFiles", [])))
        structured_ok = 1.0 if outcome.get("structuredOk") else 0.0
        write_ok = 1.0 if outcome.get("writeOk") else 0.0
        turn_norm = entry.get("turn", 0) / 100.0
        
        feature_vector = [status_val, lines_changed * 0.1, structured_ok, write_ok, turn_norm]
        states.append(feature_vector)
    
    def to_dstate(s):
        t = torch.zeros(d_state)
        t[:len(s)] = torch.tensor(s, dtype=torch.float32)
        return t

    z_curr = to_dstate(states[-2]).unsqueeze(0)
    z_next = to_dstate(states[-1]).unsqueeze(0)
    
    # Cálculo JEPA
    predictor.train() # Habilitamos gradientes si quisiéramos updatear online
    h_pred, jepa_loss, frustration_tensor = predictor(z_curr, z_next)
    
    # Fossilización (Memoria de largo plazo inspirada en SKYNET_OMEGA_CORE)
    # Si la frustración es alta o el éxito es alto, grabamos el fósil
    if float(jepa_loss) > 0.05 or states[-1][0] > 0.9:
        memory.fossilize(h_pred.detach())
    
    # Guardar estados para el siguiente latido (PERSISTENCIA)
    torch.save(predictor.state_dict(), checkpoint_path)
    torch.save(memory.get_state(), memory_path)
    
    raw_loss = float(jepa_loss)
    normalized_frustration = min(1.0, raw_loss * 2.0)
    
    return {
        "frustration": normalized_frustration,
        "confidence": min(1.0, len(timeline) / 8.0),
        "raw_jepa_loss": raw_loss,
        "memory_bank_size": len(memory.fossil_bank) if hasattr(memory, 'fossil_bank') else 0
    }

if __name__ == "__main__":
    try:
        input_data = sys.stdin.read()
        if not input_data:
            print(json.dumps({"error": "No input"}))
            sys.exit(0)
            
        payload = json.loads(input_data)
        # Soportar legacy (si solo llega el kernel directamente)
        if "timeline" in payload and "workspaceRoot" not in payload:
            payload = {"workspaceRoot": ".", "kernel": payload}
            
        result = compute_tension_signal(payload)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
