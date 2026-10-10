import test from 'node:test';
import assert from 'node:assert/strict';
import { WEB_LINK_PATTERN, parseMessageLink } from '../src/lib/messageLinks.js';
import externalLinks from '../electron/externalLinks.cjs';

test('web links with query parameters and underscores remain one clickable address', () => {
  const text = 'Bak https://example.com/some_file?q=bir_iki&v=2 ve www.example.org.';
  const links = [...text.matchAll(new RegExp(WEB_LINK_PATTERN, 'giu'))].map((match) => parseMessageLink(match[0]));
  assert.equal(links.length, 2);
  assert.equal(links[0].href, 'https://example.com/some_file?q=bir_iki&v=2');
  assert.equal(links[1].href, 'https://www.example.org/');
  assert.equal(links[1].suffix, '.');
});

test('sentence punctuation is excluded without breaking balanced parentheses in URLs', () => {
  assert.deepEqual(parseMessageLink('https://example.com/wiki/Test_(example)).'), {
    href: 'https://example.com/wiki/Test_(example)', label: 'https://example.com/wiki/Test_(example)', suffix: ').',
  });
  assert.equal(parseMessageLink('http://example.com/a!').href, 'http://example.com/a');
  assert.equal(parseMessageLink('https://example.com/?q=a%20b#topic').href, 'https://example.com/?q=a%20b#topic');
});

test('Windows opens HTTP, HTTPS and email links while rejecting executable and local schemes', () => {
  for (const link of ['http://example.com', 'https://example.com/a', 'HTTPS://EXAMPLE.COM', 'mailto:user@example.com']) assert.equal(externalLinks.isExternalLink(link), true);
  for (const link of ['javascript:alert(1)', 'file:///C:/secret', 'data:text/html,test', 'not a URL']) assert.equal(externalLinks.isExternalLink(link), false);
  for (const link of ['javascript:alert(1)', 'file:///C:/secret', 'https://']) assert.equal(parseMessageLink(link), null);
});
