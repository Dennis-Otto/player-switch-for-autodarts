// Runs inside the Autodarts Play page. This is the only file that touches the
// page's stored session: it reads, writes and clears the refresh token that
// Autodarts keeps in window.localStorage, on behalf of the service worker.

const SESSION_KEY = "autodarts_refresh_token";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message === null || typeof message !== "object" || message.type !== "page") {
    return false;
  }

  switch (message.action) {
    case "read": {
      const token = window.localStorage.getItem(SESSION_KEY);
      sendResponse({ token });
      return false;
    }
    case "write": {
      window.localStorage.setItem(SESSION_KEY, message.token);
      sendResponse({ ok: true });
      // Let Autodarts pick up the new session.
      window.location.reload();
      return false;
    }
    case "clear": {
      window.localStorage.removeItem(SESSION_KEY);
      sendResponse({ ok: true });
      window.location.reload();
      return false;
    }
    default: {
      return false;
    }
  }
});
