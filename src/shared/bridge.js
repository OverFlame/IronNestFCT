(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.IronNestBridge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // 与 internal/IronNestFCS/BridgeServer.cs 约定：mod 从 37841 起扫描端口，最多 20 个。
  const DEFAULT_PORTS = Object.freeze(Array.from({ length: 20 }, (_, index) => 37841 + index));
  const PING_TIMEOUT_MS = 1500;
  const TOKEN = '';

  function baseUrl(port) {
    return `http://127.0.0.1:${port}`;
  }

  function withToken(url) {
    return TOKEN ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(TOKEN)}` : url;
  }

  async function ping(port) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
    try {
      const response = await fetch(withToken(`${baseUrl(port)}/ping`), {
        signal: controller.signal,
        cache: 'no-store'
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data && data.ok ? { port, ...data } : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  // 依序探测候选端口，返回首个在线端口信息；全部离线返回 null。
  async function discover(ports = DEFAULT_PORTS) {
    for (const port of ports) {
      const result = await ping(port);
      if (result) return result;
    }
    return null;
  }

  function openEvents(port) {
    return new EventSource(withToken(`${baseUrl(port)}/events`));
  }

  async function sendCommand(port, command) {
    const response = await fetch(withToken(`${baseUrl(port)}/command`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command)
    });
    return response.ok;
  }

  return Object.freeze({ DEFAULT_PORTS, TOKEN, ping, discover, openEvents, sendCommand });
});
