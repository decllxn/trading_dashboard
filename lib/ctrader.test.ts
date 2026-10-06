import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inferAssetClass } from './ctrader.ts';

describe('cTrader Integration Helpers', () => {
  it('correctly infers forex asset class', () => {
    assert.equal(inferAssetClass('EURUSD'), 'forex');
    assert.equal(inferAssetClass('GBP/JPY'), 'forex');
    assert.equal(inferAssetClass('AUDCAD'), 'forex');
    assert.equal(inferAssetClass('USDCHF'), 'forex');
  });

  it('correctly infers commodity/metal asset class as futures', () => {
    assert.equal(inferAssetClass('XAUUSD'), 'futures');
    assert.equal(inferAssetClass('XAGUSD'), 'futures');
    assert.equal(inferAssetClass('USOIL'), 'futures');
    assert.equal(inferAssetClass('UKOIL'), 'futures');
  });

  it('correctly infers index asset class as futures', () => {
    assert.equal(inferAssetClass('US500'), 'futures');
    assert.equal(inferAssetClass('NAS100'), 'futures');
    assert.equal(inferAssetClass('GER40'), 'futures');
    assert.equal(inferAssetClass('US30'), 'futures');
  });

  it('correctly infers crypto asset class', () => {
    assert.equal(inferAssetClass('BTCUSD'), 'crypto');
    assert.equal(inferAssetClass('ETHUSD'), 'crypto');
    assert.equal(inferAssetClass('SOLUSD'), 'crypto');
  });
});
