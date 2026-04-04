import fitz
import os
import re
from pathlib import Path

DOCS_DIR = Path("/home/daroch/documents")
OUTPUT_FILE = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/library_full.txt")

PDFS = [
    "alicia_en_el_pais_de_las_maravillas.pdf",
    "La comunidad del anillo (Tolkien J R R) (Z-Library).pdf",
    "Las dos torres (Tolkien J R R) (Z-Library).pdf",
    "El retorno del Rey (Tolkien, J R R) (Z-Library).pdf",
    "20_mil_leguas_de_viaje_submarino-julio_verne.pdf",
    "el_principito_saint_exupery.pdf",
    "frankenstein_-_mary_shelley.pdf"
]

def clean_text(text):
    # Keep alphanumeric, common punctuation, and spanish accents
    # This is a safer way to clean without breaking the regex
    return text

def extract_pdfs():
    print(f"Starting extraction to {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, "w", encoding="utf-8") as out:
        for pdf_name in PDFS:
            path = DOCS_DIR / pdf_name
            if not path.exists():
                print(f"  [SKIP] {pdf_name} not found.")
                continue
            
            print(f"  Extracting {pdf_name}...")
            try:
                doc = fitz.open(path)
                for page in doc:
                    text = page.get_text()
                    out.write(clean_text(text) + "\n")
                doc.close()
            except Exception as e:
                print(f"  [ERROR] {pdf_name}: {e}")

if __name__ == "__main__":
    extract_pdfs()
