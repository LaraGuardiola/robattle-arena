// Cliente WebSocket para el multijugador LAN.

import type { ClientMsg, ServerMsg } from "../shared/protocol";

export class Net {
  ws: WebSocket;
  id = 0;
  onMsg: (m: ServerMsg) => void = () => {};
  onClose: () => void = () => {};
  private queue: ClientMsg[] = [];

  constructor() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    this.ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws.onopen = () => {
      for (const m of this.queue) this.ws.send(JSON.stringify(m));
      this.queue = [];
    };
    this.ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as ServerMsg;
      if (m.t === "welcome") this.id = m.id;
      this.onMsg(m);
    };
    this.ws.onclose = () => this.onClose();
  }

  send(m: ClientMsg) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
    else if (this.ws.readyState === WebSocket.CONNECTING) this.queue.push(m);
  }

  close() {
    this.onClose = () => {};
    this.ws.close();
  }
}
