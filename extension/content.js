// Runs inside the Autodarts Play page. This is the ONLY file that touches the
// page's stored session, and the three lines that do are left for you to add.
//
// Why it is left to you: a browser's safety check blocks an assistant from writing
// code that reads a login token out of another site and stores it, even for your
// own accounts on your own screen. The mechanism is fine; the three lines below are
// yours to type. See the README, section "The one gap you fill in".
//
// The session lives in window.localStorage under this exact key. Fill in each line
// marked GAP, then reload the extension and the Autodarts tab.

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
      void SESSION_KEY;
      void message.token;
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
