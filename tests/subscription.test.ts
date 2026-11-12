import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateUsage, formatBytes, getSubscriptionPath, normalizeConfigLinks, safeExternalUrl } from '../src/lib/subscriptionData.ts';
import { parseLink, getProtocol } from '../src/lib/linkParser.ts';
import { convertWireGuardUrlToConfig, encodeSubscriptionContentToBase64, getWireGuardDownloadPayload } from '../src/lib/subscriptionConfig.ts';

test('usage sums nodes and combines equivalent timestamps in chronological order', () => {
  assert.deepEqual(aggregateUsage({
    1: [{ period_start: '2026-11-12T01:00:00Z', total_traffic: 20 }, { period_start: '2026-11-12T00:00:00Z', total_traffic: 10 }],
    2: [{ period_start: '2026-11-12T03:30:00+03:30', total_traffic: 30 }],
  }), [{ period_start: '2026-11-12T00:00:00.000Z', total_traffic: 40 }, { period_start: '2026-11-12T01:00:00.000Z', total_traffic: 20 }]);
});
test('usage ignores malformed, negative, non-finite and null records', () => {
  assert.deepEqual(aggregateUsage({ 1: [null, {}, { period_start: 'bad', total_traffic: 4 }, { period_start: '2026-11-12', total_traffic: -1 }, { period_start: '2026-11-12', total_traffic: Infinity }], 2: null }), []);
  assert.deepEqual(aggregateUsage(null), []);
});
test('small traffic and very large traffic never produce undefined units', () => {
  assert.equal(formatBytes(1), '1 B'); assert.equal(formatBytes(1024), '1.00 KB');
  assert.equal(formatBytes(1024 ** 6), '1024.00 PB');
  for (const value of [-1, 0, NaN, Infinity]) assert.equal(formatBytes(value), '0 B');
});
test('subscription paths preserve custom prefixes and admin namespaces', () => {
  assert.equal(getSubscriptionPath('/custom/admin/token/info/'), '/custom/admin/token');
  assert.equal(getSubscriptionPath('/custom/admin/token/'), '/custom/admin/token');
  assert.equal(getSubscriptionPath('/custom/admin/token'), '/custom/admin/token');
});
test('config normalization deduplicates and excludes executable schemes', () => {
  assert.deepEqual(normalizeConfigLinks([' vless://a ', 'vless://a', null, 'javascript://x', 'data://x', 'WIREGUARD://x']), ['vless://a', 'WIREGUARD://x']);
  assert.deepEqual(normalizeConfigLinks({ links: [] }), []);
});
test('external URLs reject script, local file and control-character payloads', () => {
  for (const url of ['javascript:alert(1)', 'javascript://x', 'data:text/html,bad', 'file:///etc/passwd', 'https:\n//example.com']) assert.equal(safeExternalUrl(url, true), undefined);
  assert.equal(safeExternalUrl('hiddify://import/a', true), 'hiddify://import/a');
  assert.equal(safeExternalUrl('hiddify://import/a'), undefined);
  assert.equal(safeExternalUrl('https://example.com/path'), 'https://example.com/path');
});
test('VMess names decode UTF-8 and URL-safe base64', () => {
  const body = Buffer.from(JSON.stringify({ ps: '🇩🇪 آلمان', add: 'example.com', port: 443 })).toString('base64url');
  const link = parseLink(`VMESS://${body}`, 0);
  assert.equal(link.name, 'آلمان'); assert.equal(link.server, 'example.com'); assert.equal(link.port, '443');
  assert.equal(link.emoji, '🇩🇪'); assert.equal(getProtocol(' VLESS://a '), 'vless');
});
test('malformed VMess fields do not crash the configuration list', () => {
  const body = Buffer.from(JSON.stringify({ ps: 4, add: {}, port: { toString: 'bad' } })).toString('base64');
  assert.doesNotThrow(() => parseLink(`vmess://${body}`, 0));
});
const wg = 'wireguard://private%2Bkey%3D@[2001:db8::1]:51820?publickey=public%2Bkey%3D&address=10.0.0.2%2F32&allowedips=0.0.0.0%2F0%2C%3A%3A%2F0#test';
test('WireGuard preserves IPv6 brackets and percent-encoded keys', () => {
  const content = convertWireGuardUrlToConfig(wg);
  assert.match(content!, /PrivateKey = private\+key=/); assert.match(content!, /Endpoint = \[2001:db8::1\]:51820/);
  assert.match(content!, /AllowedIPs = 0.0.0.0\/0, ::\/0/);
  assert.equal(getWireGuardDownloadPayload(wg)?.fileName, 'test.conf');
});
test('WireGuard URI fields cannot inject configuration directives', () => {
  assert.equal(convertWireGuardUrlToConfig(wg.replace('#test', '#test%0APostUp%20%3D%20bad')), null);
  assert.equal(convertWireGuardUrlToConfig(wg.replace('10.0.0.2%2F32', '10.0.0.2%2F32%0APostUp%20%3D%20bad')), null);
});
test('Unicode subscription content round-trips through Base64', () => {
  const input = 'vless://example#آلمان 🇩🇪';
  assert.equal(Buffer.from(encodeSubscriptionContentToBase64(input), 'base64').toString('utf8'), input);
});
