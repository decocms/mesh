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
let generation = 0;
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 3;

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

async function playTrack(dataDir: string, gen: number) {
  if (!playing || gen !== generation) return;

  const track = pickRandom();
  const soundsDir = join(dataDir, "sounds");
  mkdirSync(soundsDir, { recursive: true });

  try {
    const filePath = await downloadIfNeeded(track, soundsDir);
    if (!playing || gen !== generation) return;

    currentProcess = Bun.spawn(["afplay", filePath], {
      stdio: ["ignore", "ignore", "ignore"],
    });

    await currentProcess.exited;
    currentProcess = null;
    consecutiveFailures = 0;

    if (playing && gen === generation) {
      playTrack(dataDir, gen);
    }
  } catch {
    consecutiveFailures++;
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      playing = false;
      return;
    }
    if (playing && gen === generation) {
      setTimeout(() => playTrack(dataDir, gen), 2000);
    }
  }
}

let cleanupRegistered = false;

export function startVibe(dataDir: string): void {
  if (playing) return;
  playing = true;
  consecutiveFailures = 0;
  generation++;
  playTrack(dataDir, generation);

  if (!cleanupRegistered) {
    cleanupRegistered = true;
    process.on("exit", stopVibe);
  }
}

export function stopVibe(): void {
  playing = false;
  generation++;
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
