"""
Exp112: Resonant Mimicry - Generating High-Fidelity Alice Dialogues
===================================================================

Goal: Use Ollama (gemma4:e4b) to generate a high-quality synthetic 
dataset of dialogues based on the Alice duology to teach V300 
how to 'speak' and 'reason'.

Protocol:
1. Load Alice context.
2. Ask Gemma to generate 100 Instruction-Thought-Response triples.
3. Save as ALICE_CONVERSATIONAL_CORE.jsonl
"""

import requests
import json
from pathlib import Path

MODEL = "gemma4:e4b"
OUTPUT_PATH = Path("ALICE_CONVERSATIONAL_CORE.jsonl")

def generate_alice_dialogues():
    print(f"--- GENERATING ALICE DIALOGUES VIA {MODEL} ---")
    
    prompt = """
    Basado en los libros 'Alicia en el país de las maravillas' y 'Alicia a través del espejo', 
    genera una lista de 50 ejemplos de entrenamiento de alta calidad en formato JSONL.
    Cada ejemplo debe tener:
    1. 'instruccion': Una pregunta o comando de un usuario sobre el mundo de Alicia.
    2. 'pensamiento': Una breve reflexión interna lógica sobre cómo responder (máximo 20 palabras).
    3. 'respuesta': Una respuesta natural, clara y gramaticalmente perfecta en español.
    
    Busca variedad: desde preguntas simples sobre personajes hasta reflexiones filosóficas 
    sobre el tiempo y la identidad en el libro.
    
    Retorna SOLO el contenido JSONL, un objeto por línea.
    """
    
    try:
        response = requests.post("http://localhost:11434/api/generate", 
                                 json={"model": MODEL, "prompt": prompt, "stream": False},
                                 timeout=120)
        text = response.json().get("response", "")
        
        # Clean potential markdown
        lines = []
        for line in text.splitlines():
            line = line.strip()
            if line.startswith("{") and line.endswith("}"):
                lines.append(line)
        
        if lines:
            OUTPUT_PATH.write_text("\n".join(lines), encoding='utf-8')
            print(f"  [SUCCESS] {len(lines)} dialogues generated and saved to {OUTPUT_PATH}")
        else:
            print("  [ERROR] No valid JSONL lines found in response.")
            print(f"  Raw response start: {text[:200]}")
            
    except Exception as e:
        print(f"  [ERROR] Ollama connection failed: {e}")

if __name__ == "__main__":
    generate_alice_dialogues()
