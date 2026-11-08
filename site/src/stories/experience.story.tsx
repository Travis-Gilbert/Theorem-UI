// SOURCING: hand-rolled. The whole page against the fixture app, with every failure reachable by URL: `?delay=ms`, `?fail=reason`, `?silent`, `?film=short|broken`, `?absent`, `?real`.
import { Page } from '@/page'
import { filmAssets } from '@/experience/experience'
import type { FilmAssets } from '@/experience/experience'
import { liveUrl } from '@/lib/live'
import { useFieldProbe } from './field-probe'

const short = '/film/fixture/short.mp4'
const fixtureFilm: FilmAssets = {
  captions: '/film/fixture/short.vtt',
  desktop: {
    film: short,
    poster: '/film/fixture/poster.jpg',
    still: '/film/fixture/final-desktop.png',
  },
  phone: {
    film: short,
    poster: '/film/fixture/poster.jpg',
    still: '/film/fixture/final-phone.png',
  },
  tube: {
    film: short,
    poster: '/film/fixture/poster.jpg',
    still: '/film/fixture/final-desktop.png',
    ambient: filmAssets.tube.ambient,
  },
}

const broken = (assets: FilmAssets): FilmAssets => ({
  ...assets,
  desktop: { ...assets.desktop, film: '/film/fixture/missing.mp4' },
  phone: { ...assets.phone, film: '/film/fixture/missing.mp4' },
  tube: { ...assets.tube, film: '/film/fixture/missing.mp4' },
})

export default function ExperienceStory() {
  useFieldProbe()
  const params = new URLSearchParams(location.search)
  const child = new URLSearchParams()
  for (const key of ['delay', 'fail', 'silent'])
    if (params.has(key)) child.set(key, params.get(key) ?? '')
  const appUrl = params.has('absent')
    ? null
    : params.has('real')
      ? liveUrl
      : `/story/demo-fixture?${child}`
  const film = params.get('film')
  const assets =
    film === 'real'
      ? filmAssets
      : film === 'broken'
        ? broken(fixtureFilm)
        : fixtureFilm
  return <Page appUrl={appUrl} assets={assets} />
}
