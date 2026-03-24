# OpenSkyNet 🤖

![Banner](assets/banner.png)

_Read this in [Spanish (Español)](README.es.md)._

**OpenSkyNet** is the scientific and practical evolution of [OpenClaw](https://github.com/openclaw/openclaw).

Unlike generic "chat with tools" agents, OpenSkyNet focuses on **real, long-term autonomy, causal reasoning, and empirical validation** of AI systems. It is designed to be a robust engineering and scientific assistant that thinks beyond single conversational turns.

## Official Repository

Active development and issues are tracked at:
[github.com/skynet-omega/openskynet](https://github.com/skynet-omega/openskynet)

---

## 🚀 Key Differences from OpenClaw

While **OpenClaw** is a powerful, general-purpose multi-agent framework for routing and tool execution, **OpenSkyNet** is a fully realized, single **Autonomous Entity** built on top of it. It introduces the **Omega Engine**, shifting the paradigm from a reactive assistant to a proactive, biologically-inspired researcher:

- **Biological Inspiration (Drosophila Model)**: The architecture mimics cognitive processes, including frustration, energy bounds, and attention decay, rather than just executing endless loops.
- **Inner Life & Proactive Homeostasis**: OpenSkyNet has "internal drives" (tension). It does not wait for user prompts to act; it can wake itself up to perform self-maintenance or resume unfulfilled goals based on internal tension.
- **Neural Logic Engine (NLE)**: A deterministic logical inference engine that computes truth values and contradictions in the latent space before taking physical action.
- **Causal Memory (SCIENCE_BASE)**: Unlike traditional RAG (Retrieval-Augmented Generation) which just fetches old text, OpenSkyNet performs empirical learning. It extracts successful invariants from past tasks and injects them as forced rules into future sessions.
- **Autonomous Research Loop**: Instead of halting on an error and asking the user, the system automatically writes falsifiable `.prose` hypotheses triggered by internal semantic anomalies (evaluated by a JEPA-like mechanism) and tests them.
- **Learned Rules Sandbox**: Dynamic, persistent routing corrections based on historical outcomes. If a tool fails twice, the system learns to route around the problem permanently.

---

## 🛠️ Installation

OpenSkyNet requires **Node.js 22+** and **pnpm**.

```bash
# Clone the repository
git clone https://github.com/skynet-omega/openskynet.git

# Navigate to the project folder
cd openskynet

# Install dependencies using pnpm
pnpm install

# Build the project
pnpm build
```

## 🖥️ Running OpenSkyNet

For a standard graphical experience, you can start the UI in two separate terminals:

**Terminal 1 (Backend Gateway):**

```bash
pnpm dev:gateway
```

**Terminal 2 (Frontend UI):**

```bash
pnpm dev:ui
```

### Full Autonomous Mode (TUI Daemon)

OpenSkyNet includes a Terminal User Interface (TUI) daemon designed for full autonomous mode and monitoring.

```bash
pnpm start:daemon
```

_Note: Make sure to review the `.env.example` and set up your required API keys (e.g., Gemini, Anthropic) before starting._

---

## 📚 Acknowledgments & Documentation

- **Author**: Gonzalo Daroch I.
- For deep-dive architectural decisions, check the `docs/architecture` and `docs/history` folders.
- Special thanks to **[OpenClaw](https://openclaw.ai/)** for providing the fundamental plumbing and robust multi-agent architecture this project is built upon.

_OpenSkyNet: Turn ambiguous ideas into tested, useful, reproducible progress._
