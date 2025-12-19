/**
 * Template HTML para redirect de deep links do Cursor
 * Evita duplicação de código HTML inline
 */

export function getCursorRedirectTemplate(redirectUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Redirecting to Cursor...</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #f5f5f5;
    }
    .container {
      text-align: center;
      padding: 2rem;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      max-width: 500px;
    }
    .spinner {
      border: 3px solid #f3f3f3;
      border-top: 3px solid #3498db;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    button {
      background: #3498db;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      margin-top: 1rem;
    }
    button:hover {
      background: #2980b9;
    }
    .error {
      color: #e74c3c;
      margin-top: 1rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <h2>Redirecting to Cursor...</h2>
    <p>Please wait while we redirect you back to Cursor.</p>
    <p class="error" id="error" style="display: none;">
      If you're not redirected automatically, click the button below:
    </p>
    <button id="manual-redirect" style="display: none;">Open in Cursor</button>
  </div>
  <script>
    const redirectUrl = ${JSON.stringify(redirectUrl)};
    
    // Try to redirect immediately
    window.location.href = redirectUrl;
    
    // Show manual button after 2 seconds
    setTimeout(() => {
      document.getElementById('error').style.display = 'block';
      const btn = document.getElementById('manual-redirect');
      btn.style.display = 'inline-block';
      btn.onclick = () => {
        window.location.href = redirectUrl;
      };
    }, 2000);
    
    // Try to close the window after 3 seconds if still open
    setTimeout(() => {
      try {
        window.close();
      } catch (e) {
        // Ignore if can't close
      }
    }, 3000);
  </script>
</body>
</html>
  `;
}

/**
 * Verifica se a URL de redirect é um custom URI scheme
 * (cursor://, vscode://, etc.) que precisa de tratamento especial
 */
export function isCustomUriScheme(url: string): boolean {
  return !url.startsWith("http://") && !url.startsWith("https://");
}
