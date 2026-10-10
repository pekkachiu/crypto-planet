import { parseForceOrder } from './liquidations.js';

/** Binance 合約的公開爆倉串流。舊路徑 /ws/ 連得上但收不到資料，要用 /market/ws/ */
export const LIQ_STREAM_URL = 'wss://fstream.binance.com/market/ws/!forceOrder@arr';
export const RECONNECT = Object.freeze({ baseMs: 1000, maxMs: 30_000 });

/**
 * 連線並持續接收爆倉事件；斷線時以指數退避自動重連。
 * @returns {() => void} 停止接收並關閉連線
 */
export function connectLiquidations({ onEvent, WebSocketImpl = globalThis.WebSocket, url = LIQ_STREAM_URL }) {
  let socket = null;
  let delay = RECONNECT.baseMs;
  let timer = 0;
  let stopped = false;

  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(open, delay);
    delay = Math.min(delay * 2, RECONNECT.maxMs);
  };

  function open() {
    try {
      socket = new WebSocketImpl(url);
    } catch {
      schedule();
      return;
    }
    socket.onmessage = (message) => {
      delay = RECONNECT.baseMs;
      const event = parseForceOrder(message.data);
      if (event) onEvent(event);
    };
    // onerror 之後一定會觸發 onclose，在那裡統一重連
    socket.onerror = () => {};
    socket.onclose = () => {
      socket = null;
      schedule();
    };
  }

  open();
  return () => {
    stopped = true;
    clearTimeout(timer);
    socket?.close();
  };
}
