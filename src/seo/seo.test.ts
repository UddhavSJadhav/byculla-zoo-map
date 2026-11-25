import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { contentPages, ogImagePath, siteDescription, siteOrigin, siteTitle } from './site.ts'

const root = resolve(import.meta.dirname, '../..')

test('homepage HTML exposes crawlable title, description, canonical, and social tags', () => {
  const html = readFileSync(resolve(root, 'index.html'), 'utf8')
  assert.match(html, /<html lang="en">/)
  assert.match(html, new RegExp(`<title>${escapeRegExp(siteTitle.replace(/&/g, '&amp;'))}</title>`))
  assert.match(html, new RegExp(`content="${escapeRegExp(siteDescription)}"`))
  assert.match(html, new RegExp(`rel="canonical" href="${escapeRegExp(siteOrigin)}/"`))
  assert.match(html, /property="og:title"/)
  assert.match(html, new RegExp(escapeRegExp(`${siteOrigin}${ogImagePath}`)))
  assert.match(html, /name="twitter:card" content="summary_large_image"/)
  assert.doesNotMatch(html, /noindex/)
  assert.doesNotMatch(html, /byculla-zoo-map-7t74/)
  assert.match(html, /<h1>Byculla Zoo Interactive Map<\/h1>/)
  assert.match(html, /href="\/visitor-guide\/"/)
  assert.match(html, /href="\/attractions\/"/)
  assert.match(html, /href="\/how-to-use-the-map\/"/)
  assert.match(html, /application\/ld\+json/)
  assert.match(html, /Not the official website of Byculla Zoo/)
})

test('robots.txt allows crawling and points at the production sitemap', () => {
  const robots = readFileSync(resolve(root, 'public/robots.txt'), 'utf8')
  assert.match(robots, /User-agent:\s*\*/)
  assert.match(robots, /Allow:\s*\//)
  assert.match(robots, new RegExp(`Sitemap:\\s*${escapeRegExp(siteOrigin)}/sitemap.xml`))
  assert.doesNotMatch(robots, /Disallow:\s*\//)
  assert.doesNotMatch(robots, /byculla-zoo-map-7t74/)
})

test('sitemap.xml lists only canonical indexable production URLs', () => {
  const sitemap = readFileSync(resolve(root, 'public/sitemap.xml'), 'utf8')
  assert.match(sitemap, /<urlset/)
  assert.match(sitemap, new RegExp(`<loc>${escapeRegExp(siteOrigin)}/</loc>`))
  for (const page of contentPages) {
    assert.match(sitemap, new RegExp(`<loc>${escapeRegExp(siteOrigin + page.path)}</loc>`))
  }
  assert.doesNotMatch(sitemap, /\/admin</)
  assert.doesNotMatch(sitemap, /\/legacy-v1</)
  assert.doesNotMatch(sitemap, /byculla-zoo-map-7t74/)
})

test('content pages ship as static HTML with unique titles and H1s', () => {
  for (const page of contentPages) {
    const file = resolve(root, `public${page.path}index.html`)
    assert.equal(existsSync(file), true, file)
    const html = readFileSync(file, 'utf8')
    assert.match(html, new RegExp(`<title>${escapeRegExp(page.title)}</title>`))
    assert.match(html, new RegExp(`content="${escapeRegExp(page.description)}"`))
    assert.match(html, new RegExp(`rel="canonical" href="${escapeRegExp(siteOrigin + page.path)}"`))
    assert.match(html, /<h1>/)
    assert.match(html, /href="\/"/)
    assert.doesNotMatch(html, /noindex/)
    assert.match(html, /independent|not affiliated|not an official/i)
  }
})

test('open graph preview image is present for social sharing', () => {
  const bytes = readFileSync(resolve(root, `public${ogImagePath}`))
  assert.ok(bytes.byteLength > 10_000)
  assert.equal(bytes[0], 0xff)
  assert.equal(bytes[1], 0xd8)
})

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
