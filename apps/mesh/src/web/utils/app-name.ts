/**
 * Utilitários para extrair e formatar nomes de apps MCP
 */

/**
 * Extrai o nome de exibição de um app name no formato de domínio reverso.
 *
 * Exemplos:
 * - "ai.zine/mcp" -> "zine"
 * - "com.apple-rag/mcp-server" -> "apple-rag"
 * - "simple-name" -> "simple-name"
 * - "io.modelcontextprotocol.registry/github" -> "github"
 *
 * @param fullName - O nome completo do app (pode estar no formato domínio/app)
 * @returns O nome formatado para exibição
 */
export function extractDisplayNameFromDomain(fullName: string): string {
  // Se não tem "/", retorna como está
  if (!fullName.includes("/")) {
    return fullName;
  }

  const parts = fullName.split("/");
  const domain = parts[0];
  const appName = parts[1];

  // Se não conseguiu extrair as partes, retorna o original
  if (!domain || !appName) {
    return fullName;
  }

  // Se o domínio tem pontos (formato de domínio reverso), pega a última parte
  if (domain.includes(".")) {
    const domainParts = domain.split(".");
    const lastDomainPart = domainParts[domainParts.length - 1] || domain;

    // Remove sufixos comuns como "mcp" ou "mcp-server" do appName
    const cleanAppName = appName
      .replace(/^mcp-?/, "")
      .replace(/-?mcp$/, "")
      .replace(/^server-?/, "")
      .replace(/-?server$/, "");

    // Se após limpar o appName ficou vazio ou muito curto, usa a última parte do domínio
    if (!cleanAppName || cleanAppName.length < 2) {
      return lastDomainPart;
    }

    return cleanAppName;
  }

  // Se não tem pontos no domínio, retorna o appName
  return appName;
}
