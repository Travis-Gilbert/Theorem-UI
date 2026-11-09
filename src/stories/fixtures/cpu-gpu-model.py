# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "marimo>=0.23.16",
#     "matplotlib>=3.10",
# ]
# ///

import marimo

__generated_with = "0.23.16"
app = marimo.App(width="medium")


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    # The cost model, in Python

    **Illustrative model.** The same assumptions as the D3 view, computed in Python so it can run in this page on Pyodide. It measures nothing: every time below comes from the assumptions listed at the end.
    """)
    return


@app.cell
def _():
    import marimo as mo

    return (mo,)


@app.cell
def _():
    import io
    import re

    import matplotlib

    matplotlib.use("svg")
    import matplotlib.pyplot as plt
    from matplotlib.ticker import FuncFormatter

    return FuncFormatter, io, plt, re


@app.cell
def _(mo):
    work = mo.ui.slider(
        steps=[1, 3, 10, 30, 100, 300, 1000, 3000, 10000],
        value=300,
        label="Compute per item (FLOPs)",
    )
    resident = mo.ui.checkbox(label="Data already on the GPU")
    mo.hstack([work, resident], justify="start", gap=2)
    return resident, work


@app.cell
def _(resident, work):
    CPU = {"gflops": 400, "memory_gbps": 60, "dispatch_ms": 0.02}
    GPU = {"gflops": 15000, "memory_gbps": 900, "setup_ms": 0.5, "launch_ms": 0.03}
    LINK_GBPS = 12
    BYTES_PER_ITEM = 8

    def per_item_ms(processor):
        """Whichever is slower per item: the arithmetic or the memory traffic."""
        arithmetic = work.value / (processor["gflops"] * 1e9)
        memory = BYTES_PER_ITEM / (processor["memory_gbps"] * 1e9)
        return max(arithmetic, memory) * 1e3

    transfer_ms = 0 if resident.value else BYTES_PER_ITEM / (LINK_GBPS * 1e9) * 1e3
    fixed = {"CPU": CPU["dispatch_ms"], "GPU": GPU["setup_ms"] + GPU["launch_ms"]}
    slope = {"CPU": per_item_ms(CPU), "GPU": per_item_ms(GPU) + transfer_ms}

    def total_ms(name, n):
        return fixed[name] + n * slope[name]

    # Both totals are straight lines in n, so they cross at most once.
    saving = slope["CPU"] - slope["GPU"]
    crossover = (fixed["GPU"] - fixed["CPU"]) / saving if saving > 0 else None

    def items(n):
        for scale, suffix in [(1e9, "B"), (1e6, "M"), (1e3, "k")]:
            if n >= scale:
                return f"{n / scale:.3g}{suffix} items"
        return f"{n:.0f} items"

    return crossover, items, total_ms


@app.cell
def _(crossover, items, mo, resident, work):
    _copy = "with the data already on the GPU" if resident.value else "copying the data over"
    mo.md(
        f"At {work.value} FLOPs per item, {_copy}, **the GPU never catches up**: "
        "each item costs it at least as much as it costs the CPU."
        if crossover is None
        else f"At {work.value} FLOPs per item, {_copy}, **the GPU finishes first beyond "
        f"{items(crossover)}**. Below that, its fixed setup cost outweighs what it saves per item."
    )
    return


@app.cell
def _(FuncFormatter, crossover, io, items, mo, plt, re, total_ms):
    # Drawn with stand-in colours that become the page's theme tokens, so the
    # plot follows the theme wherever it shows.
    _tokens = {
        "#c00001": "var(--redwood, currentColor)",
        "#00c002": "var(--teal, currentColor)",
        "#000003": "var(--ink, currentColor)",
        "#000004": "var(--ink-muted, currentColor)",
        "#000005": "var(--line-separator, currentColor)",
    }
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
    _sizes = [10 ** (_k / 4) for _k in range(12, 37)]
    _figure, _axes = plt.subplots(figsize=(7.2, 3.2), layout="constrained")
    for _name, _color in [("CPU", "#c00001"), ("GPU", "#00c002")]:
        _axes.plot(_sizes, [total_ms(_name, _n) for _n in _sizes], color=_color, linewidth=1.8, label=_name)
    _label = "The GPU never catches up"
    if crossover is not None and _sizes[0] <= crossover <= _sizes[-1]:
        _label = f"Crossover: {items(crossover)}, {total_ms('CPU', crossover):.3g} ms"
        _axes.axvline(crossover, color="#000004", linewidth=0.8, linestyle="--")
        _axes.plot(
            [crossover], [total_ms("CPU", crossover)], marker="o", markersize=16,
            color="#000003", alpha=0, gid="entity:crossover", zorder=10,
        )
    _axes.set_xscale("log")
    _axes.set_yscale("log")
    _axes.xaxis.set_major_formatter(
        FuncFormatter(lambda _value, _: items(_value).removesuffix(" items"))
    )
    _axes.yaxis.set_major_formatter(FuncFormatter(lambda _value, _: f"{_value:,.10g}"))
    _axes.set_xlabel("workload size (items)")
    _axes.set_ylabel("completion time, ms (illustrative)")
    _axes.spines[["top", "right"]].set_visible(False)
    _axes.grid(axis="y", color="#000005", linewidth=0.6)
    _axes.legend(frameon=False, loc="upper left")
    _buffer = io.StringIO()
    _figure.savefig(_buffer, format="svg", transparent=True)
    plt.close(_figure)

    _svg = _buffer.getvalue()
    _svg = _svg[_svg.index("<svg") :]
    _svg = re.sub(r'<svg([^>]*?) width="[^"]+" height="[^"]+"', r'<svg\1 width="100%"', _svg, count=1)
    for _stand_in, _token in _tokens.items():
        _svg = _svg.replace(_stand_in, _token)
    _svg = re.sub(r"font-family: [^;\"]+", "font-family: var(--font-sans, sans-serif)", _svg)
    _svg = _svg.replace(
        '<g id="entity:crossover"',
        f'<g id="entity:crossover" data-entity-id="crossover" data-entity-label="{_label}"',
    )
    mo.Html(_svg)
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ### Assumptions

    - **CPU:** 400 GFLOP/s, 60 GB/s memory bandwidth, 0.02 ms to dispatch the work.
    - **GPU:** 15000 GFLOP/s, 900 GB/s memory bandwidth, 0.5 ms of setup and 0.03 ms to launch the kernel.
    - **Link:** 12 GB/s effective (PCIe 4.0 x16), crossed by 8 bytes per item unless the data already lives on the GPU.
    - Each processor works through the items at whichever is slower, its arithmetic or its memory bandwidth (a roofline). Real hardware adds caches, clocks and contention that this leaves out.
    """)
    return


if __name__ == "__main__":
    app.run()
