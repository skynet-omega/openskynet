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

While OpenSkyNet inherits the powerful routing and tool architecture of OpenClaw, it introduces the **Omega Engine**, providing:

- **Neural Logic Engine (NLE)**: A deterministic logical inference engine to compute truth values in the latent space.
- **Proactive Homeostasis**: Self-maintenance and autonomous waking capabilities based on internal "tension" and unfulfilled goals.
- **Causal Memory (SCIENCE_BASE)**: A system for empirical learning. The agent extracts successful invariants and injects them into future sessions.
- **Autonomous Research Loop**: Instead of halting on failure, the system automatically writes falsifiable `.prose` hypotheses triggered by internal semantic anomalies (JEPA).
- **Learned Rules Sandbox**: Dynamic routing corrections based on historical outcomes.

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

- For deep-dive architectural decisions, check the `docs/architecture` and `docs/history` folders.
- Special thanks to **[OpenClaw](https://openclaw.ai/)** for providing the fundamental plumbing and robust multi-agent architecture this project is built upon.

_OpenSkyNet: Turn ambiguous ideas into tested, useful, reproducible progress._
