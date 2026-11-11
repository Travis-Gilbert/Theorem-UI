# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "marimo>=0.23.16",
#     "matplotlib>=3.10",
#     "numpy>=2.2",
#     "torch>=2.8",
# ]
# ///

import marimo

__generated_with = "0.23.16"
app = marimo.App(width="medium")


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    # Measured: when does the GPU pay off?

    One operation, a float32 matrix multiply with `torch.matmul`, timed on the CPU and on a CUDA GPU across sizes. Both sides run the same library call, so the difference is the processor, not the language or the library. **Compute only** starts with the operands already on the device. **End to end** also copies the operands to the GPU and the result back. Every result is checked against a float64 reference.
    """)
    return


@app.cell
def _():
    import marimo as mo

    return (mo,)


@app.cell
def _():
    import io
    import platform
    import re
    import statistics
    import subprocess
    import time

    import matplotlib

    matplotlib.use("svg")
    import matplotlib.pyplot as plt
    import numpy as np
    import torch
    from matplotlib.ticker import FuncFormatter

    return FuncFormatter, io, np, platform, plt, re, statistics, subprocess, time, torch


@app.cell
def _(platform, subprocess, torch):
    def processor_name():
        """The processor's own name, never the machine's hostname."""
        if platform.system() == "Darwin":
            _out = subprocess.run(
                ["sysctl", "-n", "machdep.cpu.brand_string"],
                capture_output=True,
                text=True,
            )
            if _out.returncode == 0 and _out.stdout.strip():
                return _out.stdout.strip()
        if platform.system() == "Linux":
            try:
                with open("/proc/cpuinfo") as _cpuinfo:
                    for _line in _cpuinfo:
                        if _line.startswith("model name"):
                            return _line.split(":", 1)[1].strip()
            except OSError:
                pass
        return platform.processor() or platform.machine()

    has_cuda = torch.cuda.is_available()
    gpu = torch.device("cuda") if has_cuda else None
    # Full float32 on both sides: TF32 would let the GPU win by rounding more.
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False
    torch.set_float32_matmul_precision("highest")

    _system = (
        f"macOS {platform.mac_ver()[0]}"
        if platform.system() == "Darwin"
        else f"{platform.system()} {platform.release()}"
    )
    device_info = {
        "cpu": f"{processor_name()}, {torch.get_num_threads()} threads",
        "gpu": torch.cuda.get_device_name(0) if has_cuda else None,
        "cuda": torch.version.cuda if has_cuda else None,
        "library": f"PyTorch {torch.__version__} on {_system}",
    }
    return device_info, gpu, has_cuda


@app.cell(hide_code=True)
def _(device_info, has_cuda, mo):
    _gpu = (
        f"{device_info['gpu']}, CUDA {device_info['cuda']}"
        if has_cuda
        else "**None.** This machine has no CUDA device, so nothing below is a GPU measurement."
    )
    mo.md(f"""
    | | |
    |---|---|
    | CPU | {device_info["cpu"]} |
    | GPU | {_gpu} |
    | Library | {device_info["library"]} |
    | Arithmetic | float32, TF32 off |
    """)
    return


@app.cell
def _(mo):
    largest = mo.ui.dropdown(
        options=["1024", "2048", "4096"], value="2048", label="Largest matrix"
    )
    repetitions = mo.ui.slider(
        5, 50, value=15, step=5, label="Repetitions per size", show_value=True
    )
    run = mo.ui.run_button(label="Run experiment")
    mo.hstack([largest, repetitions, run], justify="start", gap=2)
    return largest, repetitions, run


@app.cell
def _(np, statistics, time, torch):
    WARMUP = 3

    def summarize(samples):
        """Median, interquartile range and minimum of timings in milliseconds."""
        _q1, _median, _q3 = statistics.quantiles(samples, n=4, method="inclusive")
        return {
            "median": statistics.median(samples),
            "q1": _q1,
            "q3": _q3,
            "min": min(samples),
            "n": len(samples),
        }

    def agreement(product, a, b):
        """Whether a float32 product matches the float64 one within float32 rounding.

        Each entry of A @ B sums n products, so float32 can be off by about
        n * eps * (|A| @ |B|) there. Returns the verdict and the largest error
        relative to the largest entry.
        """
        _a, _b = a.double().numpy(), b.double().numpy()
        _exact = _a @ _b
        _error = np.abs(product.double().numpy() - _exact)
        _bound = a.shape[1] * np.finfo(np.float32).eps * (np.abs(_a) @ np.abs(_b))
        return bool((_error <= _bound).all()), float(_error.max() / np.abs(_exact).max())

    def time_cpu(a, b, reps):
        """Wall clock around the multiply; the CPU returns only when it is done."""
        for _ in range(WARMUP):
            torch.matmul(a, b)
        _samples = []
        for _ in range(reps):
            _start = time.perf_counter()
            _product = torch.matmul(a, b)
            _samples.append((time.perf_counter() - _start) * 1e3)
        return _samples, _product

    def time_gpu_compute(a, b, reps):
        """CUDA events around the kernel, with the operands already on the GPU."""
        for _ in range(WARMUP):
            torch.matmul(a, b)
        torch.cuda.synchronize()
        _samples = []
        for _ in range(reps):
            _start = torch.cuda.Event(enable_timing=True)
            _end = torch.cuda.Event(enable_timing=True)
            _start.record()
            _product = torch.matmul(a, b)
            _end.record()
            _end.synchronize()
            _samples.append(_start.elapsed_time(_end))
        return _samples, _product

    def time_gpu_end_to_end(a, b, reps, device):
        """Wall clock from CPU operands to a CPU result: copy over, multiply, copy back."""

        def _once():
            return torch.matmul(a.to(device), b.to(device)).cpu()

        for _ in range(WARMUP):
            _once()
        torch.cuda.synchronize()
        _samples = []
        for _ in range(reps):
            _start = time.perf_counter()
            _product = _once()
            torch.cuda.synchronize()
            _samples.append((time.perf_counter() - _start) * 1e3)
        return _samples, _product

    return WARMUP, agreement, summarize, time_cpu, time_gpu_compute, time_gpu_end_to_end


@app.cell
def _(
    agreement,
    gpu,
    has_cuda,
    largest,
    mo,
    repetitions,
    run,
    summarize,
    time_cpu,
    time_gpu_compute,
    time_gpu_end_to_end,
    torch,
):
    # A recorded run passes --run; otherwise nothing runs until the button is pressed.
    mo.stop(
        not (run.value or "run" in mo.cli_args()),
        mo.md("Press **Run experiment** to measure. The largest sizes take a while."),
    )
    sizes = [n for n in (128, 256, 512, 1024, 2048, 4096) if n <= int(largest.value)]
    _generator = torch.Generator().manual_seed(0)
    results = []
    for _n in sizes:
        _a = torch.randn(_n, _n, generator=_generator)
        _b = torch.randn(_n, _n, generator=_generator)
        _row = {"n": _n, "flops": 2 * _n**3}
        _samples, _product = time_cpu(_a, _b, repetitions.value)
        _row["cpu"] = summarize(_samples)
        _row["cpu_agrees"], _row["cpu_error"] = agreement(_product, _a, _b)
        if has_cuda:
            _samples, _product = time_gpu_compute(_a.to(gpu), _b.to(gpu), repetitions.value)
            _row["gpu"] = summarize(_samples)
            _row["gpu_agrees"], _row["gpu_error"] = agreement(_product.cpu(), _a, _b)
            _samples, _ = time_gpu_end_to_end(_a, _b, repetitions.value, gpu)
            _row["gpu_e2e"] = summarize(_samples)
        results.append(_row)
    return (results,)


@app.cell(hide_code=True)
def _(WARMUP, has_cuda, mo, repetitions, results):
    def _ms(value):
        return f"{value:,.0f}" if value >= 100 else f"{value:.3g}"

    def _timing(summary):
        return (
            f"{_ms(summary['median'])} ms<br><small>IQR {_ms(summary['q1'])}–"
            f"{_ms(summary['q3'])}, min {_ms(summary['min'])}</small>"
        )

    def _rate(row, key):
        return f"{row['flops'] / (row[key]['median'] * 1e6):,.0f}"

    _missing = "not measured: no CUDA device"
    _lines = [
        "| Size | CPU compute | GPU compute | GPU end to end | CPU GFLOP/s | GPU GFLOP/s | Agrees with float64 |",
        "|---:|---:|---:|---:|---:|---:|---|",
    ]
    for _row in results:
        _agrees = "CPU " + ("yes" if _row["cpu_agrees"] else "**no**")
        _agrees += f" ({_row['cpu_error']:.1e})"
        if has_cuda:
            _agrees += ", GPU " + ("yes" if _row["gpu_agrees"] else "**no**")
            _agrees += f" ({_row['gpu_error']:.1e})"
        _lines.append(
            f"| {_row['n']}×{_row['n']} | {_timing(_row['cpu'])} | "
            + (
                f"{_timing(_row['gpu'])} | {_timing(_row['gpu_e2e'])} | {_rate(_row, 'cpu')} | {_rate(_row, 'gpu')}"
                if has_cuda
                else f"{_missing} | {_missing} | {_rate(_row, 'cpu')} | –"
            )
            + f" | {_agrees} |"
        )
    mo.md(
        f"### Timings\n\nMedian of {repetitions.value} repetitions after {WARMUP} warm-up runs, "
        "with the interquartile range and the fastest run. On the CPU the operands are already "
        "where the work happens, so its end-to-end time is its compute time.\n\n"
        + "\n".join(_lines)
    )
    return


@app.cell
def _(FuncFormatter, has_cuda, io, mo, plt, re, results):
    # Matplotlib needs real colours, so the drawing uses stand-ins and the SVG
    # swaps them for Theorem's tokens: the plot then follows the page's theme.
    _tokens = {
        "#c00001": "var(--redwood, currentColor)",
        "#00c002": "var(--teal, currentColor)",
        "#000003": "var(--ink, currentColor)",
        "#000004": "var(--ink-muted, currentColor)",
        "#000005": "var(--line-separator, currentColor)",
    }
    _series = [
        ("cpu", "CPU compute", "#c00001", "-", "o"),
        ("gpu", "GPU compute", "#00c002", "-", "s"),
        ("gpu_e2e", "GPU end to end", "#00c002", "--", "s"),
    ]
    plt.rcParams.update(
        {
            "svg.fonttype": "none",
            "font.family": "sans-serif",
            "font.size": 9,
            "text.color": "#000003",
            "axes.labelcolor": "#000004",
            "axes.edgecolor": "#000005",
            "xtick.color": "#000004",
            "ytick.color": "#000004",
        }
    )
    _figure, _axes = plt.subplots(figsize=(7.2, 3.6), layout="constrained")
    _labels = {}
    for _key, _label, _color, _style, _marker in _series:
        _rows = [_row for _row in results if _key in _row]
        if not _rows:
            continue
        _x = [_row["n"] for _row in _rows]
        _y = [_row[_key]["median"] for _row in _rows]
        _spread = [
            [_row[_key]["median"] - _row[_key]["q1"] for _row in _rows],
            [_row[_key]["q3"] - _row[_key]["median"] for _row in _rows],
        ]
        _axes.errorbar(
            _x, _y, yerr=_spread, color=_color, linestyle=_style, marker=_marker,
            markersize=4, linewidth=1.6, capsize=2, label=_label,
        )
        for _row in _rows:
            _id = f"{_key}-{_row['n']}"
            _labels[_id] = f"{_label}, {_row['n']}×{_row['n']}: {_row[_key]['median']:.3g} ms median"
            # A larger, invisible target over each point, drawn above the error
            # bar caps (which sit on the point when the spread is small), so it
            # can be selected.
            _axes.plot(
                [_row["n"]], [_row[_key]["median"]], marker="o", markersize=16,
                color="#000003", alpha=0, gid=f"entity:{_id}", zorder=10,
            )
    _axes.set_xscale("log", base=2)
    _axes.set_yscale("log")
    _axes.yaxis.set_major_formatter(FuncFormatter(lambda _value, _: f"{_value:g}"))
    _axes.set_xticks([_row["n"] for _row in results], [str(_row["n"]) for _row in results])
    _axes.minorticks_off()
    _axes.set_xlabel("matrix size n (n×n float32)")
    _axes.set_ylabel("median time, ms")
    _axes.spines[["top", "right"]].set_visible(False)
    _axes.grid(axis="y", color="#000005", linewidth=0.6)
    _axes.legend(frameon=False, loc="upper left")
    if not has_cuda:
        _axes.set_title(
            "CPU only: this machine has no CUDA device", loc="left", color="#000004"
        )
    _buffer = io.StringIO()
    _figure.savefig(_buffer, format="svg", transparent=True)
    plt.close(_figure)

    _svg = _buffer.getvalue()
    _svg = _svg[_svg.index("<svg") :]
    _svg = re.sub(r'<svg([^>]*?) width="[^"]+" height="[^"]+"', r'<svg\1 width="100%"', _svg, count=1)
    for _stand_in, _token in _tokens.items():
        _svg = _svg.replace(_stand_in, _token)
    _svg = re.sub(r"font-family: [^;\"]+", "font-family: var(--font-sans, sans-serif)", _svg)
    _svg = re.sub(
        r'<g id="entity:([^"]+)"',
        lambda _m: f'<g id="entity:{_m[1]}" data-entity-id="{_m[1]}" data-entity-label="{_labels[_m[1]]}"',
        _svg,
    )
    mo.Html(_svg)
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ### How this is measured

    - **Same operation on both sides.** `torch.matmul` on float32 operands drawn from a seeded normal distribution. A Python loop against NumPy would compare languages, not processors, so nothing here does that.
    - **Warm-up.** Three runs of every measurement are discarded first, so one-time costs (kernel selection, cuBLAS handles, page faults) do not land in the timings.
    - **Compute only.** On the GPU, CUDA events recorded on the stream around the kernel, read after the end event synchronizes. On the CPU, the wall clock around the call, which returns when the work is done. PyTorch uses all the threads listed above.
    - **End to end.** The wall clock from operands in host memory to the result back in host memory: copy over, multiply, copy back, then `torch.cuda.synchronize()`. Host memory is pageable; pinned memory would copy faster.
    - **Agreement.** Each product is compared with the float64 product of the same operands, entry by entry, against the float32 rounding bound n·ε·(|A|·|B|). The number in brackets is the largest error relative to the largest entry.
    - **Variability.** The median of the repetitions, with the interquartile range in the table and as error bars, and the fastest run.
    """)
    return


if __name__ == "__main__":
    app.run()
