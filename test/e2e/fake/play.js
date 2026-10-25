// The stand-in for Autodarts Play in the end-to-end tests, served at every address
// of https://play.autodarts.com. It keeps its session the way the real page does, as
// far as the extension sees it:
//
// - the refresh token lives in localStorage under "autodarts_refresh_token";
// - each start of the page renews the session with that token and keeps the new
//   one, so a token that the extension writes is spent by the reload that follows.
//   It starts half a second after the load, as the real page first loads its code:
//   the extension waits for that renewal before it reads the token;
// - a token that the sign-in service turns away (400 or 401) ends the session, and
//   the page shows its sign-in form;
// - a sign-in stores the new token and loads the page again, as the redirect back
//   from the real sign-in page does.
//
// body[data-state] says where the page is: "starting", "signed-in" or "signed-out",
// and #who names the player who is signed in.
(() => {
  const SESSION_KEY = "autodarts_refresh_token";
  const AUTH = "https://api.autodarts.com/auth/v1";
  const BOOT_MS = 500;

  const who = document.querySelector("#who");
  const form = document.querySelector("#sign-in");
  const failure = document.querySelector("#sign-in-error");

  /** The claims of an access token, which the fake service writes readable. */
  function claims(accessToken) {
    const payload = accessToken
      .split(".")[1]
      .replaceAll("-", "+")
      .replaceAll("_", "/");
    return JSON.parse(atob(payload));
  }

  function post(path, body) {
    return fetch(`${AUTH}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, client_id: "autodarts-play" }),
    });
  }

  function show(name) {
    who.textContent = name ?? "";
    form.hidden = name !== null;
    document.body.dataset.state = name === null ? "signed-out" : "signed-in";
  }

  async function start() {
    const token = window.localStorage.getItem(SESSION_KEY);
    if (token === null) {
      show(null);
      return;
    }
    const response = await post("/refresh", { refresh_token: token });
    if (!response.ok) {
      window.localStorage.removeItem(SESSION_KEY);
      show(null);
      return;
    }
    const session = await response.json();
    window.localStorage.setItem(SESSION_KEY, session.refresh_token);
    show(claims(session.access_token).name);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const response = await post("/login", {
      username: data.get("username"),
      password: data.get("password"),
    });
    if (!response.ok) {
      failure.hidden = false;
      return;
    }
    const session = await response.json();
    window.localStorage.setItem(SESSION_KEY, session.refresh_token);
    window.location.reload();
  });

  setTimeout(() => void start(), BOOT_MS);
})();
