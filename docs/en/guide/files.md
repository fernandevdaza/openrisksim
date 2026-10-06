# Files: open, save, export

OpenRiskSim works with **`.xlsx`** files (Excel's format since 2007) and **`.csv`**. They are processed inside the browser and never uploaded.

## Opening a file

- **File → Open** (<kbd>Ctrl</kbd>+<kbd>O</kbd>) and pick the file, or
- **drag** the `.xlsx` or `.csv` file onto the application window.

### Where can the file come from?

| Program | What to do |
|---|---|
| **Excel** (Windows or Mac) | Save as *Excel Workbook (.xlsx)*. Macro-enabled `.xlsm` files also open; macros are ignored. |
| **LibreOffice Calc** | `File → Save As…` → type *Excel 2007-365 (.xlsx)*. |
| **WPS Office** | Save as `.xlsx`. |
| **Google Sheets** | `File → Download → Microsoft Excel (.xlsx)`. |
| **Numbers** (Mac) | `File → Export To → Excel…`. |
| Any program | `.csv`, `.tsv` or `.txt` with data separated by `,` `;` tab or `|`. |

When opening a CSV, OpenRiskSim **auto-detects** the column delimiter and the decimal separator (`1.234,56` or `1,234.56`), and understands percentages, currency symbols and negatives in parentheses. It becomes a one-sheet workbook that will be saved as `.xlsx`.

::: warning Unsupported formats
The legacy **`.xls`** (Excel 97-2003) and **`.ods`** (OpenDocument) formats can't be read. Open them in Excel or LibreOffice and save them as `.xlsx`. The app shows the same message if you try.
:::

### What is preserved when opening

| Preserved | Not preserved |
|---|---|
| All sheets, values and **formulas** (shared formulas are expanded) | Charts and images |
| Number formats (currency, %, decimals, dates as serial numbers) | Borders, conditional formatting, data validation and comments |
| Bold, italic, text colour, fill colour and alignment | VBA macros |
| Column widths | Pivot tables and slicers |
| Defined names | |
| The OpenRiskSim risk model (if the file was saved by the app) | |

**Merged cells** are read and saved back as merged, but OpenRiskSim's grid shows them as separate cells (the value is in the first cell of the range).

::: tip Work on a copy
Since saving produces a new file without charts or borders, keep your original Excel file and save the OpenRiskSim one under a different name (e.g. `project_risk.xlsx`).
:::

## Saving with the model

**File → Save .xlsx** (<kbd>Ctrl</kbd>+<kbd>S</kbd>) downloads the workbook to your downloads folder. The file contains:

- your sheets with formulas, values and formats, and
- the **risk model** (assumptions, forecasts, decisions, correlations and settings) in a hidden sheet named `_openrisksim`.

That sheet is *very hidden* (`veryHidden`): it doesn't show in Excel even with “Unhide sheet”, so the file looks and works normally in Excel, LibreOffice or Google Sheets. When you reopen it in OpenRiskSim the model is restored and you'll see *“Opened … with N model definitions”*.

::: warning Don't edit the file in Excel if you want to keep the model
You can open the `.xlsx` in Excel to look at it or print it. But if you save it from Excel, LibreOffice or Google Sheets, the hidden sheet may be lost or the model's cell references may stop matching if you inserted rows or columns. Make structural changes in OpenRiskSim.
:::

## Exporting a report

After running a simulation, **File → Export report** offers three options:

| Option | Result |
|---|---|
| **Workbook .xlsx with report sheets** | Downloads `<name>_informe.xlsx`: your workbook with the model plus the sheets **Summary**, **Forecasts**, **Assumptions**, **Sensitivity**, **Simulation data** (first 10,000 trials) and **Charts** (histogram images). Sheet names follow the interface language. |
| **Print / Save as PDF** | Opens the browser's print dialog with a formatted report; choose *Save as PDF* as the destination. |
| **Open report in a new tab** | The same report as HTML, to review or copy from. If it doesn't open, allow pop-ups for the site. |

The report includes the settings, the assumptions with their distributions, statistics, percentiles, charts and sensitivity (contribution to variance) for each forecast. **Charts use the certainty ranges you set in each forecast window**: to show P(NPV ≥ 0) in the report, set **Right-tail ≥ 0** in the NPV window first.

Every results chart also has a **PNG** button to download the image for your Word or Google Docs report.

## Autosave

While you work, the workbook and the model are saved automatically in browser storage (IndexedDB). If you close the tab or restart the computer, reopening OpenRiskSim shows *“Previous work restored (…)”*.

- **One workbook** is kept (the latest). Opening another file, an example or a new workbook replaces it.
- **Simulation results are not saved**: press **Run** again (with a fixed seed you'll get the same numbers).
- In private mode, or if you clear site data, autosave is lost.

## `ORS.*` risk functions

Besides defining assumptions with the dialog, you can write them as **formulas**, like Risk Simulator's `RS*` or @RISK's `Risk*` functions:

| Function | Spanish name | Distribution |
|---|---|---|
| `ORS.NORMAL(mean, sd)` | `ORS.NORMAL` | Normal |
| `ORS.LOGNORMAL(mean, sd)` | `ORS.LOGNORMAL` | Lognormal (mean and sd of the variable) |
| `ORS.UNIFORM(min, max)` | `ORS.UNIFORME` | Uniform |
| `ORS.TRIANGULAR(min, mode, max)` | `ORS.TRIANGULAR` | Triangular |
| `ORS.PERT(min, mode, max)` | `ORS.PERT` | PERT |

In normal recalculation these functions **return the distribution mean**, so the sheet shows a sensible value.

When you open a file containing cells whose formula is **exactly** one of these functions with literal numbers (e.g. `=ORS.TRIANGULAR(220000,250000,310000)`), OpenRiskSim asks *“Convert them into model assumptions?”*. Click **Convert** and each cell becomes an assumption with that distribution (named `Sheet!Cell`). Functions referencing other cells (`=ORS.NORMAL(B2,B3)`) are not converted automatically: define them with the dialog.

There are also financial helper functions:

| Function | Spanish name | What it computes |
|---|---|---|
| `ORS.MIRR(flows, finance_rate, reinvest_rate)` | `ORS.TIRM` | Modified internal rate of return |
| `ORS.PAYBACK(flows)` | `ORS.RECUPERACION` | Payback period (fractional, flows from period 0) |
| `ORS.DPAYBACK(rate, flows)` | `ORS.RECUPERACIONDESC` | Discounted payback period |
| `ORS.PI(rate, flows)` | `ORS.IR` | Profitability index: PV of flows after t0 / \|initial investment\| |

::: warning ORS.* functions only exist in OpenRiskSim
If you open the file in Excel, those cells will show `#NAME?`. If your file must also work in Excel, define assumptions with the dialog (the model travels in the hidden sheet) and keep numeric values in the cells.
:::

## Known limitations

- `.xls` and `.ods` can't be read (save them as `.xlsx`).
- Charts, images, borders and conditional formatting are not shown or preserved.
- Merged cells are displayed unmerged.
- Sheets can't be renamed or deleted in the app (you can add them with **+**).
- Formulas use the HyperFormula engine: most Excel functions are available, but some very specific ones (cube functions, `LAMBDA`, advanced dynamic arrays, web functions) may not be and will show an error.
- Autosave keeps one workbook per browser.
