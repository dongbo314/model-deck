import assert from 'node:assert/strict';

function unicodeRangeIncludes(block, codePoint) {
  const rangeText = /unicode-range:([^;}]+)/i.exec(block)?.[1];
  if (!rangeText) return false;
  return rangeText.split(',').some((candidate) => {
    const match = /^\s*u\+([0-9a-f?]+)(?:-([0-9a-f]+))?\s*$/i.exec(candidate);
    if (!match) return false;
    const lowerText = match[1].replaceAll('?', '0');
    const upperText = (match[2] || match[1]).replaceAll('?', 'f');
    return codePoint >= Number.parseInt(lowerText, 16) && codePoint <= Number.parseInt(upperText, 16);
  });
}

export async function verifyBundledChineseFont(htmlResponse, html, origin) {
  assert.match(htmlResponse.headers.get('content-security-policy') || '', /font-src 'self'/);
  const stylesheetPaths = [...new Set(
    [...html.matchAll(/href="([^"]+\.css[^"]*)"/g)].map((match) => match[1]),
  )];
  assert(stylesheetPaths.length > 0, 'Dashboard HTML does not reference a stylesheet.');
  const stylesheets = await Promise.all(stylesheetPaths.map(async (path) => {
    const response = await fetch(new URL(path, origin));
    assert.equal(response.status, 200);
    return response.text();
  }));
  const fontStylesheet = stylesheets.find((css) => css.includes('Noto Sans SC Variable'));
  assert(fontStylesheet, 'Dashboard does not include the self-hosted Chinese font.');

  const fontPaths = [...fontStylesheet.matchAll(/url\((['"]?)([^)'"]+\.woff2)\1\)/g)].map((match) => match[2]);
  assert(fontPaths.length > 0, 'Dashboard Chinese font does not reference WOFF2 assets.');
  assert(fontPaths.every((path) => path.startsWith('/_next/static/media/noto-sans-sc-')), 'Dashboard Chinese font must use only bundled same-origin assets.');

  const commonChineseBlock = [...fontStylesheet.matchAll(/@font-face\{[^}]+\}/g)]
    .map((match) => match[0])
    .find((block) => unicodeRangeIncludes(block, 0x4e2d));
  assert(commonChineseBlock, 'Dashboard Chinese font has no range covering U+4E2D.');
  const commonChinesePath = /url\((['"]?)([^)'"]+\.woff2)\1\)/.exec(commonChineseBlock)?.[2];
  assert(commonChinesePath, 'Dashboard common Chinese range has no WOFF2 asset.');
  const fontResponse = await fetch(new URL(commonChinesePath, origin));
  assert.equal(fontResponse.status, 200);
  assert.match(fontResponse.headers.get('content-type') || '', /^font\/woff2(?:;|$)/);
  const fontBytes = new Uint8Array(await fontResponse.arrayBuffer());
  assert(fontBytes.byteLength > 1_000, 'Dashboard Chinese font asset is unexpectedly small.');
  assert.equal(String.fromCharCode(...fontBytes.subarray(0, 4)), 'wOF2');
}
