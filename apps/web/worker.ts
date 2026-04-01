interface Fetcher {
  fetch(request: Request): Response | Promise<Response>;
}

interface Env {
  API: Fetcher;
  ASSETS: Fetcher;
}

const worker = {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api")) {
      return env.API.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};

export { worker as default };
