---
name: google-sheets-agent-skill
description: Google Sheets specialist playbook for spreadsheet creation, data writing, formula design, dashboards, validation, and clean handoffs.
---

# Google Sheets Agent Skill

Use this file for the Google Sheets agent in this project.

The Sheets agent should think like a spreadsheet architect and dashboard builder, not just a tool caller. A great sheet is structured, maintainable, and visually calm.

This guidance is based on Taylor Wilsdon's Google Workspace MCP tools, official Google documentation, and Google Sheets dashboard best practices.

## Main Goal

The Sheets agent should:

- create clean spreadsheet structures
- write formulas correctly with the right interpretation mode
- separate raw data from model logic and dashboard presentation
- make dashboards readable and attractive
- use Apps Script only when formulas and native sheet tools are not enough

## How To Use This Skill

Read this playbook in this order during a task:

1. Use the fast decision map to choose create, read, write, or validate.
2. Design the workbook layout before writing values.
3. Use `USER_ENTERED` formulas intentionally.
4. Read back important ranges after complex writes when possible.
5. Finish with the completion checklist and handoff format.

## Fast Decision Map

- User asks for a new spreadsheet, tracker, table, model, or dashboard: use `create_spreadsheet`, then `modify_sheet_values`.
- User asks to inspect or summarize an existing sheet: use `read_sheet_values`; do not write.
- User asks to update cells or formulas: use `read_sheet_values` first unless the target range is exact and low-risk, then `modify_sheet_values`.
- User asks for calculations: write formulas with `USER_ENTERED` and prefer helper tables over unreadable mega-formulas.
- User asks for visual polish but formatting tools are unavailable: build clean structure and state the formatting limitation in the handoff.

## Tool Surface To Prefer

## Runtime Tool Access In This Project

The Sheets specialist receives these tools when the graph builds its tool set. Use the live tool list as the final source of truth, but assume this project-level access pattern:

- `create_spreadsheet`: create a new spreadsheet, preferably with all planned tabs named up front.
- `modify_sheet_values`: write values or formulas into a range, clear ranges when requested, and use `USER_ENTERED` for formulas/dates/currency.
- `read_sheet_values`: inspect existing data before edits and validate results after meaningful writes.
- `get_current_time`: anchor date labels, report timestamps, and relative-date calculations.

The current local policy does not expose formatting, chart, conditional-formatting, or Apps Script tools to the Sheets specialist unless the live MCP server/tool policy changes. If the user asks for visual polish that requires unavailable formatting tools, still create a well-structured workbook and state which formatting should be applied later.

## Upstream Sheets Tool Notes

Taylor's upstream Sheets tiers look like this.

## Core

- `create_spreadsheet`
- `read_sheet_values`
- `modify_sheet_values`

## Extended

- `list_spreadsheets`
- `get_spreadsheet_info`
- `format_sheet_range`

## Complete

- `create_sheet`
- `list_spreadsheet_comments`
- `manage_spreadsheet_comment`
- `manage_conditional_formatting`

## Optional Apps Script tools that are very useful for advanced dashboards

- `create_script_project`
- `update_script_content`
- `run_script_function`

Important project note:

Your local runtime may expose only the core tools. Always trust the live tool list.

## Default Spreadsheet Architecture

For serious spreadsheet work, prefer this tab layout:

- `README` or `Notes`
- `Raw`
- `Lookup`
- `Model`
- `Dashboard`

### What each sheet does

- `Raw`: untouched source data
- `Lookup`: categories, thresholds, mappings, targets
- `Model`: helper formulas, cleaned tables, query outputs
- `Dashboard`: final human-facing view only

Do not mix raw imports and final presentation in the same busy tab if you can avoid it.

## Design Rules For Beautiful Sheets

Beautiful Sheets are not loud. They are clean, aligned, and easy to scan.

## Layout

- leave whitespace around KPI sections
- place filters near the top-left
- keep charts in a dedicated visual band
- place detail tables below charts
- freeze headers when long tables are involved

## Color palette

Use a restrained palette:

- dark base: `#0F172A`
- secondary slate: `#334155`
- surface: `#F8FAFC`
- divider: `#E2E8F0`
- accent: `#2563EB`
- positive: `#10B981`
- warning: `#F59E0B`
- negative: `#E11D48`

Use one accent plus status colors. Avoid rainbow charts.

## Typography and numbers

- dashboard title should be bold and clear
- KPI numbers should be large and easy to read
- labels should be short
- use number formats for currency, percent, and date values
- avoid long decimals unless precision really matters

## Chart rules

- line chart for trends over time
- bar chart for ranking comparisons
- stacked bar only when composition matters
- pie chart rarely
- sparkline when you need small trend signals inside tables

## When To Use Each Tool

## `create_spreadsheet`

Use when a new workbook is needed.

Important parameters from Taylor's tool:

- `user_google_email`
- `title`
- `sheet_names`

Best practice:

- create planned tabs up front if you already know them
- for dashboards, a good default is `Raw`, `Lookup`, `Model`, `Dashboard`

## `read_sheet_values`

Use when:

- inspecting an existing workbook before editing
- validating formulas after writing
- confirming ranges, headers, and output tables

Important parameters from Taylor's tool:

- `user_google_email`
- `spreadsheet_id`
- `range_name`
- `include_hyperlinks`
- `include_notes`

Best practice:

- read before overwriting existing ranges
- read back after writing complex formulas
- prefer targeted reads instead of huge default reads when possible

## `modify_sheet_values`

This is the most important core write tool.

Important parameters from Taylor's tool:

- `user_google_email`
- `spreadsheet_id`
- `range_name`
- `values`
- `value_input_option`
- `clear_values`

Important behavior:

- `values` can be a real 2D array or a JSON string representing a 2D array
- the default `value_input_option` is `USER_ENTERED`
- with `USER_ENTERED`, formulas written as strings that begin with `=` are evaluated by Sheets
- `clear_values: true` clears the range instead of writing

That default `USER_ENTERED` mode is exactly what you want for formulas, dates, percentages, and currency.

## `format_sheet_range` if available

Useful styling parameters from Taylor's tool:

- `background_color`
- `text_color`
- `number_format_type`
- `number_format_pattern`
- `wrap_strategy`
- `horizontal_alignment`
- `vertical_alignment`
- `bold`
- `italic`
- `font_size`

Use it for headers, KPI cards, date and currency formatting, and visual hierarchy.

## `manage_conditional_formatting` if available

Useful parameters from Taylor's tool:

- `action`: `add`, `update`, `delete`
- `range_name`
- `condition_type`
- `condition_values`
- `background_color`
- `text_color`
- `rule_index`
- `gradient_points`
- `sheet_name`

Use it for:

- red/amber/green thresholds
- heatmaps
- overdue status
- performance bands

## Apps Script tools if available

Use Apps Script when you need:

- chart creation and positioning
- repeatable beautification
- frozen panes, widths, borders, banding
- time-based automation
- cross-app workflows

Recommended sequence:

1. `create_script_project`
2. `update_script_content`
3. `run_script_function`

Official Google Apps Script guidance strongly recommends batching operations and minimizing service calls.

## Formula Writing Principles

- keep raw data raw
- put complex logic in `Model`
- use `IFERROR` near the presentation boundary
- avoid volatile functions everywhere
- prefer helper tables over unreadable mega-formulas when maintainability matters

## Completion Checklist

Before finishing, verify:

- The workbook has clear tab names and a logical layout.
- Headers are present for every table.
- Formulas use valid ranges and `USER_ENTERED` behavior when needed.
- Existing data was read before risky updates.
- Important outputs were read back when practical.
- Handoff includes spreadsheet ID, URL, created/updated ranges, tab names, and any formatting limitations.

## Formula Library

These are strong defaults for dashboards.

## 1. KPI total with criteria

```gs
=SUMIFS(Raw!$H:$H, Raw!$B:$B, $B$2, Raw!$C:$C, $B$3)
```

## 2. Dynamic filtered table

```gs
=FILTER(Raw!A2:H, Raw!B2:B=$B$2, Raw!C2:C>=$B$3, Raw!C2:C<=$B$4)
```

## 3. Query summary table

```gs
=QUERY(Raw!A:H, "select B, sum(H) where C >= date '2026-01-01' group by B label sum(H) 'Revenue'", 1)
```

## 4. Ranked leaderboard

```gs
=SORTN(Model!A2:C, 10, 0, 3, FALSE)
```

## 5. Unique sorted filter source

```gs
=SORT(UNIQUE(FILTER(Raw!B2:B, Raw!B2:B<>"")))
```

## 6. Error-safe ratio

```gs
=IFERROR(SUM(Model!C2:C) / SUM(Model!D2:D), 0)
```

## 7. Multi-key lookup

```gs
=INDEX(Lookup!$D$2:$D$100, MATCH($B2&"|"&$C2, Lookup!$A$2:$A$100&"|"&Lookup!$B$2:$B$100, 0))
```

## 8. Dashboard label text

```gs
="Reporting window: " & TEXT($B$3, "dd mmm yyyy") & " - " & TEXT($B$4, "dd mmm yyyy")
```

## 9. Sparkline trend

```gs
=SPARKLINE(C2:N2, {"charttype","line";"linewidth",2;"color","#2563EB"})
```

## 10. KPI delta arrow label

```gs
=IF(E2>0, "+ " & TEXT(E2, "0.0%"), IF(E2<0, "- " & TEXT(ABS(E2), "0.0%"), "= 0.0%"))
```

## 11. Array-driven status logic

```gs
=ARRAYFORMULA(IF(A2:A="",,IF(H2:H>=1,"On Track","At Risk")))
```

## 12. Last nonblank value

```gs
=LOOKUP(2,1/(Raw!B:B<>""),Raw!B:B)
```

## 13. Monthly summary

```gs
=QUERY({TEXT(Raw!C2:C,"yyyy-mm"), Raw!H2:H}, "select Col1, sum(Col2) where Col1 is not null group by Col1 order by Col1 label sum(Col2) ''", 0)
```

## 14. Progress bar in a cell

```gs
=SPARKLINE(F2, {"charttype","bar";"max",1;"color1","#10B981"})
```

## Suggested Dashboard Layout

Strong default structure:

### Top band

- dashboard title
- date range
- refresh timestamp
- 3 to 6 KPI cards

### Middle band

- main trend chart
- category comparison chart
- risk or alert table

### Lower band

- detailed operational table
- assumptions or notes block if needed

## Recommended Build Sequence

1. `create_spreadsheet`
2. `modify_sheet_values` for raw headers and data
3. `modify_sheet_values` for helper tables and formulas in `Model`
4. `modify_sheet_values` for dashboard formulas in `Dashboard`
5. `read_sheet_values` to verify outputs
6. `format_sheet_range` and `manage_conditional_formatting` if available
7. Apps Script polish if needed and available

## Example 1: Create a dashboard workbook

```json
{
  "tool": "create_spreadsheet",
  "args": {
    "user_google_email": "user@company.com",
    "title": "Revenue Dashboard",
    "sheet_names": ["Raw", "Lookup", "Model", "Dashboard"]
  }
}
```

## Example 2: Write raw data

```json
{
  "tool": "modify_sheet_values",
  "args": {
    "user_google_email": "user@company.com",
    "spreadsheet_id": "SPREADSHEET_ID",
    "range_name": "Raw!A1:H4",
    "values": [
      ["Date", "Region", "Owner", "Channel", "Leads", "Won", "Revenue", "Target"],
      ["2026-03-01", "North", "Mina", "Paid", 120, 17, 32000, 30000],
      ["2026-03-01", "South", "Leo", "Organic", 95, 11, 21000, 25000],
      ["2026-03-01", "West", "Ari", "Partner", 55, 9, 18000, 15000]
    ]
  }
}
```

## Example 3: Write dashboard formulas with `USER_ENTERED`

```json
{
  "tool": "modify_sheet_values",
  "args": {
    "user_google_email": "user@company.com",
    "spreadsheet_id": "SPREADSHEET_ID",
    "range_name": "Dashboard!A1:B6",
    "values": [
      ["Revenue Dashboard", ""],
      ["Total Revenue", "=SUM(Raw!G2:G)"],
      ["Total Target", "=SUM(Raw!H2:H)"],
      ["Attainment", "=IFERROR(B2/B3,0)"],
      ["Top Region", "=INDEX(SORTN(QUERY(Raw!B2:G,\"select B, sum(F) group by B label sum(F) ''\",0),1,0,2,FALSE),1,1)"],
      ["Last Refresh", "=NOW()"]
    ],
    "value_input_option": "USER_ENTERED"
  }
}
```

## Example 4: Apply formatting if available

```json
{
  "tool": "format_sheet_range",
  "args": {
    "user_google_email": "user@company.com",
    "spreadsheet_id": "SPREADSHEET_ID",
    "range_name": "Dashboard!A1:B1",
    "background_color": "#0F172A",
    "text_color": "#F8FAFC",
    "bold": true,
    "font_size": 14,
    "horizontal_alignment": "LEFT"
  }
}
```

## Example 5: Add conditional formatting if available

```json
{
  "tool": "manage_conditional_formatting",
  "args": {
    "user_google_email": "user@company.com",
    "spreadsheet_id": "SPREADSHEET_ID",
    "action": "add",
    "range_name": "Dashboard!B4:B4",
    "condition_type": "NUMBER_LESS",
    "condition_values": [1],
    "background_color": "#FEE2E2",
    "text_color": "#991B1B"
  }
}
```

## Example 6: Apps Script for premium polish

Use Apps Script only if those tools are available and the task truly needs deeper polish.

```javascript
function beautifyDashboard(spreadsheetId) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ss.getSheetByName('Dashboard');
  if (!sheet) throw new Error('Dashboard sheet not found');

  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, 6, 140);
  sheet.getRange('A1:F1')
    .setBackground('#0F172A')
    .setFontColor('#F8FAFC')
    .setFontWeight('bold')
    .setFontSize(14);

  sheet.getRange('A2:B4')
    .setBackground('#F8FAFC')
    .setFontColor('#0F172A')
    .setBorder(true, true, true, true, false, false, '#E2E8F0', SpreadsheetApp.BorderStyle.SOLID);

  const rule = SpreadsheetApp.newConditionalFormatRule()
    .whenNumberLessThan(1)
    .setBackground('#FEE2E2')
    .setRanges([sheet.getRange('B4')])
    .build();
  const rules = sheet.getConditionalFormatRules();
  rules.push(rule);
  sheet.setConditionalFormatRules(rules);
}
```

Recommended MCP sequence:

1. `create_script_project`
2. `update_script_content`
3. `run_script_function` with `beautifyDashboard`

## Performance Rules

- avoid volatile functions everywhere
- avoid giant unbounded formulas when a bounded range is enough
- batch writes where possible
- in Apps Script, use `getValues()` and `setValues()` instead of per-cell loops

## Anti-Patterns

Do not:

- mix raw data and final visuals in one cluttered tab
- overwrite unknown ranges without reading first
- build the dashboard directly on top of raw data
- use too many colors
- create one unreadable mega-formula when helper ranges would be clearer
- use Apps Script for work that plain formulas already handle well

## Final Checklist

Before finishing, verify:

- tabs are logically separated
- formulas resolve correctly
- the dashboard shows values, not formula errors
- number formats fit the metric type
- the palette is restrained and consistent
- any script uses batch operations and clear function names
