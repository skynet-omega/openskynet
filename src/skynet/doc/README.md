# Skynet Doc Map

This folder is not a proof archive.
It is a hypothesis library for the `Skynet Brain Lab`.

Use it to decide what to test next.
Do not treat the documents themselves as validation.

## How To Read This Folder

There are three classes of material here:

### 1. Core Thesis

These define the problem and the architectural ambition.

- [analisis.md](/home/daroch/openskynet/src/skynet/doc/analisis.md)
- [problema.md](/home/daroch/openskynet/src/skynet/doc/problema.md)

Use for:

- framing the limits of the current LLM-centric stack
- identifying what kind of "brain" is being searched for
- choosing which variables matter beyond plain accuracy

Risk:

- high narrative density
- easy to over-read as evidence

## 2. Program Documents

These connect the thesis to concrete experimental lines.

- [study_plan_solitonic_foundations.md](/home/daroch/openskynet/src/skynet/doc/study_plan_solitonic_foundations.md)
- [study_legacy_experiments.md](/home/daroch/openskynet/src/skynet/doc/study_legacy_experiments.md)

Use for:

- recovering old experimental families
- extracting mechanisms worth benchmarking again
- avoiding repeated dead ends

## 3. Papers / Technical Inputs

These matter only if they generate a falsable mechanism.

### Morphogenesis / Pattern Formation

- [The Chemical Basis of Morphogenesis.txt](/home/daroch/openskynet/src/skynet/doc/The%20Chemical%20Basis%20of%20Morphogenesis.txt)
- [Lenia and Expanded Universe.txt](/home/daroch/openskynet/src/skynet/doc/Lenia%20and%20Expanded%20Universe.txt)
- [Wolfram-ModelsForPhysics.txt](/home/daroch/openskynet/src/skynet/doc/Wolfram-ModelsForPhysics.txt)

Potential contribution:

- dynamic topology
- self-organization
- phase transition / bifurcation intuition
- non-trivial internal state evolution

Best use:

- generate substrate hypotheses
- not direct runtime integration

### Compression / Memory Efficiency

- [TurboQuant - Online Vector Quantization with Near-optimal Distortion Rate.txt](/home/daroch/openskynet/src/skynet/doc/TurboQuant%20-%20Online%20Vector%20Quantization%20with%20Near-optimal%20Distortion%20Rate.txt)

Potential contribution:

- online compression
- local memory fossilization
- efficient persistent state

Best use:

- memory systems
- embedding/state compression
- cheap durable representation

### Sequence Models / Neural Fast Path

- [Mamba_3_Improved_Sequenc.txt](/home/daroch/openskynet/src/skynet/doc/Mamba_3_Improved_Sequenc.txt)

Potential contribution:

- fast sequence processing
- cheaper recurrence/state updates
- alternatives to transformer-heavy reasoning loops

Best use:

- recurrent executive cores
- low-latency control paths

### Brain Decoding / Structured Perception

- [Brain decoding toward real-time reconstruction of visual perception.txt](/home/daroch/openskynet/src/skynet/doc/Brain%20decoding%20toward%20real-time%20reconstruction%20of%20visual%20perception.txt)
- [Scaling Vision Transformers for Functional MRI with Flat Maps.txt](/home/daroch/openskynet/src/skynet/doc/Scaling%20Vision%20Transformers%20for%20Functional%20MRI%20with%20Flat%20Maps.txt)

Potential contribution:

- substrate-to-latent decoding
- representation geometry
- structured sensing rather than plain text IO

Best use:

- future perception studies
- multimodal or field-to-symbol bridges

## What Actually Helps OpenSkyNet

The docs help when they produce one of these:

- a benchmark dimension that normal architectures miss
- a mechanism small enough to isolate
- a variable worth logging in runtime
- a new failure mode to test for

Examples already seen:

- surprise-gated compute from old `EX` ideas -> transferred into runtime gating
- adaptive local decay -> still alive in lab, not yet promoted
- runtime observer / causal trace learning -> valid lab line with promotion gate

## What Does Not Help

These docs do not help when used as:

- proof that the architecture works
- reason to promote a whole experimental branch
- license to add complexity to the kernel

## Practical Rule

For every document or paper, ask:

1. What mechanism does this suggest?
2. In what task should that mechanism win?
3. Against what baseline?
4. What would falsify it quickly?

If you cannot answer those four questions, keep it as inspiration only.
