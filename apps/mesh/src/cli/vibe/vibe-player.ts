import { join } from "path";
import { mkdirSync } from "fs";
import playlist from "./playlist.json";

interface Track {
  title: string;
  url: string;
}

const tracks: Track[] = playlist.tracks;

let currentProcess: ReturnType<typeof Bun.spawn> | null = null;
let playing = false;

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function downloadIfNeeded(
  track: Track,
  soundsDir: string,
): Promise<string> {
  const filePath = join(soundsDir, `${toSlug(track.title)}.mp3`);
  const file = Bun.file(filePath);
  if (await file.exists()) {
    return filePath;
  }
  const response = await fetch(track.url);
  if (!response.ok) {
    throw new Error(`Failed to download ${track.title}: ${response.status}`);
  }
  await Bun.write(filePath, response);
  return filePath;
}

function pickRandom(): Track {
  return tracks[Math.floor(Math.random() * tracks.length)]!;
}

async function playTrack(dataDir: string) {
  if (!playing) return;

  const track = pickRandom();
  const soundsDir = join(dataDir, "sounds");
  mkdirSync(soundsDir, { recursive: true });

  try {
    const filePath = await downloadIfNeeded(track, soundsDir);
    if (!playing) return;

    currentProcess = Bun.spawn(["afplay", filePath], {
      stdio: ["ignore", "ignore", "ignore"],
    });

    await currentProcess.exited;
    currentProcess = null;

    // Play next track when current one ends
    if (playing) {
      playTrack(dataDir);
    }
  } catch {
    // If download or playback fails, try another track after a short delay
    if (playing) {
      setTimeout(() => playTrack(dataDir), 2000);
    }
  }
}

export function startVibe(dataDir: string): void {
  if (playing) return;
  playing = true;
  playTrack(dataDir);
}

export function stopVibe(): void {
  playing = false;
  if (currentProcess) {
    currentProcess.kill();
    currentProcess = null;
  }
}

export function toggleVibe(dataDir: string): void {
  if (playing) {
    stopVibe();
  } else {
    startVibe(dataDir);
  }
}

export function isVibePlaying(): boolean {
  return playing;
}
