// SOURCING: none: OpenUI Lang programs written against theorem-artifacts. One per
// component (the stories and tests render them) and the GPU workload composite,
// which is also the worked example in the library's prompt.

/** When does moving this workload to a GPU become worthwhile? */
export const GPU_WORKLOAD = `root = Stack([experiment])
experiment = Experiment("When does moving this workload to a GPU become worthwhile?", [size, work, resident], [finishes, timeline, curves, verdict], assumptions)

$items = 1000000
$work = 1000
$resident = false
$region = null

size = Slider("Workload size", $items, 1000, 100000000, "items", "log")
work = Slider("Compute per item", $work, 10, 10000, "ops", "log")
resident = Toggle("Data already on the GPU", $resident, "Nothing to copy in or out")

# The model: round numbers for a desktop CPU and a discrete GPU.
cpuRate = 2e11
gpuRate = 1e13
link = 1.6e10
bytes = 8
cpuSetup = 0.01
gpuSetup = 0.3

transferPerItem = $resident ? 0 : bytes / link * 1000
cpuCompute = $items * $work / cpuRate * 1000
gpuCompute = $items * $work / gpuRate * 1000
transfer = $items * transferPerItem
cpuTotal = cpuSetup + cpuCompute
gpuTotal = gpuSetup + 2 * transfer + gpuCompute
gainPerItem = $work / cpuRate * 1000 - $work / gpuRate * 1000 - 2 * transferPerItem
breakEven = gainPerItem > 0 ? (gpuSetup - cpuSetup) / gainPerItem : "Never at this compute per item"

finishes = Stack([cpuStat, gpuStat, evenStat])
cpuStat = Stat("CPU finishes", cpuTotal, "ms", "CPU")
gpuStat = Stat("GPU finishes", gpuTotal, "ms", "GPU")
evenStat = Stat("GPU pulls ahead at", breakEven, "items")

timeline = Timeline([cpuLane, gpuLane], "ms")
cpuLane = Lane("CPU", [Stage("Setup", cpuSetup, true), Stage("Compute", cpuCompute)])
gpuLane = Lane("GPU", [Stage("Setup", gpuSetup, true), Stage("Transfer in", transfer, true), Stage("Compute", gpuCompute), Stage("Transfer out", transfer, true)])

sizes = @Range(1000, 100000000, 41, "log")
curves = Plot(Axis("Workload size", "items", "log"), Axis("Completion", "ms", "log"), [cpuCurve, gpuCurve], $region, marks)
cpuCurve = Series("CPU", sizes, @Each(sizes, "n", cpuSetup + n * $work / cpuRate * 1000))
gpuCurve = Series("GPU", sizes, @Each(sizes, "n", gpuSetup + n * (2 * transferPerItem + $work / gpuRate * 1000)))
marks = gainPerItem > 0 ? [Mark($items, "This workload"), Mark(breakEven, "Break-even")] : [Mark($items, "This workload")]

verdict = gainPerItem > 0 ? Callout("Past the break-even size the GPU's per-item speed outweighs its fixed setup.", "note") : Callout("At this compute per item, copying an item across PCIe costs more than computing it on the CPU, so the GPU never catches up unless the data is already there.", "warning")

assumptions = ["CPU: 200 billion simple operations per second across all cores.", "GPU: 10 trillion operations per second once running.", "PCIe: 16 GB/s each way; 8 bytes in and 8 bytes out per item.", "Setup: 0.01 ms to start CPU threads; 0.3 ms to launch the GPU kernel and allocate buffers.", "The same work per item on both; no memory-bound effects, and no overlap of transfer with compute."]`

/** One program per component, each showing it on its own. */
export const EXAMPLES = {
  Stack: `root = Stack([intro, cpu, gpu, speedup])
intro = Text("The same batch of one million items, finished two ways.")
cpu = Stat("CPU finishes", 5.01, "ms", "CPU")
gpu = Stat("GPU finishes", 1.4, "ms", "GPU")
speedup = Stat("Speedup", 3.6, "x", null, "GPU over CPU")`,

  Section: `root = Stack([where])
where = Section("Where the time goes", [why, note], "One batch of one million items at 1,000 operations each.")
why = Text("Copying the batch to the GPU and back takes ten times longer than computing it there.")
note = Callout("Transfer is nearly three quarters of the GPU's time at this size.", "note")`,

  Text: `root = Stack([a, b])
a = Text("A GPU runs thousands of simple operations at once, but every byte it works on has to reach its memory first.")
b = Text("Whether that trip pays off depends on how much work each item needs.")`,

  Callout: `root = Stack([note, warning, assumption])
note = Callout("Times are for one batch, end to end.", "note")
warning = Callout("Below 74,000 items the GPU is slower than the CPU.", "warning")
assumption = Callout("PCIe moves 16 GB/s each way.", "assumption")`,

  Stat: `root = Stack([cpu, gpu, even, share])
cpu = Stat("CPU finishes", 5.01, "ms", "CPU")
gpu = Stat("GPU finishes", 1.4, "ms", "GPU", "Most of it is transfer")
even = Stat("GPU pulls ahead at", 74400, "items")
share = Stat("Transfer share", 71, "%", "GPU")`,

  Slider: `root = Stack([size, work, chosen])
$items = 1000000
$work = 200
size = Slider("Workload size", $items, 1000, 100000000, "items", "log")
work = Slider("Compute per item", $work, 10, 10000, "ops", "log")
chosen = Stat("Operations in the batch", $items * $work, "ops")`,

  Toggle: `root = Stack([resident, copy])
$resident = false
resident = Toggle("Data already on the GPU", $resident, "Nothing to copy in or out")
copy = Stat("Transfer", $resident ? 0 : 1, "ms", "GPU")`,

  Comparison: `root = Stack([compare])
compare = Comparison(["CPU", "GPU"], [Measure("Completion", "ms", [5.01, 1.4], "lower"), Measure("Throughput", "items/s", [2e8, 7.1e8], "higher"), Measure("Power draw", "W", [65, 220], "lower")], "One batch of one million items at 1,000 operations each.")`,

  Timeline: `root = Stack([timeline])
timeline = Timeline([cpu, gpu], "ms", [Mark(1.4, "GPU done")])
cpu = Lane("CPU", [Stage("Setup", 0.01, true), Stage("Compute", 5)])
gpu = Lane("GPU", [Stage("Setup", 0.3, true), Stage("Transfer in", 0.5, true), Stage("Compute", 0.1), Stage("Transfer out", 0.5, true)])`,

  Plot: `root = Stack([plot])
$region = null
sizes = @Range(1000, 100000000, 41, "log")
plot = Plot(Axis("Workload size", "items", "log"), Axis("Completion", "ms", "log"), [cpu, gpu], $region, [Mark(74400, "Break-even")])
cpu = Series("CPU", sizes, @Each(sizes, "n", 0.01 + n * 1000 / 2e11 * 1000))
gpu = Series("GPU", sizes, @Each(sizes, "n", 0.3 + n * (2 * 8 / 1.6e10 * 1000 + 1000 / 1e13 * 1000)))`,

  LinkedTable: `root = Stack([plot, table])
$region = {from: 10000, to: 1000000}
sizes = [1000, 10000, 100000, 1000000, 10000000]
plot = Plot(Axis("Workload size", "items", "log"), Axis("Completion", "ms", "log"), [Series("CPU", sizes, cpu), Series("GPU", sizes, gpu)], $region)
cpu = @Each(sizes, "n", 0.01 + n * 1000 / 2e11 * 1000)
gpu = @Each(sizes, "n", 0.3 + n * (2 * 8 / 1.6e10 * 1000 + 1000 / 1e13 * 1000))
table = LinkedTable([Column("items", "Workload size", "items"), Column("cpu", "CPU", "ms", "CPU"), Column("gpu", "GPU", "ms", "GPU")], rows, $region, "items")
rows = [{items: 1000, cpu: 0.015, gpu: 0.301}, {items: 10000, cpu: 0.06, gpu: 0.31}, {items: 100000, cpu: 0.51, gpu: 0.41}, {items: 1000000, cpu: 5.01, gpu: 1.4}, {items: 10000000, cpu: 50, gpu: 11.3}]`,

  Sequence: `root = Stack([steps])
$step = 0
steps = Sequence([copyIn, compute, copyOut], $step)
copyIn = Step("Copy in", [Text("The batch crosses PCIe into GPU memory, 8 bytes per item."), Stat("Transfer in", 0.5, "ms", "GPU")])
compute = Step("Compute", [Text("Thousands of cores work through the items at once."), Stat("Compute", 0.1, "ms", "GPU")], "Fast once the data is there.")
copyOut = Step("Copy out", [Text("Results cross PCIe back to the CPU."), Stat("Transfer out", 0.5, "ms", "GPU")])`,

  Experiment: `root = Stack([experiment])
experiment = Experiment("How long does the copy to the GPU take?", [size], [copy], ["PCIe moves 16 GB/s each way.", "8 bytes per item."])
$items = 1000000
size = Slider("Workload size", $items, 1000, 100000000, "items", "log")
copy = Stat("Transfer in", $items * 8 / 1.6e10 * 1000, "ms", "GPU")`,
} as const

export type ExampleName = keyof typeof EXAMPLES
