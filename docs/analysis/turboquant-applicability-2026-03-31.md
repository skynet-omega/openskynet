## TurboQuant Applicability

Source reviewed:

- `src/skynet/doc/TurboQuant - Online Vector Quantization with Near-optimal Distortion Rate.txt`

### Best fit inside OpenSkyNet

- The strongest fit is not `session authority`, `world model`, or executive routing.
- The best fit is vector-state storage used by experimental memory systems such as `src/omega/holographic-memory.ts`.
- That area already stores normalized embeddings and computes cosine similarity over persisted vectors.

### Why it fits

- TurboQuant is online and data-oblivious. That matches OpenSkyNet better than codebook-training approaches.
- `holographic-memory` is storage-heavy and experimental enough to tolerate approximate compression with bounded retrieval loss.
- It does not force benchmark/project logic into the authority chain.

### What was implemented now

- Added a small, honest, TurboQuant-inspired path for normalized embedding compression in `src/omega/embedding-quantization.ts`.
- Integrated it into `src/omega/holographic-memory.ts` for newly stored fossils.
- Old fossils with dense embeddings remain readable.

### What was deliberately not done

- No claim that this is the full TurboQuant algorithm from the paper.
- No attempt to quantize `world-model`, `kernel`, or `session authority` state.
- No new learned codebooks or calibration passes.

### Recommended next steps

1. Benchmark cosine-recall impact on `holographic-memory` resonance over larger synthetic fossil sets.
2. If the retrieval loss stays low, evaluate the same approach for `hierarchical-memory` episodic `z_state`.
3. Keep all authority-chain state unquantized unless there is hard evidence that compression is needed there.
