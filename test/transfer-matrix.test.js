import { describe, expect, it } from 'vitest';
import {
  CHANNEL,
  channelsFor,
  swapDirection,
} from '../src/core/transfer-matrix.js';

describe('互传通道矩阵', () => {
  it('Luker：有已配对设备时原生可用，且只有拉取可直连', () => {
    const rows = channelsFor({ senderHost: 'luker', nativePeers: [{ id: 'p1', label: '手机' }] });
    const native = rows.find((row) => row.id === CHANNEL.LUKER_NATIVE);
    expect(native).toMatchObject({ kind: 'native', available: true, reasonKey: '', pull: true });
    expect(native.push).toBe('peer-action');
    expect(rows.some((row) => row.id === CHANNEL.TT_NATIVE)).toBe(false);
  });

  it('Luker：未配对时不可用并给出原因键', () => {
    const rows = channelsFor({ senderHost: 'luker', nativePeers: [] });
    const native = rows.find((row) => row.id === CHANNEL.LUKER_NATIVE);
    expect(native.available).toBe(false);
    expect(native.reasonKey).toBe('transfer.reason.unpaired');
  });

  it('TauriTavern：原生一律标不可用，原因是需走宿主面板', () => {
    const rows = channelsFor({ senderHost: 'tt', nativePeers: [{ id: 'p1' }] });
    const native = rows.find((row) => row.id === CHANNEL.TT_NATIVE);
    expect(native.available).toBe(false);
    expect(native.reasonKey).toBe('transfer.reason.hostPanel');
  });

  it('ST / PT / Web：只列 WebRTC 通道', () => {
    for (const senderHost of ['st', 'pt', 'web']) {
      const rows = channelsFor({ senderHost, nativePeers: [{ id: 'x' }] });
      expect(rows.map((row) => row.id)).toEqual([CHANNEL.WEBRTC]);
      expect(rows[0].available).toBe(true);
    }
  });

  it('WebRTC 不可用时仍保留该行并给出原因', () => {
    const rows = channelsFor({ senderHost: 'st', webRtcAvailable: false });
    expect(rows[0]).toMatchObject({ available: false, reasonKey: 'transfer.reason.noWebrtc' });
  });

  it('方向互换幂等', () => {
    expect(swapDirection('send')).toBe('recv');
    expect(swapDirection('recv')).toBe('send');
    expect(swapDirection(swapDirection('send'))).toBe('send');
  });
});
