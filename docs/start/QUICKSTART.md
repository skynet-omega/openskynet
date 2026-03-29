# OpenSkyNet Quickstart

This is the shortest practical path for a fresh machine.

## Requirements

- Node `22.22.1+`
- `pnpm 10.23.0+`

## Install

```bash
git clone https://github.com/skynet-omega/openskynet.git
cd openskynet
pnpm install
pnpm build
```

If you need optional native integrations such as TensorFlow GPU or other native add-ons:

```bash
pnpm approve-builds
```

## First setup

```bash
./openskynet.mjs setup
./openskynet.mjs configure
```

That initializes config, workspace, and the local runtime shape.

## First ways to use it

Development gateway:

```bash
pnpm gateway:dev
```

Terminal UI:

```bash
pnpm tui
```

Dashboard URL only:

```bash
./openskynet.mjs dashboard --no-open
```

One direct agent turn:

```bash
./openskynet.mjs agent --session-id demo --message "Hello"
```

## Notes

- Experimental subsystems under `Omega` and `Skynet` are included, but they are not required for a basic install.
- TTS, GPU TensorFlow, and other heavier components are optional and may need extra machine-specific setup.
- Rolling runtime logs live under `/tmp/openclaw/` unless you change logging config.
