import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const root=process.cwd(),out='docs/plans/composable-appearance/evidence/design-oracles-final'
const manifest=JSON.parse(await readFile(resolve(root,out,'matrix-manifest.json'),'utf8'))
const fixtures=new Set(['F03','F04','F05','F08'])
const rows=manifest.plannedRuns.filter(row=>fixtures.has(row.fixtureId))
let failed=0
for(let index=0;index<rows.length;index++){
  const row=rows[index]
  const route={F03:'preview',F04:'content',F05:'draft',F08:'navigation'}[row.fixtureId]
  const url=`http://127.0.0.1:3117/story/design-oracle-${route}`
  const args=['scripts/design-oracles/run.mjs','--url',url,'--browser',row.engine,'--viewport',row.viewport,'--preset',row.preset,'--mode',row.mode,'--out',out]
  const child=spawnSync(process.execPath,args,{cwd:root,env:process.env,encoding:'utf8',maxBuffer:1024*1024})
  if(child.status!==0)failed++
  console.log(`[${index+1}/${rows.length}] ${row.engine} ${row.preset}/${row.mode} ${row.viewport} ${row.fixtureId}: ${child.status===0?'completed':'recorded gate status'}${child.error?` ${child.error}`:''}`)
}
console.log(`Reruns ${rows.length}; runner nonzero exits ${failed}`)
