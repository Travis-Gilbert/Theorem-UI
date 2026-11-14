#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const args=process.argv.slice(2)
const value=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1]}
const root=resolve(value('--in','docs/plans/composable-appearance/evidence/design-oracles-final'))
const audit=resolve(value('--audit','docs/plans/composable-appearance/evidence/colors.json'))
const auditBytes=await readFile(audit)
const auditSha256=createHash('sha256').update(auditBytes).digest('hex')
const auditData=JSON.parse(auditBytes)
const purePaletteRows=auditData.results.filter(row=>row.id.startsWith('COL-01.minimum.')||row.id.startsWith('COL-01.contract.'))
const paletteSummary={
  count:54,
  builtInModeCount:auditData.modes,
  predicateRecordCount:purePaletteRows.length,
  byClass:Object.fromEntries(['Standard','Contract'].map(className=>[className,purePaletteRows.filter(row=>row.class===className).length])),
  statuses:Object.fromEntries(['pass','fail','review','not-measurable','not-applicable'].map(status=>[status,purePaletteRows.filter(row=>(row.status??row.result)===status).length])),
  auditPath:'../colors.json',sha256:auditSha256,
}
const paletteMinRows=purePaletteRows.filter(row=>row.id.startsWith('COL-01.minimum.'))
const paletteContractRows=purePaletteRows.filter(row=>row.id.startsWith('COL-01.contract.'))
const emittedModeRows=auditData.results.filter(row=>row.id.startsWith('COL-04.emitted-colors.'))
const concise=(value,max=240)=>{const text=typeof value==='string'?value:JSON.stringify(value);return text.length>max?`${text.slice(0,max-3)}...`:text}
const renderMarkdown=(report)=>{
  const counts=Object.fromEntries(['pass','fail','review','not-measurable','not-applicable'].map(status=>[status,report.results.filter(row=>row.result===status).length]))
  const rows=report.results.filter(row=>['fail','review','not-measurable'].includes(row.result))
  return [
    `# Design oracle report — theorem-appearance-v1 v1.0.0`,'',
    `Revision: ${report.environment.revision??'unknown'}  `,
    `URL: ${report.environment.url}  `,
    `Browser: ${report.environment.browser??'unavailable'}  `,
    `Viewport: ${report.environment.viewport.width} × ${report.environment.viewport.height} CSS px  `,
    `Corpus SHA-256: ${report.corpus.sha256} (${report.corpus.valid?'verified':'MISMATCH'})`,'',
    `Results: ${counts.pass} pass, ${counts.fail} fail, ${counts.review} review, ${counts['not-measurable']} not-measurable, ${counts['not-applicable']} not-applicable.`,
    `Matrix route: ${report.coverage.renderedResultCount} group/child predicates retained; independent palette audit covers ${paletteSummary.count} role edges across ${paletteSummary.builtInModeCount} built-in modes (${auditSha256}).`,
    '', 'No aggregate design score is produced. Missing required evidence remains not-measurable.','',
    '## Failures, reviews, and measurement gaps','',
    ...(rows.length?rows.map(row=>`- **${row.result.toUpperCase()} ${row.id}** (${row.class}; ${row.fixture}): ${concise(row.observed)}`):['None.']),
    '',
  ].join('\n')
}
const files=(await readdir(root)).filter(name=>/^report-.*\.json$/.test(name))
for(const file of files){
  const path=resolve(root,file),report=JSON.parse(await readFile(path,'utf8'))
  const col01=report.results.find(row=>row.id==='COL-01')
  const renderedPairs=col01?.observed?.renderedPairs??[]
  if(col01&&col01.observed){
    col01.observed.palettePairCount=paletteMinRows.length
    col01.observed.expectedPalettePairCount=54*8
    col01.observed.palettePairs=paletteSummary
    col01.observed.renderedPairs=renderedPairs
    col01.evidence={...col01.evidence,paletteAudit:{path:'../colors.json',sha256:auditSha256,independent:true}}
  }
  // Normalization is lossless with respect to verdicts. The browser runner
  // owns rendered coverage and paint predicates; a passing palette audit must
  // never replace a failing or missing rendered observation.
  for(const [id,rows] of [['COL-01.minimum',paletteMinRows],['COL-01.product-minimum',paletteContractRows]]){
    const child=report.results.find(row=>row.id===id)
    if(child){
      child.observed={...child.observed,palettePairs:rows.length,expectedPalettePairs:54*8,failedPalettePairs:rows.filter(row=>(row.status??row.result)==='fail').map(row=>row.id),renderedPairs:renderedPairs.length,failedRenderedPairs:renderedPairs.filter(row=>row.status==='fail')}
      child.evidence={...child.evidence,paletteAudit:{path:'../colors.json',sha256:auditSha256,independent:true}}
    }
  }
  const col04=report.results.find(row=>row.id==='COL-04')
  if(col04){col04.observed={...col04.observed,emittedModeCount:emittedModeRows.length,modeStatuses:emittedModeRows.map(row=>({id:row.id,status:row.status??row.result}))};col04.evidence={...col04.evidence,paletteAudit:{path:'../colors.json',sha256:auditSha256,independent:true}}}
  report.results=report.results.filter(row=>!row.id.startsWith('COL-01.minimum.')&&!row.id.startsWith('COL-01.contract.')&&!row.id.startsWith('COL-04.emitted-colors.'))
  report.coverage.paletteAudit={...paletteSummary,independentPalettePairs:paletteSummary.count}
  report.coverage.emittedModeAudit={path:'../colors.json',sha256:auditSha256,modeCount:emittedModeRows.length,modeStatuses:emittedModeRows.map(row=>({id:row.id,status:row.status??row.result}))}
  report.coverage.renderedResultCount=report.results.length
  await writeFile(path,`${JSON.stringify(report,null,2)}\n`)
  await writeFile(path.replace(/\.json$/i,'.md'),renderMarkdown(report))
}
console.log(`Normalized ${files.length} rendered reports; ${purePaletteRows.length} palette-pair rows in authoritative audit SHA-256 ${auditSha256}`)
