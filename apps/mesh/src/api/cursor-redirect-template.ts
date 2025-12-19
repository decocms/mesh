/**
 * HTML template for Cursor deep link redirects
 * Avoids inline HTML code duplication
 */

export function getCursorRedirectTemplate(redirectUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Authentication Complete</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #07401a 0%, #0a5a24 100%);
    }
    .container {
      text-align: center;
      padding: 2.5rem;
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(7, 64, 26, 0.3);
      max-width: 450px;
      animation: slideIn 0.3s ease-out;
      border-top: 4px solid #d0ec1a;
    }
    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    .success-icon {
      width: 60px;
      height: 60px;
      margin: 0 auto 1.5rem;
      border-radius: 50%;
      background: #d0ec1a;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: scaleIn 0.5s ease-out 0.2s both;
    }
    @keyframes scaleIn {
      from {
        transform: scale(0);
      }
      to {
        transform: scale(1);
      }
    }
    .success-icon svg {
      width: 30px;
      height: 30px;
      stroke: #07401a;
      stroke-width: 3;
      stroke-linecap: round;
      stroke-linejoin: round;
      fill: none;
    }
    h2 {
      color: #07401a;
      margin: 0 0 1rem 0;
      font-size: 24px;
      font-weight: 700;
    }
    .description {
      color: #374151;
      margin: 0 0 1.5rem 0;
      line-height: 1.6;
    }
    .cursor-notice {
      background: #f0fdf4;
      border-left: 3px solid #d0ec1a;
      padding: 1rem;
      border-radius: 4px;
      margin: 1.5rem 0;
      text-align: left;
      font-size: 14px;
      color: #166534;
    }
    .cursor-notice strong {
      color: #07401a;
      display: block;
      margin-bottom: 0.5rem;
    }
    button {
      background: #d0ec1a;
      color: #07401a;
      border: none;
      padding: 12px 32px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 16px;
      font-weight: 700;
      transition: all 0.2s;
      margin-top: 1rem;
    }
    button:hover {
      background: #bdd617;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(208, 236, 26, 0.4);
    }
    button:active {
      transform: translateY(0);
    }
    .note {
      color: #6b7280;
      font-size: 13px;
      margin-top: 1.5rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="success-icon">
      <svg viewBox="0 0 24 24">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    </div>
    <h2>Authentication Complete! ✨</h2>
    <p class="description">
      Authentication was successful.
    </p>
    <div class="cursor-notice">
      <strong>📌 Next step:</strong>
      Cursor will ask for permission to open the deep link. Click "Open" or "Allow" when prompted.
    </div>
    <button id="manual-redirect">Open in Cursor</button>
    <p class="note">This window will close automatically.</p>
  </div>
  <script>
    const redirectUrl = ${JSON.stringify(redirectUrl)};
    let redirectAttempted = false;
    
    function attemptRedirect() {
      if (redirectAttempted) return;
      redirectAttempted = true;
      
      console.log('[Cursor OAuth] Redirecting to:', redirectUrl);
      
      // Open the deep link in a new context (works better for protocol handlers)
      const link = document.createElement('a');
      link.href = redirectUrl;
      link.click();
      
      // Immediately try to close the window
      setTimeout(() => {
        // Multiple close attempts for better compatibility
        window.close();
        
        // If window.close() doesn't work (security restrictions),
        // try to detect if we're still open and show a message
        setTimeout(() => {
          if (!window.closed) {
            // Window didn't close, update the UI
            const container = document.querySelector('.container');
            container.innerHTML = \`
              <div class="success-icon">
                <svg viewBox="0 0 24 24">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <h2>All set! ✅</h2>
              <p class="description">
                Authentication completed successfully.
              </p>
              <p class="note" style="margin-top: 1rem; font-size: 15px;">
                You can close this window now.
              </p>
            \`;
          }
        }, 100);
      }, 300);
    }
    
    // Setup manual redirect button
    document.getElementById('manual-redirect').onclick = attemptRedirect;
    
    // Auto-redirect after a brief delay to show success message
    setTimeout(attemptRedirect, 800);
    
    // Fallback: try to close when the user switches back to this tab
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && redirectAttempted) {
        setTimeout(() => window.close(), 100);
      }
    });
  </script>
</body>
</html>
  `;
}

/**
 * Check if the redirect URL is a custom URI scheme
 * (cursor://, vscode://, etc.) that needs special handling
 */
export function isCustomUriScheme(url: string): boolean {
  return !url.startsWith("http://") && !url.startsWith("https://");
}
