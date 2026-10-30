import {
  Architecture,
  Cli,
  Closing,
  Faq,
  Footer,
  Hero,
  Nav,
  Propositions,
  Thesis,
} from './components/sections'

export function App() {
  return (
    <div className="mx-auto max-w-[1440px] border-x border-line bg-paper">
      <Nav />
      <main>
        <Hero />
        <Thesis />
        <Propositions />
        <Architecture />
        <Cli />
        <Faq />
        <Closing />
      </main>
      <Footer />
    </div>
  )
}
