# Formulas

The OpenRiskSim sheet behaves like Excel: type formulas in English (`=SUM(A1:A5)`, `=NPV(B14,C30:G30)`) with a **comma** separator, or in Spanish (`=SUMA(A1:A5)`, `;` separator, decimal comma) when the interface is in Spanish. They are stored in standard Excel format, so the `.xlsx` opens the same in Excel, LibreOffice or WPS.

## Typing a formula

1. Select a cell and type `=`.
2. Start typing a function name: an **autocomplete** list appears (`=SU` → SUBTOTAL, SUM, SUMPRODUCT…). Move with ↑ ↓ and press **Tab** or **Enter** to insert it.
3. While you type the arguments, a **tooltip** shows the function signature with the current argument in bold, e.g. `NPV(rate, **value1**, [value2], …)`, and what it means.
4. Press **Enter** to confirm (or **Escape** to cancel). Missing closing parentheses are added automatically, as in Excel.

::: tip Insert function (fx)
The **fx** button next to the name box (or **Formulas → Insert function**, or **Shift+F3**) opens a function search by name or category. Choosing one shows a form with one field per argument, its explanation, a button to **pick the range on the sheet**, and a **live result** before you accept.
:::

## Click-to-reference ("Point" mode)

After `=`, an operator (`+ - * /`), `(` or `,`, you can **click a cell** to insert its reference, **drag** or **Shift+click** for a range (`B4:B9`), or use the **arrow keys** (Shift+arrows extends). To refer to another sheet, click its tab and then the cell: `'Sheet 2'!C5` is inserted.

The status bar shows the mode, just like Excel: **Ready**, **Enter**, **Point** or **Edit** (**F2** toggles between Enter and Edit).

Every reference in the formula gets **its own colour** in the text and a **matching box** on the sheet. Drag a box corner to resize or move that reference.

### Absolute references: F4

With the caret on a reference, **F4** cycles it `A1 → $A$1 → A$1 → $A1 → A1`. Use it to lock, for example, the discount rate before copying a formula: `=C30/(1+$B$14)^C17`.

## Copy and fill

| Action | How |
|---|---|
| Fill by dragging | Drag the **small square** at the bottom-right of the selection down or right. Relative references adjust (`=A1*2` → `=A2*2`…), absolute ones (`$`) are kept. Two selected numbers extend as a series (1, 2 → 3, 4, 5…); text ending in a number too ("Year 1" → "Year 2"…). |
| Fill to the end of the data | **Double-click** the square: fills down as far as the neighbouring column has data. |
| Fill down / right | **Ctrl+D** / **Ctrl+R** (⌘ on Mac). |
| Type into several cells at once | Select the range, type the formula and press **Ctrl+Enter**. |
| Copy / paste | **Ctrl+C** and **Ctrl+V**: the pasted formula adjusts its references. A marching-ants border marks the copied range until Escape. Pasting into Excel pastes values. |
| Cut / paste | **Ctrl+X** and **Ctrl+V** move the cells and update formulas that point to them. If the cell holds an **assumption or forecast**, the definition moves with it. |
| Paste values only | **Ctrl+Shift+V**. |

## Formulas tab

- **Insert function** and **AutoSum** (**Alt+=**): AutoSum suggests `=SUM(…)` over the contiguous range above or to the left.
- **Show formulas** (**Ctrl+`**): the sheet shows formulas instead of results — handy to review a cash flow.
- **Trace precedents / dependents**: draws arrows from the cells a formula uses (or to the cells that depend on it). A second click shows the next level; **Remove arrows** clears them. Great to understand what the NPV depends on.
- **Evaluate formula**: shows step by step how it is computed, replacing each reference and function by its value.
- **Defined names**: create names such as `DiscountRate` for a cell or range and use them in formulas (`=NPV(DiscountRate,C30:G30)`); they also show up in autocomplete.

## Errors

Cells with errors show the Excel code (`#DIV/0!`, `#NAME?`, `#REF!`, `#VALUE!`, `#N/A`, `#NUM!`) with a small marker. Select the cell and a tooltip explains the cause in plain words (e.g. "dividing by zero"). If you type a malformed formula, the editor stays open and warns: "There's a problem with this formula…".

## Formula bar

The bar colours references, functions, strings and numbers. For long formulas expand it with the chevron on the right or **Ctrl+Shift+U**, and use **Alt+Enter** for line breaks.

::: warning Unavailable functions
The calculation engine ([HyperFormula](https://hyperformula.handsontable.com)) covers hundreds of Excel functions, but not all of them. Not available yet: MODE, RANK, INTERCEPT, FORECAST, TREND, GROWTH, VDB, CONCAT and AVERAGEIFS — typing them gives `#NAME?`. On phones, click-to-reference and drag-to-fill are disabled so they don't interfere with scrolling.
:::
