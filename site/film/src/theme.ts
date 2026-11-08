// SOURCING: @remotion/fonts (loadFont holds the render until a face is ready). The palette is the site's, from src/styles.css.
import { loadFont } from '@remotion/fonts'
import { staticFile } from 'remotion'

export const PAPER = '#F1F3F5'
export const RAISED_PAPER = '#F8F9FA'
export const SLATE = '#202733'
export const RAISED_SLATE = '#2C3544'
export const MUTED = '#626B78'
export const BRASS = '#C8A45D'
export const DARK_BRASS = '#806126'

export const SANS = '"IBM Plex Sans", sans-serif'
export const TITLE = '"Block Berthold Condensed", sans-serif'

void loadFont({
  family: 'IBM Plex Sans',
  url: staticFile('fonts/ibm-plex-sans-latin-wght-normal.woff2'),
  weight: '100 700',
})
void loadFont({
  family: 'Block Berthold Condensed',
  url: staticFile('fonts/BlockBertholdCondensed.ttf'),
})

/** `tube` is the study's monitor: the desktop cut at the tube's raster proportions. */
export type Layout = 'desktop' | 'phone' | 'tube'

/** Everything but the phone is composed landscape, like the desktop. */
export const landscape = (layout: Layout) => layout !== 'phone'

/** The composition's own unit: type sizes below are written for these widths. */
export const unit = (layout: Layout, width: number) =>
  width / (landscape(layout) ? 1920 : 780)
