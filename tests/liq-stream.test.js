import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { connectLiquidations, RECONNECT } from '../src/data/liq-stream.js';

class FakeSocket {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.closed = false;
    FakeSocket.instances.push(this);
  }
  close() { this.closed = true; this.onclose?.({}); }
  emit(data) { this.onmessage?.({ data }); }
}

const liq = (pair, S = 'SELL') => JSON.stringify({ e: 'forceOrder', o: { s: pair, S, ap: '10', z: '2', p: '10', q: '2', T: 1 } });

describe('connectLiquidations', () => {
  beforeEach(() => { FakeSocket.instances = []; vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  it('連到新版 /market/ws 路徑並把解析後的事件交給回呼', () => {
    const onEvent = vi.fn();
    connectLiquidations({ onEvent, WebSocketImpl: FakeSocket });
    const ws = FakeSocket.instances[0];
    expect(ws.url).toBe('wss://fstream.binance.com/market/ws/!forceOrder@arr');
    ws.emit(liq('ETHUSDT'));
    ws.emit('garbage');
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0][0]).toMatchObject({ pair: 'ETHUSDT', side: 'long', usd: 20 });
  });

  it('斷線後以指數退避重連，上限為 max', () => {
    connectLiquidations({ onEvent: () => {}, WebSocketImpl: FakeSocket });
    FakeSocket.instances[0].onclose({});
    vi.advanceTimersByTime(RECONNECT.baseMs - 1);
    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(2);
    FakeSocket.instances[1].onclose({});
    vi.advanceTimersByTime(RECONNECT.baseMs * 2);
    expect(FakeSocket.instances).toHaveLength(3);
    for (let i = 0; i < 10; i++) {
      FakeSocket.instances.at(-1).onclose({});
      vi.advanceTimersByTime(RECONNECT.maxMs);
    }
    expect(FakeSocket.instances.length).toBe(13);
  });

  it('收到訊息後重設退避時間', () => {
    connectLiquidations({ onEvent: () => {}, WebSocketImpl: FakeSocket });
    FakeSocket.instances[0].onclose({});
    vi.advanceTimersByTime(RECONNECT.baseMs);
    FakeSocket.instances[1].emit(liq('BTCUSDT'));
    FakeSocket.instances[1].onclose({});
    vi.advanceTimersByTime(RECONNECT.baseMs);
    expect(FakeSocket.instances).toHaveLength(3);
  });

  it('呼叫 stop 後關閉連線且不再重連', () => {
    const stop = connectLiquidations({ onEvent: () => {}, WebSocketImpl: FakeSocket });
    stop();
    expect(FakeSocket.instances[0].closed).toBe(true);
    vi.advanceTimersByTime(RECONNECT.maxMs * 2);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('建立連線失敗（例如環境不支援）時也會排程重連', () => {
    let calls = 0;
    class Broken { constructor() { calls += 1; throw new Error('blocked'); } }
    connectLiquidations({ onEvent: () => {}, WebSocketImpl: Broken });
    vi.advanceTimersByTime(RECONNECT.baseMs);
    expect(calls).toBe(2);
  });
});
