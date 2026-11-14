#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const runner=resolve(dirname(fileURLToPath(import.meta.url)),'run.mjs')
const colorAudit=resolve(dirname(fileURLToPath(import.meta.url)),'check-colors.mjs')
const normalizer=resolve(dirname(fileURLToPath(import.meta.url)),'normalize-reports.mjs')
const aggregator=resolve(dirname(fileURLToPath(import.meta.url)),'aggregate.mjs')
const output='docs/plans/composable-appearance/evidence/design-oracles-final'
const server=process.env.ORACLE_URL??'http://127.0.0.1:3117/story'
const engines=['chromium','firefox','webkit']
const states=[
  {preset:'calm',mode:'light',fixtures:['empty','long','preview','content','draft','stream','failure','navigation','reflow','rtl','continuity'],viewports:['1440x900']},
  {preset:'calm',mode:'dark',fixtures:['empty','long','content','draft','navigation','continuity'],viewports:['1440x900']},
  {preset:'expressive',mode:'light',fixtures:['long','content','draft','navigation','continuity'],viewports:['1440x900']},
]
const runs=[]
for(const state of states)for(const engine of engines)for(const fixture of state.fixtures)for(const viewport of state.viewports)runs.push({state,engine,fixture,viewport})
for(const engine of engines)for(const fixture of ['draft','navigation','reflow','rtl'])for(const viewport of ['320x720','390x844'])runs.push({state:{preset:'calm',mode:'light'},engine,fixture,viewport})
for(const engine of engines)for(const fixture of ['draft','navigation'])for(const viewport of ['1024x768','1920x1080'])runs.push({state:{preset:'calm',mode:'light'},engine,fixture,viewport})

await mkdir(resolve(root,output),{recursive:true})
const manifest={policy:'theorem-appearance-v1',plannedRuns:runs.map(({state,engine,fixture,viewport})=>({engine,...state,fixture,fixtureId:`F${String(['empty','long','preview','content','draft','stream','failure','navigation','reflow','rtl','continuity'].indexOf(fixture)+1).padStart(2,'0')}`,viewport,report:`report-${engine}-${state.preset}-${state.mode}-${viewport}-design-oracle-${fixture}.json`}))}
await writeFile(resolve(root,output,'matrix-manifest.json'),`${JSON.stringify(manifest,null,2)}\n`)
if(process.argv.includes('--manifest-only')){console.log(`Manifest: ${runs.length} required browser reports`);process.exit(0)}

// A failed child must not leave a previous run's report eligible for this
// manifest. All files below are generated outputs owned by this matrix.
for (const row of manifest.plannedRuns) {
  await rm(resolve(root, output, row.report), { force: true })
  await rm(resolve(root, output, row.report.replace(/\.json$/, '.md')), { force: true })
}
await rm(resolve(root, output, 'matrix-summary.json'), { force: true })
await rm(resolve(root, output, 'matrix-summary.md'), { force: true })

let nonzeroRuns=0
let nextIndex=0
const worker=async()=>{
  while(nextIndex<runs.length){
    const index=nextIndex++,{state,engine,fixture,viewport}=runs[index]
    const url=`${server}/design-oracle-${fixture}`
    const status=await new Promise(resolveStatus=>{
      const child=spawn(process.execPath,[runner,'--url',url,'--browser',engine,'--viewport',viewport,'--preset',state.preset,'--mode',state.mode,'--out',output],{cwd:root,env:process.env,stdio:'ignore'})
      child.on('error',()=>resolveStatus(1))
      child.on('close',code=>resolveStatus(code??1))
    })
    if(status!==0)nonzeroRuns++
    console.log(`[${index+1}/${runs.length}] ${engine} ${state.preset}/${state.mode} ${viewport} F${String(['empty','long','preview','content','draft','stream','failure','navigation','reflow','rtl','continuity'].indexOf(fixture)+1).padStart(2,'0')} ${status===0?'completed':'recorded; see aggregate verdict'}`)
  }
}
await Promise.all(Array.from({length:Math.min(3,runs.length)},()=>worker()))
const palette=spawnSync(process.execPath,[colorAudit],{cwd:root,env:process.env,stdio:'inherit'})
const normalized=spawnSync(process.execPath,[normalizer,'--in',output,'--audit','docs/plans/composable-appearance/evidence/colors.json'],{cwd:root,env:process.env,stdio:'inherit'})
const summary=spawnSync(process.execPath,[aggregator,'--in',output,'--out',`${output}/matrix-summary.json`],{cwd:root,env:process.env,stdio:'inherit'})
console.log(`Browser reports: ${runs.length}; child runner nonzero exits: ${nonzeroRuns}; color audit exit: ${palette.status}; normalization exit: ${normalized.status}; aggregate exit: ${summary.status}`)
// Per-fixture missing roles can be satisfied across the declared fixture
// scope. The aggregate owns that gate; missing or malformed reports still fail.
process.exitCode=(palette.status??1)!==0||(normalized.status??1)!==0||(summary.status??1)!==0?1:0
