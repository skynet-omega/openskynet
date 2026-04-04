"""
Exp116_v2: The Alice High-Quality Factory
=========================================

Goal: Use the larger Gemma 4 model (26b) to generate 
perfect Spanish synthetic data for Alice in Wonderland.

Fixes:
1. Model: Switched to gemma4:26b for better reasoning and grammar.
2. Encoding: Explicit UTF-8 handling and ensure_ascii=False.
3. Quality: Prompting for perfect Spanish accents and punctuation.
"""

import json
import requests
import random
import re
from pathlib import Path

DOCS_DIR = Path("/home/daroch/documents")
BOOK1 = DOCS_DIR / "Alicia_en_el_pais_de_las_maravillas.txt"
BOOK2 = DOCS_DIR / "Alicia_a_traves_del_espejo.txt"
FINE_TUNING_JSON = Path("alicia_dataset_high_quality.jsonl")
MODEL = "gemma4:26b"

def clean_text(text):
    return text.replace('\r', '').replace('\t', ' ')

def get_chunks():
    chunks = []
    for b in [BOOK1, BOOK2]:
        if b.exists():
            content = b.read_text(encoding='utf-8')
            chunks.extend([clean_text(content[i:i+1500]) for i in range(0, len(content), 1500)])
    return chunks

def generate_hq_data(n_chunks=5):
    print(f"--- GENERATING HQ ALICE DATA VIA {MODEL} ---")
    chunks = get_chunks()
    sampled_chunks = random.sample(chunks, min(n_chunks, len(chunks)))
    
    count = 0
    with open(FINE_TUNING_JSON, "w", encoding="utf-8") as f:
        for i, chunk in enumerate(sampled_chunks):
            prompt = f"""
            ACTÚA COMO UN LINGÜISTA EXPERTO EN LITERATURA ESPAÑOLA.
            Basado en este fragmento de Lewis Carroll:
            "{chunk}"
            
            Genera 2 ejemplos de entrenamiento PERFECTOS en formato JSONL.
            REGLAS CRÍTICAS:
            1. NO omitas caracteres. Usa tildes (á, é, í, ó, ú) y la letra ñ correctamente.
            2. La gramática debe ser impecable y natural.
            3. Formato: {{"contexto": "...", "instruccion": "...", "respuesta": "...", "semantic_role": "..."}}
            4. Devuelve SOLO el JSONL, un objeto por línea. No incluyas explicaciones.
            """
            
            try:
                response = requests.post("http://localhost:11434/api/generate", 
                                         json={"model": MODEL, "prompt": prompt, "stream": False},
                                         timeout=300)
                text = response.json().get("response", "").strip()
                
                for line in text.splitlines():
                    line = line.strip()
                    if line.startswith("{") and line.endswith("}"):
                        try:
                            obj = json.loads(line)
                            json_line = json.dumps(obj, ensure_ascii=False)
                            f.write(json_line + "\n")
                            f.flush()
                            count += 1
                        except: continue
                
                print(f"    Processed chunk {i+1}/{n_chunks}. Total samples: {count}")
                    
            except Exception as e:
                print(f"    [ERROR] Chunk {i}: {e}")

    print(f"  [SUCCESS] {count} HQ samples saved to {FINE_TUNING_JSON}")

if __name__ == "__main__":
    generate_hq_data(5)
