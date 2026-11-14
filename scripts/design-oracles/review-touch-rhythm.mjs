import { launchReviewBrowser, reviewOutput } from './review-browser.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const base = process.env.ORACLE_BASE ?? 'http://127.0.0.1:3117'
const output = reviewOutput
await mkdir(output, { recursive: true })
const browser=await launchReviewBrowser()
const results=[]
try {
 for (const density of ['comfortable','touch']) for(const width of [1440,320]){
  const p=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'})
  const errors=[];p.on('pageerror',e=>errors.push(e.message))
  await p.addInitScript(density=>{localStorage.setItem('theorem-ui-theme','light');localStorage.setItem('theorem-ui:appearance',JSON.stringify({version:1,state:{preset:'calm',overrides:{density}}}))},density)
  await p.goto(`${base}/story/design-oracle-navigation`)
  const pin=p.getByRole('button',{name:'Pin to Theorem',exact:true})
  await pin.waitFor()
  await p.locator('.aui-composer-send').waitFor()
  const editor=p.getByRole('textbox',{name:'Message input'})
  await editor.fill('Draft for density measurement')
  await p.waitForFunction(()=>document.querySelector('.aui-composer-send')?.disabled===false)
  await p.evaluate(async () => {
   await document.fonts.ready
   await new Promise(requestAnimationFrame)
   await new Promise(requestAnimationFrame)
  })
  const measured=await p.evaluate(()=>{
   const minimum=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--appearance-control-min'))*parseFloat(getComputedStyle(document.documentElement).fontSize)
   const controls=[document.querySelector('button[aria-label="Pin to Theorem"]'),document.querySelector('header button[aria-label="More"]'),document.querySelector('.aui-composer-send')].map(n=>{
    const r=n.getBoundingClientRect()
    const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)
    return{label:n.getAttribute('aria-label'),x:r.x,y:r.y,width:r.width,height:r.height,inside:r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight,hit:n.contains(hit)}
   })
   const header=document.querySelector('[data-appearance-part=main] header')
   const inspector=document.querySelector('[data-appearance-part=inspector][data-overlay=true]')
   return{minimum,controls,headerBottom:header.getBoundingClientRect().bottom,overlayTop:inspector?.getBoundingClientRect().top??null,documentScrollWidth:document.documentElement.scrollWidth}
  })
  const passed=errors.length===0&&measured.documentScrollWidth<=width&&(measured.overlayTop===null||measured.overlayTop>=measured.headerBottom-1)&&measured.controls.every(r=>r.width>=measured.minimum&&r.height>=measured.minimum&&r.inside&&r.hit)
  results.push({density,width,passed,errors,...measured});await p.close()
 }
 for (const settings of [{},{scales:{content:1.25},font:{textFamily:'IBM Plex Sans Variable',comfortableMeasure:35.75,wideMeasure:44.75,contentLineHeight:1.75}}]) {
  const p=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'})
  const errors=[];p.on('pageerror',e=>errors.push(e.message))
  await p.addInitScript(overrides=>{localStorage.setItem('theorem-ui-theme','light');localStorage.setItem('theorem-ui:appearance',JSON.stringify({version:1,state:{preset:'calm',overrides}}))},settings)
  await p.goto(`${base}/story/design-oracle-long`)
  await p.getByRole('heading',{name:'Reading and writing',exact:true}).waitFor()
  const measured=await p.evaluate(async ()=>{
   await document.fonts.ready
   const prose=document.querySelector('.aui-md-p')
   const leading=parseFloat(getComputedStyle(prose).lineHeight)
   return {leading,headings:[...document.querySelectorAll('.aui-md h1,.aui-md h2,.aui-md h3')].filter(n=>n.previousElementSibling?.matches('.aui-md-p')&&n.nextElementSibling?.matches('.aui-md-p')).map(n=>{
    const box=n.getBoundingClientRect()
    return {heading:n.tagName,headingLeading:parseFloat(getComputedStyle(n).lineHeight),before:box.top-n.previousElementSibling.getBoundingClientRect().bottom,after:n.nextElementSibling.getBoundingClientRect().top-box.bottom}
   })}
  })
  const passed=errors.length===0&&measured.headings.length===3&&measured.headings.every(n=>Math.abs(n.before-1.5*measured.leading)<=0.25&&Math.abs(n.after-0.75*measured.leading)<=0.25)
  results.push({settings,passed,errors,...measured});await p.close()
 }
 await writeFile(resolve(output,'chromium-touch-and-rhythm.json'),JSON.stringify({generatedAt:new Date().toISOString(),engine:browser.version(),results},null,2)+'\n')
 console.log(JSON.stringify({checks:results.length,passed:results.filter(row=>row.passed).length,failed:results.filter(row=>!row.passed)},null,2))
 if(results.some(x=>!x.passed)) process.exitCode=1
}finally{await browser.close()}
