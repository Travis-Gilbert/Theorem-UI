// SOURCING: none — a committed fixture: the CPU vs GPU tradeoff as the
// Observable notebook form an agent would send. Generated cell by cell; edit
// the cells here and keep their ids, which selections name.
import type { ObservableNotebook } from '@/lib/notebooks/forms'

export const cpuGpuTradeoff: ObservableNotebook = {
  "form": "observable",
  "title": "When does a GPU pay off?",
  "cells": [
    {
      "id": "title",
      "kind": "md",
      "source": "# When does moving this workload to a GPU pay off?\n\n**Illustrative model.** A GPU only wins once its fixed costs are paid back. Change the workload and watch the crossover move. The timings are computed from the assumptions listed below, not measured."
    },
    {
      "id": "size",
      "kind": "js",
      "source": "const items = view(Inputs.range([1e3, 1e9], {label: \"Workload size (items)\", transform: Math.log, step: 1, value: 3e6}))"
    },
    {
      "id": "work",
      "kind": "js",
      "source": "const work = view(Inputs.range([1, 10000], {label: \"Compute per item (FLOPs)\", transform: Math.log, step: 1, value: 500}))"
    },
    {
      "id": "resident",
      "kind": "js",
      "source": "const resident = view(Inputs.toggle({label: \"Data already on the GPU\", value: false}))"
    },
    {
      "id": "replay",
      "kind": "js",
      "source": "const replay = view(Inputs.button(\"Replay timeline\"))"
    },
    {
      "id": "played",
      "kind": "js",
      "source": "// How many presses of Replay the timeline has already played. Nothing above\n// feeds this cell, so the object outlives every redraw of the timeline.\nconst played = {count: 0}"
    },
    {
      "id": "model",
      "kind": "js",
      "source": "// The cost model. Each processor pays a fixed cost, then works through the\n// items at whichever is slower: its arithmetic or its memory bandwidth (a\n// roofline). The GPU also pays to copy inputs over and results back, unless\n// the data already lives there.\nconst {cpu, gpu, link, bytesPerItem} = data.assumptions\nconst perItem = (p) => Math.max(work / (p.gflops * 1e9), bytesPerItem / (p.memoryGBps * 1e9)) * 1e3\nconst transferPerItem = resident ? 0 : (bytesPerItem / (link.GBps * 1e9)) * 1e3\nconst fixed = {cpu: cpu.dispatchMs, gpu: gpu.setupMs + gpu.launchMs}\nconst stagesAt = (n) => ({\n  CPU: [\n    {stage: \"setup\", ms: fixed.cpu},\n    {stage: \"transfer\", ms: 0},\n    {stage: \"compute\", ms: n * perItem(cpu)}\n  ],\n  GPU: [\n    {stage: \"setup\", ms: fixed.gpu},\n    {stage: \"transfer\", ms: n * transferPerItem},\n    {stage: \"compute\", ms: n * perItem(gpu)}\n  ]\n})\nconst totalAt = (n) => ({\n  CPU: fixed.cpu + n * perItem(cpu),\n  GPU: fixed.gpu + n * (transferPerItem + perItem(gpu))\n})\n// Both totals are straight lines in n, so they cross at most once.\nconst saving = perItem(cpu) - (perItem(gpu) + transferPerItem)\nconst crossover = saving > 0 ? (fixed.gpu - fixed.cpu) / saving : Infinity\nconst bound = (p) => work / (p.gflops * 1e9) >= bytesPerItem / (p.memoryGBps * 1e9) ? \"arithmetic\" : \"memory bandwidth\""
    },
    {
      "id": "formats",
      "kind": "js",
      "source": "function formatItems(n) {\n  return d3.format(\".3~s\")(n).replace(\"G\", \"B\") + \" items\"\n}\nfunction formatMs(ms) {\n  if (ms === 0) return \"0\"\n  if (ms < 1) return d3.format(\".3~r\")(ms * 1000) + \" µs\"\n  if (ms < 1000) return d3.format(\".3~r\")(ms) + \" ms\"\n  return d3.format(\".3~r\")(ms / 1000) + \" s\"\n}"
    },
    {
      "id": "explanation",
      "kind": "js",
      "source": "{\n  const totals = totalAt(items)\n  const winner = totals.GPU < totals.CPU ? \"GPU\" : \"CPU\"\n  const [gpuSetup, gpuTransfer, gpuCompute] = stagesAt(items).GPU\n  const ratio = Math.max(totals.CPU, totals.GPU) / Math.min(totals.CPU, totals.GPU)\n  const lead = html`<p><strong>The ${winner} finishes first</strong> at ${formatItems(items)} and ${Math.round(work)} FLOPs per item: ${formatMs(totals[winner])} against ${formatMs(totals[winner === \"GPU\" ? \"CPU\" : \"GPU\"])}, ${d3.format(\".2~f\")(ratio)}× sooner.</p>`\n  const why = winner === \"CPU\"\n    ? gpuTransfer.ms > gpuCompute.ms + gpuSetup.ms\n      ? \"Copying the data across the link costs the GPU more than its arithmetic saves.\"\n      : \"The work is too small to pay back the GPU's fixed setup and launch cost.\"\n    : \"There is enough work per run for the GPU's throughput to outweigh its fixed costs\" + (resident ? \", and the data never crosses the link.\" : \", even after copying the data across the link.\")\n  const where = Number.isFinite(crossover)\n    ? crossover <= items\n      ? `The GPU has been ahead since about ${formatItems(crossover)}.`\n      : `The GPU would pull ahead at about ${formatItems(crossover)}.`\n    : `At this compute per item the GPU never pulls ahead: each item costs more to copy than the CPU takes to process it. ${resident ? \"\" : \"Keeping the data on the GPU changes that.\"}`\n  const [cpuBound, gpuBound] = [bound(data.assumptions.cpu), bound(data.assumptions.gpu)]\n  const limits = cpuBound === gpuBound\n    ? `Both processors are limited by ${cpuBound} at this compute per item.`\n    : `The CPU is limited by ${cpuBound}, the GPU by ${gpuBound}.`\n  display(lead)\n  display(html`<p class=\"muted\">${why} ${where} ${limits}</p>`)\n}"
    },
    {
      "id": "timeline",
      "kind": "js",
      "source": "{\n  // A new press of Replay draws the timeline in motion; any other redraw\n  // (a control, the theme, the width) draws it at rest.\n  const rows = Object.entries(stagesAt(items)).map(([subject, stages], i) => ({\n    subject,\n    color: theme.series[i],\n    stages,\n    total: d3.sum(stages, (s) => s.ms)\n  }))\n  const winner = d3.least(rows, (r) => r.total).subject\n  const margin = {top: 22, right: 96, bottom: 26, left: 44}\n  const barHeight = 28\n  const gap = 14\n  const height = margin.top + rows.length * barHeight + (rows.length - 1) * gap + margin.bottom\n  const x = d3.scaleLinear()\n    .domain([0, d3.max(rows, (r) => r.total)])\n    .nice()\n    .range([margin.left, width - margin.right])\n  const shade = {setup: 0.3, transfer: 0.55, compute: 1}\n  const svg = d3.create(\"svg\")\n    .attr(\"viewBox\", [0, 0, width, height])\n    .attr(\"width\", width)\n    .attr(\"height\", height)\n    .attr(\"role\", \"img\")\n    .attr(\"aria-label\", `Completion time on one scale: CPU ${formatMs(rows[0].total)}, GPU ${formatMs(rows[1].total)}`)\n  // Stage key, in ink: shading carries the stage, colour only the subject.\n  const key = svg.append(\"g\").attr(\"transform\", `translate(${margin.left},8)`)\n  Object.entries(shade).forEach(([stage, opacity], i) => {\n    const g = key.append(\"g\").attr(\"transform\", `translate(${i * 86},0)`)\n    g.append(\"rect\").attr(\"width\", 10).attr(\"height\", 10).attr(\"y\", -5).attr(\"rx\", 2).attr(\"fill\", theme.ink).attr(\"fill-opacity\", opacity)\n    g.append(\"text\").attr(\"x\", 15).attr(\"dy\", \"0.32em\").attr(\"fill\", theme.inkMuted).text(stage)\n  })\n  svg.append(\"g\")\n    .attr(\"transform\", `translate(0,${height - margin.bottom})`)\n    .call(d3.axisBottom(x).ticks(Math.max(2, width / 110)).tickFormat(formatMs).tickSizeOuter(0))\n    .call((g) => g.selectAll(\".tick line\").clone().attr(\"y2\", -(height - margin.top - margin.bottom)).attr(\"stroke-opacity\", 0.12))\n  const reduce = matchMedia(\"(prefers-reduced-motion: reduce)\").matches\n  const animate = replay > played.count && !reduce\n  played.count = replay\n  const longest = d3.max(rows, (r) => r.total)\n  rows.forEach((row, i) => {\n    const y = margin.top + i * (barHeight + gap)\n    const g = svg.append(\"g\").attr(\"transform\", `translate(0,${y})`)\n    g.append(\"text\").attr(\"x\", margin.left - 8).attr(\"y\", barHeight / 2).attr(\"dy\", \"0.32em\").attr(\"text-anchor\", \"end\").attr(\"fill\", theme.ink).attr(\"font-weight\", 600).text(row.subject)\n    let start = 0\n    for (const s of row.stages) {\n      if (s.ms > 0) {\n        const rect = g.append(\"rect\")\n          .attr(\"x\", x(start))\n          .attr(\"y\", 0)\n          .attr(\"height\", barHeight)\n          .attr(\"width\", animate ? 0 : Math.max(1, x(start + s.ms) - x(start)))\n          .attr(\"fill\", row.color)\n          .attr(\"fill-opacity\", shade[s.stage])\n          .attr(\"data-entity-id\", `${row.subject.toLowerCase()}-${s.stage}`)\n          .attr(\"data-entity-label\", `${row.subject} ${s.stage}: ${formatMs(s.ms)}`)\n          .attr(\"tabindex\", 0)\n        rect.append(\"title\").text(`${row.subject} ${s.stage}: ${formatMs(s.ms)}`)\n        if (animate)\n          rect.transition()\n            .delay((start / longest) * 1600)\n            .duration(Math.max(16, (s.ms / longest) * 1600))\n            .ease(d3.easeLinear)\n            .attr(\"width\", Math.max(1, x(start + s.ms) - x(start)))\n      }\n      start += s.ms\n    }\n    g.append(\"text\")\n      .attr(\"x\", x(row.total) + 8)\n      .attr(\"y\", barHeight / 2)\n      .attr(\"dy\", \"0.32em\")\n      .attr(\"fill\", row.subject === winner ? theme.ink : theme.inkMuted)\n      .attr(\"font-weight\", row.subject === winner ? 600 : 400)\n      .text(formatMs(row.total) + (row.subject === winner ? \" · first\" : \"\"))\n  })\n  display(svg.node())\n}"
    },
    {
      "id": "crossover-chart",
      "kind": "js",
      "source": "{\n  const height = 240\n  const margin = {top: 16, right: 56, bottom: 34, left: 56}\n  const sizes = d3.range(3, 9.0001, 0.05).map((e) => 10 ** e)\n  const x = d3.scaleLog().domain([1e3, 1e9]).range([margin.left, width - margin.right])\n  const all = sizes.flatMap((n) => Object.values(totalAt(n)))\n  const y = d3.scaleLog().domain(d3.extent(all)).nice().range([height - margin.bottom, margin.top])\n  const svg = d3.create(\"svg\")\n    .attr(\"viewBox\", [0, 0, width, height])\n    .attr(\"width\", width)\n    .attr(\"height\", height)\n    .attr(\"role\", \"img\")\n    .attr(\"aria-label\", \"Total time against workload size, CPU and GPU\")\n  svg.append(\"g\")\n    .attr(\"transform\", `translate(0,${height - margin.bottom})`)\n    .call(d3.axisBottom(x).ticks(6, (n) => d3.format(\"~s\")(n).replace(\"G\", \"B\")).tickSizeOuter(0))\n    .call((g) => g.append(\"text\").attr(\"x\", width - margin.right).attr(\"y\", 28).attr(\"text-anchor\", \"end\").attr(\"fill\", theme.inkMuted).text(\"items\"))\n  svg.append(\"g\")\n    .attr(\"transform\", `translate(${margin.left},0)`)\n    .call(d3.axisLeft(y).ticks(5, formatMs).tickSizeOuter(0))\n    .call((g) => g.selectAll(\".tick line\").clone().attr(\"x2\", width - margin.left - margin.right).attr(\"stroke-opacity\", 0.12))\n  const line = (subject) => d3.line().x((n) => x(n)).y((n) => y(totalAt(n)[subject]))\n  // End labels, nudged apart when the lines finish close together.\n  const ends = [\"CPU\", \"GPU\"].map((subject) => y(totalAt(1e9)[subject]))\n  const nudge = Math.max(0, 13 - Math.abs(ends[0] - ends[1])) / 2\n  ;[\"CPU\", \"GPU\"].forEach((subject, i) => {\n    const away = ends[i] <= ends[1 - i] ? -nudge : nudge\n    svg.append(\"path\").attr(\"d\", line(subject)(sizes)).attr(\"fill\", \"none\").attr(\"stroke\", theme.series[i]).attr(\"stroke-width\", 2)\n    svg.append(\"text\").attr(\"x\", width - margin.right + 6).attr(\"y\", ends[i] + away).attr(\"dy\", \"0.32em\").attr(\"fill\", theme.series[i]).attr(\"font-weight\", 600).text(subject)\n  })\n  // Where this workload sits, and where the lines cross.\n  svg.append(\"line\").attr(\"x1\", x(items)).attr(\"x2\", x(items)).attr(\"y1\", margin.top).attr(\"y2\", height - margin.bottom).attr(\"stroke\", theme.inkFaint).attr(\"stroke-dasharray\", \"3 3\")\n  ;[\"CPU\", \"GPU\"].forEach((subject, i) => {\n    svg.append(\"circle\")\n      .attr(\"cx\", x(items)).attr(\"cy\", y(totalAt(items)[subject])).attr(\"r\", 4.5)\n      .attr(\"fill\", theme.series[i])\n      .attr(\"data-entity-id\", `${subject.toLowerCase()}-total`)\n      .attr(\"data-entity-label\", `${subject} total at ${formatItems(items)}: ${formatMs(totalAt(items)[subject])}`)\n      .attr(\"tabindex\", 0)\n      .append(\"title\").text(`${subject}: ${formatMs(totalAt(items)[subject])}`)\n  })\n  if (Number.isFinite(crossover) && crossover >= 1e3 && crossover <= 1e9) {\n    const cy = y(totalAt(crossover).CPU)\n    const mark = svg.append(\"g\")\n      .attr(\"data-entity-id\", \"crossover\")\n      .attr(\"data-entity-label\", `Crossover at about ${formatItems(crossover)}`)\n      .attr(\"tabindex\", 0)\n    mark.append(\"circle\").attr(\"cx\", x(crossover)).attr(\"cy\", cy).attr(\"r\", 5).attr(\"fill\", \"none\").attr(\"stroke\", theme.ink).attr(\"stroke-width\", 1.5)\n    // Labelled below and to the left, clear of the lines that rise to its right.\n    mark.append(\"text\").attr(\"x\", x(crossover) - 8).attr(\"y\", cy + 18).attr(\"text-anchor\", \"end\").attr(\"fill\", theme.ink)\n      .attr(\"stroke\", theme.surface).attr(\"stroke-width\", 4).attr(\"paint-order\", \"stroke\")\n      .text(`crossover ≈ ${formatItems(crossover)}`)\n  }\n  display(svg.node())\n}"
    },
    {
      "id": "assumptions",
      "kind": "md",
      "source": "### Assumptions\n\nThese figures are illustrative round numbers for a recent desktop CPU and a discrete GPU, not a measurement of any machine. The measured notebook beside this one times a real operation.\n\n- **CPU:** ${data.assumptions.cpu.gflops} GFLOP/s across its cores, ${data.assumptions.cpu.memoryGBps} GB/s memory bandwidth, ${formatMs(data.assumptions.cpu.dispatchMs)} to hand work to its threads.\n- **GPU:** ${d3.format(\",\")(data.assumptions.gpu.gflops)} GFLOP/s, ${data.assumptions.gpu.memoryGBps} GB/s memory bandwidth, ${formatMs(data.assumptions.gpu.setupMs)} to allocate buffers and ${formatMs(data.assumptions.gpu.launchMs)} to launch and synchronize a kernel.\n- **Link:** ${data.assumptions.link.label} at ${data.assumptions.link.GBps} GB/s; each item moves ${data.assumptions.bytesPerItem} bytes (a float32 in, a float32 out).\n- **Work:** every item needs the same arithmetic; each processor runs at whichever is slower, its arithmetic or its memory (a roofline). Real kernels add caches, occupancy and contention that this ignores."
    }
  ],
  "data": {
    "assumptions": {
      "cpu": {
        "gflops": 400,
        "memoryGBps": 60,
        "dispatchMs": 0.02
      },
      "gpu": {
        "gflops": 15000,
        "memoryGBps": 900,
        "setupMs": 0.5,
        "launchMs": 0.03
      },
      "link": {
        "label": "PCIe 4.0 x16, effective",
        "GBps": 12
      },
      "bytesPerItem": 8
    }
  }
}
