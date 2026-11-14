#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { CHILD_ORACLES, FIXTURES, ORACLES, POLICY } from './registry.mjs'
import { validateColorStateEvidence } from './color-states.mjs'

const args=process.argv.slice(2)
const value=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1]}
const root=resolve(value('--in','docs/plans/composable-appearance/evidence/design-oracles-final'))
const blockingClass=(value)=>String(value).split('+').some(part=>['Contract','Standard'].includes(part.trim()))
const out=resolve(value('--out','docs/plans/composable-appearance/evidence/design-oracles-final/matrix-summary.json'))
const files=(await readdir(root)).filter(name=>/^report-.*\.json$/.test(name)).sort()
let manifest=null, manifestError=null
try{manifest=JSON.parse(await readFile(resolve(root,'matrix-manifest.json'),'utf8'));if(!Array.isArray(manifest.plannedRuns)||!manifest.plannedRuns.length)throw new Error('nonempty plannedRuns required')}catch(error){manifestError=String(error);manifest=null}
const reports=[]
const malformedReports=[]
for(const file of files)try{const report=JSON.parse(await readFile(resolve(root,file),'utf8'));if(!Array.isArray(report.results)||!report.environment||!report.policy)throw new Error('required report fields absent');reports.push({file,report})}catch(error){malformedReports.push({file,error:String(error).slice(0,200)})}
const fixtureFor=(report)=>report.observations?.fixtureRoots?.[0]??null
const fixtureScope=(scope)=>{
  if(scope==='all'||scope==='palette-matrix')return FIXTURES.map(x=>x.id)
  return String(scope).split(',').flatMap(part=>{const range=part.match(/^(F\d{2})-(F\d{2})$/);if(range)return FIXTURES.map(x=>x.id).filter(id=>id>=range[1]&&id<=range[2]);return [part]})
}
const resultFor=(report,id)=>report.results?.find(result=>result.id===id)
const actualFiles=new Set(reports.map(row=>row.file))
const reportByFile=new Map(reports.map(row=>[row.file,row.report]))
const expectedMismatch=(manifest?.plannedRuns??[]).flatMap(row=>{const report=reportByFile.get(row.report);if(!report)return[];const actual={fixtureId:fixtureFor(report),browser:report.environment.browser?.split(' ')[0],preset:report.environment.requestedState?.preset,mode:report.environment.requestedState?.mode,viewport:`${report.environment.viewport?.width}x${report.environment.viewport?.height}`};const expected={fixtureId:row.fixtureId,browser:row.engine,preset:row.preset,mode:row.mode,viewport:row.viewport};return Object.keys(expected).some(key=>actual[key]!==expected[key])?[{report:row.report,expected,actual}]:[]})
const missingExpectedReports=(manifest?.plannedRuns??[]).filter(row=>!actualFiles.has(row.report)).map(row=>({report:row.report,engine:row.engine,preset:row.preset,mode:row.mode,fixtureId:row.fixtureId,viewport:row.viewport}))
let colorStates
try {
  const path=resolve(root,'../review/color-states.json')
  const bytes=await readFile(path)
  colorStates={...validateColorStateEvidence(JSON.parse(bytes)),path,sha256:createHash('sha256').update(bytes).digest('hex')}
} catch(error) { colorStates={status:'not-measurable',missing:[{reason:String(error)}],failed:[]} }
const requireColorStates=(status)=>status==='fail'||colorStates.status==='fail'?'fail':status==='pass'&&colorStates.status==='pass'?'pass':status==='review'?'review':'not-measurable'
const aggregates=[]
for(const oracle of ORACLES){
  const required=fixtureScope(oracle.fixture)
  let relevant=reports.filter(({report})=>required.includes(fixtureFor(report)))
  if(oracle.id==='ENV-02'||oracle.id==='TYP-07')relevant=relevant.filter(({report})=>report.environment.browser?.startsWith('chromium'))
  if(oracle.id==='ENV-02'||oracle.id==='TYP-02')relevant=relevant.filter(({report})=>report.environment.viewport?.width===1440)
  if(oracle.id==='COL-05')relevant=relevant.filter(({report})=>report.environment.requestedState?.preset==='calm')
  const byFixture=Object.fromEntries(required.map(fixture=>{
    const rows=relevant.filter(({report})=>fixtureFor(report)===fixture)
    return [fixture,{runs:rows.map(({file,report})=>({file,browser:report.environment.browser,viewport:report.environment.viewport,requestedState:report.environment.requestedState,result:resultFor(report,oracle.id)?.result??'not-measurable'})),covered:rows.length>0}]
  }))
  const scheduled=manifest?.plannedRuns?.filter(row=>required.includes(row.fixtureId)&&(oracle.id!=='ENV-02'&&oracle.id!=='TYP-07'||row.engine==='chromium')&&(oracle.id!=='COL-05'||row.preset==='calm')&&(oracle.id!=='ENV-02'&&oracle.id!=='TYP-02'||row.viewport==='1440x900'))??[]
  const missingScheduled=manifest?scheduled.filter(row=>!actualFiles.has(row.report)).map(row=>row.report):[]
  let status='not-measurable', special=null
  if(oracle.id==='TYP-01'){
    const measured=relevant.flatMap(({report})=>Array.isArray(resultFor(report,'TYP-01')?.observed)?resultFor(report,'TYP-01').observed:[])
    const expectedRoles=['prose','composer.content','ui.label','ui.section','ui.group','metadata','code','heading.small','heading.medium','heading.large']
    const covered=Object.fromEntries(expectedRoles.map(role=>[role,measured.filter(item=>item.role===role&&item.result!=='not-measurable')]))
    const missing=expectedRoles.filter(role=>!covered[role].length)
    const failures=measured.filter(item=>item.result==='fail')
    status=failures.length?'fail':missing.length||missingScheduled.length||required.some(fixture=>!byFixture[fixture].covered)||!manifest?'not-measurable':'pass'
    special={expectedRoles,missingRoles:missing,failedRecipes:failures,recipeObservations:measured.length,missingScheduledReports:missingScheduled}
  } else if(oracle.id==='COL-05') {
    const expectedRoles=['canvas','navigation','composer','user-message','assistant-reading']
    const modes={light:{valuesByRole:{},reports:0},dark:{valuesByRole:{},reports:0}}
    const deviations=[]
    for(const {file,report} of relevant){
      const check=resultFor(report,'COL-05')?.observed
      const mode=report.environment.requestedState?.mode
      if(!check?.values||!modes[mode])continue
      modes[mode].reports++
      for(const [role,value]of Object.entries(check.values))if(value)modes[mode].valuesByRole[role]=value
      if(check.failures?.length)deviations.push({file,fixture:fixtureFor(report),mode,failures:check.failures})
    }
    const missingRoles=Object.fromEntries(Object.entries(modes).map(([mode,data])=>[mode,expectedRoles.filter(role=>!data.valuesByRole[role])]))
    const rows=relevant.map(({file,report})=>({file,result:resultFor(report,'COL-05')?.result??'not-measurable'}))
    const failed=rows.some(row=>row.result==='fail'),review=rows.some(row=>row.result==='review')
    status=failed?'fail':review?'review':Object.values(missingRoles).some(roles=>roles.length)||missingScheduled.length||required.some(fixture=>!byFixture[fixture].covered)||!manifest?'not-measurable':'pass'
    special={expectedRoles,missingRoles,modes,deviations,calmReports:rows.length,missingScheduledReports:missingScheduled}
  } else if(oracle.id==='COL-04') {
    let audit=null
    try{audit=JSON.parse(await readFile(resolve(root,'../colors.json'),'utf8'))}catch{}
    const modes=audit?.results?.filter(item=>item.id.startsWith('COL-04.emitted-colors.'))??[]
    status=!audit?'not-measurable':modes.length===8&&modes.every(item=>(item.status??item.result)==='pass')?'pass':modes.some(item=>(item.status??item.result)==='fail')?'fail':'not-measurable'
    special={paletteAuditPath:'../colors.json',emittedModeCount:modes.length,modeStatuses:modes.map(item=>({id:item.id,status:item.status??item.result}))}
  } else {
    const missingFixtures=required.filter(fixture=>!byFixture[fixture].covered)
    const observed=relevant.map(({report})=>resultFor(report,oracle.id)?.result??'not-measurable')
    const applicable=observed.filter(item=>item!=='not-applicable')
    status=observed.includes('fail')?'fail':observed.includes('review')?'review':missingFixtures.length||missingScheduled.length||observed.includes('not-measurable')||!observed.length?'not-measurable':!applicable.length?'not-applicable':applicable.every(item=>item==='pass')?'pass':'not-measurable'
    special={missingFixtures,missingScheduledReports:missingScheduled}
  }
  if(oracle.id==='COL-01'){status=requireColorStates(status);special={...special,interactionStateEvidence:{status:colorStates.status,path:colorStates.path,sha256:colorStates.sha256,missing:colorStates.missing,failed:colorStates.failed}}}
  aggregates.push({id:oracle.id,version:oracle.version,class:oracle.class,scope:oracle.fixture,requiredFixtures:required,result:status,byFixture,...special})
}
const childAggregates=CHILD_ORACLES.map(child=>{
  const parent=ORACLES.find(item=>item.id===child.parent)
  const required=fixtureScope(child.fixture??parent?.fixture??'all')
  let relevant=reports.filter(({report})=>required.includes(fixtureFor(report)))
  if(child.id.startsWith('COL-05.'))relevant=relevant.filter(({report})=>report.environment.requestedState?.preset==='calm')
  if(child.id==='SPC-07.reflow')relevant=relevant.filter(({report})=>report.environment.browser?.startsWith('chromium')&&[320].includes(report.environment.viewport?.width)&&['F09','F10'].includes(fixtureFor(report)))
  if(child.id==='ARC-04.native-composition')relevant=relevant.filter(({report})=>report.environment.browser?.startsWith('chromium'))
  const observed=relevant.map(({file,report})=>({file,result:resultFor(report,child.id)?.result??'not-measurable',observed:resultFor(report,child.id)?.observed??null}))
  const missing=required.filter(fixture=>!relevant.some(({report})=>fixtureFor(report)===fixture))
  const applicable=observed.filter(row=>row.result!=='not-applicable')
  let result=applicable.some(row=>row.result==='fail')?'fail':applicable.some(row=>row.result==='review')?'review':missing.length||!observed.length||applicable.some(row=>row.result==='not-measurable')?'not-measurable':!applicable.length?'not-applicable':applicable.every(row=>['pass','not-applicable'].includes(row.result))?'pass':'not-measurable'
  if(['COL-01.minimum','COL-01.product-minimum'].includes(child.id))result=requireColorStates(result)
  let combined=null
  if(child.id==='COL-05.lightness-hierarchy'){
    const group=aggregates.find(row=>row.id==='COL-05')
    result=group.result
    combined={modes:group.modes,missingRoles:group.missingRoles}
  }
  if(child.id==='COL-05.required-flat'){
    const expectedRoles=['canvas','navigation','composer','user-message','assistant-reading']
    const modeCoverage=Object.fromEntries(['light','dark'].map(mode=>[mode,new Set()]))
    for(const {report} of relevant){
      const mode=report.environment.requestedState?.mode,check=resultFor(report,child.id)
      if(check?.result==='fail'||!modeCoverage[mode])continue
      for(const role of check?.observed?.measuredRoles??[])modeCoverage[mode].add(role)
    }
    const missingRoles=Object.fromEntries(Object.entries(modeCoverage).map(([mode,roles])=>[mode,expectedRoles.filter(role=>!roles.has(role))]))
    result=applicable.some(row=>row.result==='fail')?'fail':missing.length||Object.values(missingRoles).some(roles=>roles.length)||!manifest?'not-measurable':'pass'
    combined={measuredRoles:Object.fromEntries(Object.entries(modeCoverage).map(([mode,roles])=>[mode,[...roles]])),missingRoles}
  }
  if(child.id==='SPC-01.group-hierarchy'){
    const densities={}
    for(const {report} of relevant){
      const check=resultFor(report,'SPC-01')?.observed
      if(!check?.density)continue
      const roles=densities[check.density]??={}
      for(const item of check.observed??[])if(Number.isFinite(item.measured)&&['within-controls','related-controls','group-gap'].includes(item.role)){
        (roles[item.role]??=[]).push(item.measured)
      }
    }
    const coverage=Object.entries(densities).map(([density,roles])=>({density,roles,complete:['within-controls','related-controls','group-gap'].every(role=>roles[role]?.length),ordered:Math.max(...(roles['within-controls']??[Infinity]))<Math.min(...(roles['related-controls']??[-Infinity]))&&Math.max(...(roles['related-controls']??[Infinity]))<Math.min(...(roles['group-gap']??[-Infinity]))}))
    result=applicable.some(row=>row.result==='fail')?'fail':coverage.some(row=>row.complete&&!row.ordered)?'review':missing.length||!coverage.length||coverage.some(row=>!row.complete)||!manifest?'not-measurable':'pass'
    combined={densityCoverage:coverage}
  }
  return {id:child.id,parent:child.parent,class:child.class,predicate:child.predicate,requiredFixtures:required,result,missingFixtures:missing,observations:observed,combined}
})
// A fixture containing only one control group has no between-group gap to
// measure. Combine the named density roles across the declared fixture scope,
// while requiring every fixture's authored-token contract independently.
const spacingGroup=aggregates.find(row=>row.id==='SPC-01')
const spacingTokens=childAggregates.find(row=>row.id==='SPC-01.token-consumption')
const spacingHierarchy=childAggregates.find(row=>row.id==='SPC-01.group-hierarchy')
if(spacingGroup&&spacingTokens&&spacingHierarchy){
  const children=[spacingTokens.result,spacingHierarchy.result]
  spacingGroup.result=children.includes('fail')?'fail':children.includes('review')?'review':!manifest||spacingGroup.missingFixtures?.length||spacingGroup.missingScheduledReports?.length||children.some(result=>result!=='pass')?'not-measurable':'pass'
  spacingGroup.combined={tokenConsumption:spacingTokens.result,groupHierarchy:spacingHierarchy.result,...spacingHierarchy.combined}
}
const tally=Object.fromEntries(['pass','fail','review','not-measurable','not-applicable'].map(status=>[status,aggregates.filter(row=>row.result===status).length]))
const sourceDigests=await Promise.all(reports.map(async({file})=>({file,sha256:createHash('sha256').update(await readFile(resolve(root,file))).digest('hex')})))
const childTally=Object.fromEntries(['pass','fail','review','not-measurable','not-applicable'].map(status=>[status,childAggregates.filter(row=>row.result===status).length]))
const summary={policy:POLICY,manifestError,colorStateEvidence:colorStates,generatedAt:new Date().toISOString(),inputDirectory:root,reportCount:reports.length,expectedReportCount:manifest?.plannedRuns?.length??null,missingExpectedReports,malformedReports,expectedTupleMismatches:expectedMismatch,sourceDigests,tally,oracles:aggregates,childTally,childOracles:childAggregates,limitations:['A group can pass only when every fixture in its declared scope has a report and all applicable predicates pass.','TYP-01 combines actual text-bearing recipe observations across its declared fixtures; missing required roles remain not-measurable.','Scheduled browser/state/viewport reports are verified against the explicit matrix manifest and parsed report metadata.','The palette validity/role-pair matrix is stored once in evidence/colors.json with a SHA-256 reference from each rendered report.','This aggregate does not infer fixture states from a story name or semantic hook.']}
await writeFile(out,`${JSON.stringify(summary,null,2)}\n`)
const lines=[`# Design oracle matrix summary — ${POLICY.id} v${POLICY.version}`,'',`Reports: ${reports.length}`,`Groups: ${tally.pass} pass, ${tally.fail} fail, ${tally.review} review, ${tally['not-measurable']} not-measurable.`,`Child predicates: ${childTally.pass} pass, ${childTally.fail} fail, ${childTally.review} review, ${childTally['not-measurable']} not-measurable.`,'','No aggregate design score is produced. Missing required fixture evidence remains not-measurable.','','## Oracle results','',...aggregates.map(row=>`- **${row.id}** (${row.class}): ${row.result}; fixtures ${row.requiredFixtures.filter(f=>row.byFixture[f]?.covered).length}/${row.requiredFixtures.length} — ${JSON.stringify(row.special??row.missingFixtures??{})}`),'','','## Child predicates','',...childAggregates.map(row=>`- **${row.id}** (${row.class}): ${row.result}; ${row.missingFixtures.length?`missing fixtures: ${row.missingFixtures.join(', ')}`:`${row.observations.length} report observations`}`),'']
await writeFile(out.replace(/\.json$/i,'.md'),lines.join('\n'))
console.log(lines.slice(0,6).join('\n'))
process.exitCode=aggregates.some(row=>row.result==='fail'||row.result==='review'||row.result==='not-measurable'&&blockingClass(row.class))||childAggregates.some(row=>row.result==='fail'||row.result==='review'||row.result==='not-measurable'&&blockingClass(row.class))||Boolean(manifestError)||missingExpectedReports.length>0||malformedReports.length>0||expectedMismatch.length>0?1:0
