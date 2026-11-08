// SOURCING: wouter (the routes: the page, one addressable story per component, not found)
import { Route, Switch } from 'wouter'
import { Page } from './page'
import { HowItWorks, OurThinking } from './reading/reading-page'
import { StoryRoute } from './stories'

export function App() {
  return (
    <Switch>
      <Route path="/" component={() => <Page />} />
      <Route path="/how-it-works" component={HowItWorks} />
      <Route path="/our-thinking" component={OurThinking} />
      <Route path="/story/:id">{({ id }) => <StoryRoute id={id} />}</Route>
      <Route>
        <NotFound />
      </Route>
    </Switch>
  )
}

function NotFound() {
  return (
    <main className="grid min-h-svh place-items-center p-6 text-center">
      <div>
        <p className="text-3xl font-semibold tracking-tight">Nothing lives here.</p>
        <p className="mt-4 text-sm text-muted-ink">
          404 ·{' '}
          <a className="text-slate underline underline-offset-4" href="/">
            Back to Theorem
          </a>
        </p>
      </div>
    </main>
  )
}
