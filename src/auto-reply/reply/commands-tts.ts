import { execSync } from "node:child_process";
import { logVerbose } from "../../globals.js";
import {
  getLastTtsAttempt,
  getTtsLanguage,
  getTtsFormat,
  getTtsMaxLength,
  getTtsProvider,
  getTtsVoice,
  isSummarizationEnabled,
  setTtsAutoMode,
  isTtsEnabled,
  isTtsProviderConfigured,
  resolveTtsApiKey,
  resolveTtsAutoMode,
  resolveTtsConfig,
  resolveTtsPrefsPath,
  setLastTtsAttempt,
  setSummarizationEnabled,
  setTtsEnabled,
  setTtsLanguage,
  setTtsFormat,
  setTtsMaxLength,
  setTtsProvider,
  setTtsVoice,
  textToSpeech,
} from "../../tts/tts.js";
import type { ReplyPayload } from "../types.js";
import type { CommandHandler } from "./commands-types.js";

type ParsedTtsCommand = {
  action: string;
  args: string;
};

function parseTtsCommand(normalized: string): ParsedTtsCommand | null {
  // Accept `/tts` and `/tts <action> [args]` as a single control surface.
  if (normalized === "/tts") {
    return { action: "status", args: "" };
  }
  if (!normalized.startsWith("/tts ")) {
    return null;
  }
  const rest = normalized.slice(5).trim();
  if (!rest) {
    return { action: "status", args: "" };
  }
  const [action, ...tail] = rest.split(/\s+/);
  return { action: action.toLowerCase(), args: tail.join(" ").trim() };
}

function ttsUsage(): ReplyPayload {
  // Keep usage in one place so help/validation stays consistent.
  return {
    text:
      `🔊 **TTS (Text-to-Speech) Help**\n\n` +
      `**Commands:**\n` +
      `• /tts on — Enable automatic TTS for replies\n` +
      `• /tts off — Disable TTS\n` +
      `• /tts always|inbound|tagged — Set auto-TTS mode\n` +
      `• /tts status — Show current settings\n` +
      `• /tts provider [name] — View/change provider\n` +
      `• /tts idiom [es|en] — View/change language (AllTalk)\n` +
      `• /tts voice [name] — View/change voice (AllTalk)\n` +
      `• /tts format [opus|wav] — View/change output format (AllTalk)\n` +
      `• /tts log — Show recent AllTalk service logs\n` +
      `• /tts limit [number] — View/change text limit\n` +
      `• /tts summary [on|off] — View/change auto-summary\n` +
      `• /tts audio <text> — Generate audio from text\n\n` +
      `**Providers:**\n` +
      `• edge — Free, fast (default)\n` +
      `• alltalk — Local AllTalk server\n` +
      `• openai — High quality (requires API key)\n` +
      `• elevenlabs — Premium voices (requires API key)\n\n` +
      `**Text Limit (default: 1500, max: 4096):**\n` +
      `When text exceeds the limit:\n` +
      `• Summary ON: AI summarizes, then generates audio\n` +
      `• Summary OFF: Truncates text, then generates audio\n\n` +
      `**Examples:**\n` +
      `/tts tagged\n` +
      `/tts provider alltalk\n` +
      `/tts provider edge\n` +
      `/tts limit 2000\n` +
      `/tts audio Hello, this is a test!`,
  };
}

export const handleTtsCommands: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) {
    return null;
  }
  const parsed = parseTtsCommand(params.command.commandBodyNormalized);
  if (!parsed) {
    return null;
  }

  if (!params.command.isAuthorizedSender) {
    logVerbose(
      `Ignoring TTS command from unauthorized sender: ${params.command.senderId || "<unknown>"}`,
    );
    return { shouldContinue: false };
  }

  const config = resolveTtsConfig(params.cfg);
  const prefsPath = resolveTtsPrefsPath(config);
  const action = parsed.action;
  const args = parsed.args;

  if (action === "help") {
    return { shouldContinue: false, reply: ttsUsage() };
  }

  if (action === "on") {
    setTtsEnabled(prefsPath, true);
    return { shouldContinue: false, reply: { text: "🔊 TTS enabled." } };
  }

  if (action === "off") {
    setTtsEnabled(prefsPath, false);
    return { shouldContinue: false, reply: { text: "🔇 TTS disabled." } };
  }

  if (action === "always" || action === "inbound" || action === "tagged") {
    setTtsAutoMode(prefsPath, action);
    return {
      shouldContinue: false,
      reply: { text: `✅ TTS auto mode set to ${action}.` },
    };
  }

  if (action === "audio") {
    if (!args.trim()) {
      return {
        shouldContinue: false,
        reply: {
          text:
            `🎤 Generate audio from text.\n\n` +
            `Usage: /tts audio <text>\n` +
            `Example: /tts audio Hello, this is a test!`,
        },
      };
    }

    const start = Date.now();
    const result = await textToSpeech({
      text: args,
      cfg: params.cfg,
      channel: params.command.channel,
      prefsPath,
    });

    if (result.success && result.audioPath) {
      // Store last attempt for `/tts status`.
      setLastTtsAttempt({
        timestamp: Date.now(),
        success: true,
        textLength: args.length,
        summarized: false,
        provider: result.provider,
        latencyMs: result.latencyMs,
      });
      const payload: ReplyPayload = {
        mediaUrl: result.audioPath,
        audioAsVoice: result.voiceCompatible === true,
      };
      return { shouldContinue: false, reply: payload };
    }

    // Store failure details for `/tts status`.
    setLastTtsAttempt({
      timestamp: Date.now(),
      success: false,
      textLength: args.length,
      summarized: false,
      error: result.error,
      latencyMs: Date.now() - start,
    });
    return {
      shouldContinue: false,
      reply: { text: `❌ Error generating audio: ${result.error ?? "unknown error"}` },
    };
  }

  if (action === "provider") {
    const currentProvider = getTtsProvider(config, prefsPath);
    if (!args.trim()) {
      const hasOpenAI = Boolean(resolveTtsApiKey(config, "openai"));
      const hasElevenLabs = Boolean(resolveTtsApiKey(config, "elevenlabs"));
      const hasEdge = isTtsProviderConfigured(config, "edge");
      const hasAllTalk = isTtsProviderConfigured(config, "alltalk");
      return {
        shouldContinue: false,
        reply: {
          text:
            `🎙️ TTS provider\n` +
            `Primary: ${currentProvider}\n` +
            `OpenAI key: ${hasOpenAI ? "✅" : "❌"}\n` +
            `ElevenLabs key: ${hasElevenLabs ? "✅" : "❌"}\n` +
            `Edge enabled: ${hasEdge ? "✅" : "❌"}\n` +
            `AllTalk available: ${hasAllTalk ? "✅" : "❌"}\n` +
            `Usage: /tts provider openai | elevenlabs | edge | alltalk`,
        },
      };
    }

    const requested = args.trim().toLowerCase();
    if (
      requested !== "openai" &&
      requested !== "elevenlabs" &&
      requested !== "edge" &&
      requested !== "alltalk"
    ) {
      return { shouldContinue: false, reply: ttsUsage() };
    }

    setTtsProvider(prefsPath, requested);
    return {
      shouldContinue: false,
      reply: { text: `✅ TTS provider set to ${requested}.` },
    };
  }

  if (action === "idiom" || action === "lang") {
    if (!args.trim()) {
      const currentLang = getTtsLanguage(config, prefsPath);
      return {
        shouldContinue: false,
        reply: {
          text: `🌐 Current TTS language (AllTalk): ${currentLang}\nUsage: /tts idiom <es|en>`,
        },
      };
    }
    const requested = args.trim().toLowerCase();
    if (requested !== "es" && requested !== "en") {
      return {
        shouldContinue: false,
        reply: { text: "❌ Supported idioms: es (Spanish), en (English)" },
      };
    }
    setTtsLanguage(prefsPath, requested);
    return {
      shouldContinue: false,
      reply: { text: `✅ TTS language set to ${requested}.` },
    };
  }

  if (action === "voice") {
    if (!args.trim()) {
      const currentVoice = getTtsVoice(config, prefsPath);
      return {
        shouldContinue: false,
        reply: {
          text: `🗣️ Current AllTalk voice: ${currentVoice}\nUsage: /tts voice <name>\nExample: /tts voice Zelda`,
        },
      };
    }
    let requested = args.trim();
    // Handle specific alias for Alicia_
    if (requested.toLowerCase() === "alicia") {
      requested = "Alicia_";
    }
    if (!requested.toLowerCase().endsWith(".wav")) {
      requested += ".wav";
    }
    setTtsVoice(prefsPath, requested);
    return {
      shouldContinue: false,
      reply: { text: `✅ TTS voice set to ${requested}. Preferences saved to ${prefsPath}` },
    };
  }

  if (action === "format") {
    if (!args.trim()) {
      const currentFormat = getTtsFormat(prefsPath);
      return {
        shouldContinue: false,
        reply: {
          text: `📦 Current TTS format (AllTalk): ${currentFormat}\nUsage: /tts format <opus|wav>`,
        },
      };
    }
    const requested = args.trim().toLowerCase();
    if (requested !== "opus" && requested !== "wav") {
      return {
        shouldContinue: false,
        reply: { text: "❌ Supported formats: opus (Voice Note), wav (Audio File)" },
      };
    }
    setTtsFormat(prefsPath, requested as "wav" | "opus");
    return {
      shouldContinue: false,
      reply: { text: `✅ TTS format set to ${requested}.` },
    };
  }

  if (action === "log") {
    try {
      const logs = execSync(
        "journalctl --user -u alltalk-openskynet.service -n 20 --no-pager",
      ).toString();
      return {
        shouldContinue: false,
        reply: { text: `📜 **AllTalk Logs (Last 20 lines):**\n\n\`\`\`\n${logs}\n\`\`\`` },
      };
    } catch (err) {
      return {
        shouldContinue: false,
        reply: { text: `❌ Failed to fetch logs: ${String(err)}` },
      };
    }
  }

  if (action === "limit") {
    if (!args.trim()) {
      const currentLimit = getTtsMaxLength(prefsPath);
      return {
        shouldContinue: false,
        reply: {
          text:
            `📏 TTS limit: ${currentLimit} characters.\n\n` +
            `Text longer than this triggers summary (if enabled).\n` +
            `Range: 100-4096 chars (Telegram max).\n\n` +
            `To change: /tts limit <number>\n` +
            `Example: /tts limit 2000`,
        },
      };
    }
    const next = Number.parseInt(args.trim(), 10);
    if (!Number.isFinite(next) || next < 100 || next > 4096) {
      return {
        shouldContinue: false,
        reply: { text: "❌ Limit must be between 100 and 4096 characters." },
      };
    }
    setTtsMaxLength(prefsPath, next);
    return {
      shouldContinue: false,
      reply: { text: `✅ TTS limit set to ${next} characters.` },
    };
  }

  if (action === "summary") {
    if (!args.trim()) {
      const enabled = isSummarizationEnabled(prefsPath);
      const maxLen = getTtsMaxLength(prefsPath);
      return {
        shouldContinue: false,
        reply: {
          text:
            `📝 TTS auto-summary: ${enabled ? "on" : "off"}.\n\n` +
            `When text exceeds ${maxLen} chars:\n` +
            `• ON: summarizes text, then generates audio\n` +
            `• OFF: truncates text, then generates audio\n\n` +
            `To change: /tts summary on | off`,
        },
      };
    }
    const requested = args.trim().toLowerCase();
    if (requested !== "on" && requested !== "off") {
      return { shouldContinue: false, reply: ttsUsage() };
    }
    setSummarizationEnabled(prefsPath, requested === "on");
    return {
      shouldContinue: false,
      reply: {
        text: requested === "on" ? "✅ TTS auto-summary enabled." : "❌ TTS auto-summary disabled.",
      },
    };
  }

  if (action === "status") {
    const autoMode = resolveTtsAutoMode({ config, prefsPath });
    const enabled = isTtsEnabled(config, prefsPath);
    const provider = getTtsProvider(config, prefsPath);
    const hasKey = isTtsProviderConfigured(config, provider);
    const maxLength = getTtsMaxLength(prefsPath);
    const summarize = isSummarizationEnabled(prefsPath);
    const last = getLastTtsAttempt();
    const lines = [
      "📊 TTS status",
      `State: ${enabled ? "✅ enabled" : "❌ disabled"}`,
      `Auto mode: ${autoMode}`,
      `Provider: ${provider} (${hasKey ? "✅ configured" : "❌ not configured"})`,
    ];
    if (provider === "alltalk") {
      lines.push(`Voice: ${getTtsVoice(config, prefsPath)}`);
      lines.push(`Idiom: ${getTtsLanguage(config, prefsPath)}`);
      lines.push(`Format: ${getTtsFormat(prefsPath)}`);
    }
    lines.push(`Text limit: ${maxLength} chars`);
    lines.push(`Auto-summary: ${summarize ? "on" : "off"}`);
    if (last) {
      const timeAgo = Math.round((Date.now() - last.timestamp) / 1000);
      lines.push("");
      lines.push(`Last attempt (${timeAgo}s ago): ${last.success ? "✅" : "❌"}`);
      lines.push(`Text: ${last.textLength} chars${last.summarized ? " (summarized)" : ""}`);
      if (last.success) {
        lines.push(`Provider: ${last.provider ?? "unknown"}`);
        lines.push(`Latency: ${last.latencyMs ?? 0}ms`);
      } else if (last.error) {
        lines.push(`Error: ${last.error}`);
      }
    }
    return { shouldContinue: false, reply: { text: lines.join("\n") } };
  }

  return { shouldContinue: false, reply: ttsUsage() };
};
