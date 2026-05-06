const ARCH_MAP: Record<string, string> = {
  x64: "amd64",
  arm64: "arm64",
};

export function buildPkgKey(opts: {
  pm: string;
  pmVersion: string;
  lockfileHash: string;
}): string {
  const { pm, pmVersion, lockfileHash } = opts;
  const arch = ARCH_MAP[process.arch] ?? process.arch;

  if (pm === "bun") {
    const parts = pmVersion.split(".");
    const pmMajorMinor = `${parts[0] ?? "0"}.${parts[1] ?? "0"}`;
    return `pkgs/v1/${pm}-${pmMajorMinor}/linux-${arch}/${lockfileHash}.tar.gz`;
  }

  return `pkgs/v1/${pm}/linux-${arch}/${lockfileHash}.tar.gz`;
}
