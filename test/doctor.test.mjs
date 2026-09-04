import assert from 'node:assert/strict';
import test from 'node:test';
import { supportedArchitecture } from '../controller/doctor.mjs';

test('first Core Preview architecture matrix is explicit', () => {
  assert.equal(supportedArchitecture('win32', 'x64'), true);
  assert.equal(supportedArchitecture('win32', 'arm64'), false);
  assert.equal(supportedArchitecture('linux', 'x64'), true);
  assert.equal(supportedArchitecture('linux', 'arm64'), false);
  assert.equal(supportedArchitecture('darwin', 'arm64'), true);
  assert.equal(supportedArchitecture('darwin', 'x64'), true);
});
