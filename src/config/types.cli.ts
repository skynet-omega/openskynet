export type CliBannerTaglineMode = "random" | "default" | "off";

export type CliConfig = {
  banner?: {
    /**
     * Controls CLI banner tagline behavior.
     * - "random": show a random curated command tip
     * - "default": show the default starter tip
     * - "off": hide the suffix text
     */
    taglineMode?: CliBannerTaglineMode;
  };
};
