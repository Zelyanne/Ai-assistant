---
name: google-slides-agent-skill
description: Google Slides specialist playbook for deck story design, presentation creation, batch slide updates, visual hierarchy, validation, and handoffs.
---

# Google Slides Agent Skill

Use this file for the Google Slides agent in this project.

The Slides agent should think in narrative and visual hierarchy first, then convert that structure into Google Slides API batch requests.

This guidance is based on Taylor Wilsdon's Google Workspace MCP Slides tools plus official Google Slides batch update and styling examples.

## Main Goal

The Slides agent should:

- create clear, structured decks
- build slides in coherent batches
- keep one idea per slide
- use restrained colors and strong title hierarchy
- verify the deck after major updates

## How To Use This Skill

Read this playbook in this order during a task:

1. Use the fast decision map to choose create, update, batch-build, or validate.
2. Decide the deck story before creating slide requests.
3. Use deterministic object IDs and grouped batch updates.
4. Keep one idea per slide.
5. Finish with the completion checklist and handoff format.

## Fast Decision Map

- User asks for a new deck: use `create_presentation`, then populate it with `batch_update_presentation` or `modify_presentation`.
- User asks to add or change slides in an existing deck: use the provided presentation ID and a targeted update tool.
- User gives content but no structure: create a short narrative outline first, then build slides.
- User asks for visual polish: apply hierarchy, spacing, restrained color, and readable text sizing where tools allow.
- Read-back tools are unavailable: rely on deterministic request construction and report that visual QA still needs review.

## Tool Surface To Prefer

## Runtime Tool Access In This Project

The Slides specialist receives these tools when the graph builds its tool set. Use the live tool list as the final source of truth, but assume this project-level access pattern:

- `create_presentation`: create a new Google Slides presentation.
- `modify_presentation`: modify presentation content through the local MCP abstraction when available.
- `batch_update_presentation`: apply Google Slides API batch requests for slide creation, text insertion, and styling.
- `get_current_time`: anchor dates and time-sensitive labels in the deck.

The local policy may not expose read-back tools such as `get_presentation` or thumbnail inspection. If those tools are absent, validate by checking tool responses, use deterministic object IDs, and include a clear handoff explaining what was created and what still needs visual review.

## Upstream Slides Tool Notes

Taylor's upstream Slides tiers look like this.

## Core

- `create_presentation`
- `get_presentation`

## Extended

- `batch_update_presentation`
- `get_page`
- `get_page_thumbnail`

## Complete

- `list_presentation_comments`

Important project note:

The reliable upstream write path is `batch_update_presentation`.
If you see `modify_presentation` mentioned elsewhere locally, do not assume it exists upstream. Trust the live tool list.

## Recommended Workflow

1. Define the deck story.
2. Create the presentation.
3. Build slides in grouped batches.
4. Re-read the deck.
5. Use page inspection or thumbnails for QA if available.

## Story Rules

Before making requests, decide:

- who the audience is
- what decision or outcome the deck supports
- what each slide contributes
- what the last slide should leave behind

Strong business default structure:

1. title slide
2. executive summary
3. key metrics
4. trend or comparison
5. risks or blockers
6. recommendation
7. next steps

## Design Rules

## Layout

- one idea per slide
- strong title on every slide
- no text walls
- stable grid and spacing
- enough whitespace for readability

## Typography

- slide titles should state the takeaway, not just the topic
- body text should stay short
- use bold for emphasis, not decoration

## Color

Good default palette:

- dark base: `#0F172A`
- secondary: `#334155`
- light surface: `#F8FAFC`
- accent: `#2563EB`
- positive: `#10B981`
- warning: `#F59E0B`
- negative: `#E11D48`

Avoid introducing a different accent on every slide.

## Completion Checklist

Before finishing, verify:

- The deck has a clear audience and story arc.
- Each slide has one main idea and a takeaway-style title.
- Batch requests use deterministic object IDs.
- Text is concise enough for slides, not copied as document prose.
- Visual styling is consistent where tooling allows it.
- Handoff includes presentation ID, URL, slide count/structure, and any validation limitations.

## When To Use Each Tool

## `create_presentation`

Use this to create the deck.

Important parameters:

- `user_google_email`
- `title`

## `get_presentation`

Use this to:

- inspect current slide structure
- verify that a batch worked
- summarize the deck
- check extracted slide text

## `batch_update_presentation`

This is the main advanced write tool.

Important parameters:

- `user_google_email`
- `presentation_id`
- `requests`

Best practice:

- group related operations
- use meaningful object IDs
- re-read the deck after a meaningful batch

## `get_page` and `get_page_thumbnail` if available

Use them for QA on important slides.

## Request Construction Rules

For most new slide work, use this order:

1. `createSlide`
2. `createShape` if you need custom text boxes
3. `insertText`
4. `updateTextStyle`
5. additional formatting requests

Use deterministic IDs like:

- `slide_exec_summary`
- `shape_kpi_revenue`
- `shape_title_main`

This makes future updates easier.

## Example 1: Create a presentation

```json
{
  "tool": "create_presentation",
  "args": {
    "user_google_email": "user@company.com",
    "title": "Q2 Operating Review"
  }
}
```

## Example 2: Add a title slide with a custom text box

```json
{
  "tool": "batch_update_presentation",
  "args": {
    "user_google_email": "user@company.com",
    "presentation_id": "PRESENTATION_ID",
    "requests": [
      {
        "createSlide": {
          "objectId": "slide_title",
          "insertionIndex": 1,
          "slideLayoutReference": {
            "predefinedLayout": "BLANK"
          }
        }
      },
      {
        "createShape": {
          "objectId": "shape_title_main",
          "shapeType": "TEXT_BOX",
          "elementProperties": {
            "pageObjectId": "slide_title",
            "size": {
              "width": { "magnitude": 480, "unit": "PT" },
              "height": { "magnitude": 60, "unit": "PT" }
            },
            "transform": {
              "scaleX": 1,
              "scaleY": 1,
              "translateX": 40,
              "translateY": 60,
              "unit": "PT"
            }
          }
        }
      },
      {
        "insertText": {
          "objectId": "shape_title_main",
          "insertionIndex": 0,
          "text": "Q2 Operating Review"
        }
      },
      {
        "updateTextStyle": {
          "objectId": "shape_title_main",
          "style": {
            "foregroundColor": {
              "opaqueColor": {
                "rgbColor": {
                  "red": 0.06,
                  "green": 0.09,
                  "blue": 0.16
                }
              }
            },
            "fontSize": { "magnitude": 28, "unit": "PT" },
            "bold": true
          },
          "fields": "foregroundColor,fontSize,bold"
        }
      }
    ]
  }
}
```

## Example 3: Create an executive summary slide with placeholders

```json
{
  "tool": "batch_update_presentation",
  "args": {
    "user_google_email": "user@company.com",
    "presentation_id": "PRESENTATION_ID",
    "requests": [
      {
        "createSlide": {
          "objectId": "slide_exec_summary",
          "insertionIndex": 2,
          "slideLayoutReference": {
            "predefinedLayout": "TITLE_AND_BODY"
          },
          "placeholderIdMappings": [
            {
              "layoutPlaceholder": { "type": "TITLE", "index": 0 },
              "objectId": "shape_exec_title"
            },
            {
              "layoutPlaceholder": { "type": "BODY", "index": 0 },
              "objectId": "shape_exec_body"
            }
          ]
        }
      },
      {
        "insertText": {
          "objectId": "shape_exec_title",
          "insertionIndex": 0,
          "text": "Executive Summary"
        }
      },
      {
        "insertText": {
          "objectId": "shape_exec_body",
          "insertionIndex": 0,
          "text": "- Revenue finished 8% above plan\n- Margin improved 2.1 points quarter over quarter\n- Main risk: delayed enterprise renewals in the West region\n- Recommendation: preserve hiring pace and accelerate renewal outreach"
        }
      }
    ]
  }
}
```

## Example 4: Update text style for hierarchy

```json
{
  "tool": "batch_update_presentation",
  "args": {
    "user_google_email": "user@company.com",
    "presentation_id": "PRESENTATION_ID",
    "requests": [
      {
        "updateTextStyle": {
          "objectId": "shape_exec_body",
          "style": {
            "fontSize": { "magnitude": 18, "unit": "PT" },
            "foregroundColor": {
              "opaqueColor": {
                "rgbColor": {
                  "red": 0.2,
                  "green": 0.25,
                  "blue": 0.31
                }
              }
            }
          },
          "fields": "fontSize,foregroundColor"
        }
      }
    ]
  }
}
```

## Example 5: Read back the deck

```json
{
  "tool": "get_presentation",
  "args": {
    "user_google_email": "user@company.com",
    "presentation_id": "PRESENTATION_ID"
  }
}
```

Use this after major updates to verify slide order and content.

## Recommended Dashboard Deck Pattern

If the deck comes from spreadsheet insights, use this structure:

1. title
2. executive summary
3. KPI slide
4. trend slide
5. segment comparison slide
6. risk and recommendation slide
7. appendix if needed

The deck should translate the spreadsheet into decisions, not copy every table.

## Quality Control Rules

After each meaningful batch:

- call `get_presentation`
- verify slide titles
- verify text landed in the right objects
- if available, use `get_page` or `get_page_thumbnail` on important slides

## Anti-Patterns

Do not:

- build slides before deciding the story
- make slide titles that only name the topic
- overload a slide with text
- use many decorative colors
- send giant unreadable batches with random IDs
- skip verification after writes
- assume `modify_presentation` exists if the live tool list exposes only `batch_update_presentation`

## Final Checklist

Before finishing, verify:

- the title is specific
- each slide has one clear purpose
- object IDs are readable where possible
- text hierarchy is clear
- colors are restrained
- the deck was re-read after updates
