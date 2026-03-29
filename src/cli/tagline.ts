export type TaglineMode = "random" | "default" | "off";

export interface TaglineOptions {
  env?: NodeJS.ProcessEnv;
  random?: () => number;
  now?: () => Date;
  mode?: TaglineMode;
}

type BannerTip = {
  command: string;
  description: string;
};

const DEFAULT_TIP: BannerTip = {
  command: "openskynet configure",
  description: "interactive setup for credentials, channels, gateway, and agent defaults",
};

const BANNER_TIPS: BannerTip[] = [
  DEFAULT_TIP,
  {
    command: "openskynet dashboard --no-open",
    description: "print the Control UI URL without launching a browser",
  },
  {
    command: "openskynet status",
    description: "show channel health and recent session recipients",
  },
  {
    command: "openskynet doctor",
    description: "run health checks and quick fixes",
  },
  {
    command: 'openskynet agent --message "Summarize this workspace"',
    description: "run one agent turn via the Gateway",
  },
  {
    command: "openskynet logs",
    description: "tail gateway file logs via RPC",
  },
  {
    command: "openskynet channels --help",
    description: "manage Telegram, Discord, WhatsApp, and other channels",
  },
  {
    command: "openskynet tui",
    description: "open a terminal UI connected to the Gateway",
  },
  {
    command: "openskynet models --help",
    description: "discover, scan, and configure models",
  },
];

function formatBannerTip(tip: BannerTip): string {
  return `Tip: ${tip.command}  ${tip.description}`;
}

export function activeTaglines(_options: TaglineOptions = {}): string[] {
  return BANNER_TIPS.map(formatBannerTip);
}

export function pickTagline(options: TaglineOptions = {}): string {
  if (options.mode === "off") {
    return "";
  }
  if (options.mode === "default") {
    return formatBannerTip(DEFAULT_TIP);
  }
  const pool = activeTaglines(options);
  const env = options.env ?? process.env;
  const override = env?.OPENCLAW_TAGLINE_INDEX ?? env?.OPENSKYNET_TAGLINE_INDEX;
  if (override !== undefined) {
    const parsed = Number.parseInt(override, 10);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      return pool[parsed % pool.length] ?? formatBannerTip(DEFAULT_TIP);
    }
  }
  const rand = options.random ?? Math.random;
  const index = Math.floor(rand() * pool.length) % pool.length;
  return pool[index] ?? formatBannerTip(DEFAULT_TIP);
}

export const DEFAULT_TAGLINE = formatBannerTip(DEFAULT_TIP);
export const TAGLINES = BANNER_TIPS.map(formatBannerTip);
export const HOLIDAY_RULES = new Map<string, (date: Date) => boolean>();
