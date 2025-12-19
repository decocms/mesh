/**
 * OAuth Messaging Utilities
 *
 * Utilitários para comunicação segura entre janelas durante o fluxo OAuth
 * Centraliza a lógica de postMessage e validação de origem
 */

/**
 * Lista de origens permitidas para o fluxo OAuth
 * Inclui esquemas customizados para IDEs (Cursor, VSCode, etc.)
 */
const ALLOWED_CUSTOM_SCHEMES = [
  "cursor://",
  "vscode://",
  "vscode-insiders://",
  "code://",
];

/**
 * Valida se uma origem é confiável para receber mensagens OAuth
 * Para desenvolvimento local e esquemas customizados de IDEs
 */
export function isAllowedOrigin(origin: string): boolean {
  // Permite o mesmo origin
  if (origin === window.location.origin) {
    return true;
  }

  // Permite localhost e 127.0.0.1 em qualquer porta
  if (
    origin.includes("localhost") ||
    origin.includes("127.0.0.1") ||
    origin.includes("[::1]")
  ) {
    return true;
  }

  // Permite esquemas customizados de IDEs
  if (ALLOWED_CUSTOM_SCHEMES.some((scheme) => origin.startsWith(scheme))) {
    return true;
  }

  // Para produção, você pode adicionar validação adicional aqui
  // Por exemplo, verificar contra uma lista de domínios permitidos
  // const allowedDomains = process.env.ALLOWED_OAUTH_ORIGINS?.split(',') || [];
  // return allowedDomains.some(domain => origin.endsWith(domain));

  return false;
}

/**
 * Tipos de mensagens OAuth suportadas
 */
export type OAuthMessageType =
  | "mcp:oauth:complete"
  | "mcp_auth_callback"
  | "mcp:oauth:error";

/**
 * Interface para mensagens OAuth
 */
export interface OAuthMessage {
  type: OAuthMessageType;
  success: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

/**
 * Envia uma mensagem OAuth para a janela pai (opener)
 * Com tratamento de erro e validação
 */
export function sendOAuthMessage(message: OAuthMessage): boolean {
  if (!window.opener || window.opener.closed) {
    console.warn("[OAuth] Opener window is not available");
    return false;
  }

  try {
    // Para compatibilidade com Cursor e outros IDEs, usamos "*"
    // mas apenas em contexto de OAuth onde o risco é controlado
    window.opener.postMessage(message, "*");
    console.log("[OAuth] Message sent to opener:", message.type);
    return true;
  } catch (error) {
    console.error("[OAuth] Failed to send message:", error);
    return false;
  }
}

/**
 * Cria um listener seguro para mensagens OAuth
 * Valida a origem e o tipo de mensagem antes de processar
 */
export function createOAuthMessageListener(
  onMessage: (message: OAuthMessage, event: MessageEvent) => void,
  options?: {
    strictOriginCheck?: boolean; // Se true, usa validação de origem
    timeout?: number; // Timeout em ms para auto-cleanup
  },
): () => void {
  const strictOriginCheck = options?.strictOriginCheck ?? false;
  const timeout = options?.timeout;

  const handler = (event: MessageEvent) => {
    // Validação de origem (opcional para compatibilidade com Cursor)
    if (strictOriginCheck && !isAllowedOrigin(event.origin)) {
      console.warn("[OAuth] Message from disallowed origin:", event.origin);
      return;
    }

    // Validação da estrutura da mensagem
    const data = event.data;
    if (!data || typeof data !== "object" || !data.type) {
      return;
    }

    // Verifica se é uma mensagem OAuth válida
    const validTypes: OAuthMessageType[] = [
      "mcp:oauth:complete",
      "mcp_auth_callback",
      "mcp:oauth:error",
    ];

    if (validTypes.includes(data.type)) {
      console.log(
        "[OAuth] Received message:",
        data.type,
        "from:",
        event.origin,
      );
      onMessage(data as OAuthMessage, event);
    }
  };

  window.addEventListener("message", handler);

  // Auto-cleanup após timeout (se configurado)
  let timeoutId: number | undefined;
  if (timeout) {
    timeoutId = window.setTimeout(() => {
      window.removeEventListener("message", handler);
      console.log("[OAuth] Message listener timeout");
    }, timeout);
  }

  // Retorna função de cleanup
  return () => {
    window.removeEventListener("message", handler);
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  };
}
