export interface VersionConfig {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  isLatest: boolean;
  root: string;
}

export const versions: VersionConfig[] = [
  {
    id: "deco-studio",
    label: "deco Studio - current",
    shortLabel: "deco Studio - current",
    description: "Current production docs",
    isLatest: true,
    root: "studio/quickstart",
  },
  {
    id: "deco-chat",
    label: "deco.chat - legacy admin",
    shortLabel: "deco.chat - legacy admin",
    description: "Legacy deco.chat docs",
    isLatest: false,
    root: "getting-started/ai-builders",
  },
];

export const LATEST_VERSION = versions.find((v) => v.isLatest)!;
export const VERSION_IDS = versions.map((v) => v.id);
