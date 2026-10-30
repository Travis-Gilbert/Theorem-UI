import { Closing } from './components/Closing'
import { Faq } from './components/Faq'
import { Features } from './components/Features'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { Marquee } from './components/Marquee'
import { Statement } from './components/Statement'
import { Steps } from './components/Steps'

export function App() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Marquee />
        <Statement />
        <Steps />
        <Features />
        <Faq />
        <Closing />
      </main>
      <Footer />
    </>
  )
}
