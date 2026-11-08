import { expect, test } from 'bun:test'
import { appSiteAssociation } from './apple-app-site-association'

test('serves nothing when no iOS app is configured', async () => {
  for (const configured of [undefined, '', ' , ']) {
    const response = appSiteAssociation(configured)
    expect(response.status).toBe(404)
    expect(await response.text()).toContain('No iOS app')
  }
})

test('names each configured app under webcredentials as JSON', async () => {
  const response = appSiteAssociation(
    'ABCDE12345.rs.theorem.app, ABCDE12345.rs.theorem.app.dev',
  )
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toStartWith('application/json')
  expect(await response.json()).toEqual({
    webcredentials: {
      apps: ['ABCDE12345.rs.theorem.app', 'ABCDE12345.rs.theorem.app.dev'],
    },
  })
})

test('refuses an entry that is not "<Team ID>.<bundle ID>"', async () => {
  for (const configured of ['rs.theorem.app', 'abcde12345.rs.theorem.app']) {
    const response = appSiteAssociation(configured)
    expect(response.status).toBe(500)
    expect(await response.text()).toContain(configured)
  }
})
