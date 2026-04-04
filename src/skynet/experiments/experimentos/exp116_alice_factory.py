"""
Exp116: The Alice Synthetic Factory - Creating specialized data
==============================================================

Protocol:
1. Merge Alicia books into a raw text JSON.
2. Use Ollama (gemma4:e4b) to generate 200 high-quality synthetic 
   training pairs based ONLY on Alice content.
3. Output: alicia_libros.json and alicia_dataset_fine_tuning.json
"""

import json
import requests
import re
from pathlib import Path

DOCS_DIR = Path("/home/daroch/documents")
BOOK1 = DOCS_DIR / "Alicia_en_el_pais_de_las_maravillas.txt"
BOOK2 = DOCS_DIR / "Alicia_a_traves_del_espejo.txt"
LIBROS_JSON = Path("alicia_libros.json")
FINE_TUNING_JSON = Path("alicia_dataset_fine_tuning.jsonl")
MODEL = "gemma4:e4b"

def clean_text(text):
    # Basic cleaning for JSON storage
    return text.replace('\r', '').replace('\t', ' ')

def create_raw_library():
    print("  [Factory] Merging Alicia books...")
    data = {"textos": []}
    for b in [BOOK1, BOOK2]:
        if b.exists():
            content = b.read_text(encoding='utf-8')
            # Split into large chunks (e.g. 2000 chars) to give context to the LLM
            chunks = [clean_text(content[i:i+2000]) for i in range(0, len(content), 2000)]
            data["textos"].extend(chunks)
    
    LIBROS_JSON.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding='utf-8')
    print(f"  [SUCCESS] {len(data['textos'])} chunks saved to {LIBROS_JSON}")
    return data["textos"]

def generate_synthetic_data(chunks):
    print(f"  [Factory] Generating synthetic QA via {MODEL}...")
    
    dataset = []
    # We select 50 random chunks to generate 4 questions per chunk = 200 samples
    sampled_chunks = random.sample(chunks, min(50, len(chunks)))
    
    for i, chunk in enumerate(sampled_chunks):
        prompt = f"""
        Basado en este fragmento de Alicia:
        "{chunk[:1500]}"
        
        Genera 4 ejemplos de entrenamiento en formato JSONL. 
        Cada ejemplo debe ser un objeto en una sola línea con:
        - "contexto": El fragmento relevante del libro.
        - "instruccion": Una pregunta o instrucción sobre el fragmento.
        - "respuesta": Una respuesta clara, natural y perfecta en español.
        - "semantic_role": "Razonamiento" o "Dialogo".
        
        Devuelve SOLO el JSONL, un objeto por línea.
        """
        
        try:
            response = requests.post("http://localhost:11434/api/generate", 
                                     json={"model": MODEL, "prompt": prompt, "stream": False},
                                     timeout=180)
            text = response.json().get("response", "")
            
            # Extract JSON lines
            for line in text.splitlines():
                line = line.strip()
                if line.startswith("{") and line.endswith("}"):
                    dataset.append(line)
            
            if (i+1) % 10 == 0:
                print(f"    Progress: {len(dataset)} samples generated...")
                
        except Exception as e:
            print(f"    [ERROR] Chunk {i}: {e}")

    if dataset:
        FINE_TUNING_JSON.write_text("\n".join(dataset), encoding='utf-8')
        print(f"  [SUCCESS] {len(dataset)} samples saved to {FINE_TUNING_JSON}")
    else:
        print("  [FAIL] No data generated.")

import random
if __name__ == "__main__":
    chunks = create_raw_library()
    generate_synthetic_data(chunks)
