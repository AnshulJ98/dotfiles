---
name: diagram-generation
description: "Use when the user asks to create, draw, or visualize diagrams — architecture diagrams, pipeline flows, flowcharts, decision trees, system context maps, comparison diagrams, or any SVG/.drawio output. Trigger words: diagram, chart, flow, flowchart, visualize, draw, SVG, draw.io, .drawio, .svg, architecture diagram, system context, pipeline flow, decision tree, dark theme diagram."
tags:
  - diagrams
  - svg
  - drawio
  - visualization
---

# Diagram Generation — draw.io + SVG

## Toolchain

- **draw.io app**: `/Applications/draw.io.app` (installed)
- **drawio CLI**: `drawio` (export diagrams headlessly)
- **Output formats**: `.drawio` (editable), `.svg` (embed/display), `.png` (raster fallback)

## Workflow

### Option A: Generate .drawio XML directly

Create the `.drawio` file (it's XML), then export:

```bash
drawio --export --format svg --output diagram.svg diagram.drawio
drawio --export --format png --output diagram.png diagram.drawio
```

### Option B: Generate SVG directly

For simple diagrams, write SVG directly. Use Bearded Monokai Black palette.

## Dark Theme Palette (Bearded Monokai Black)

| Color | Hex | Use |
|-------|-----|-----|
| Background | `#141414` | Diagram bg |
| Text | `#c7c7c7` | Labels |
| Border | `#545454` | Shapes |
| Accent Yellow | `#ffee00` | Primary nodes |
| Accent Cyan | `#44ddff` | Functions/links |
| Accent Magenta | `#ff44ff` | Parameters |
| Accent Green | `#66ff88` | Success/strings |
| Accent Red | `#ff5555` | Errors/critical |
| Accent Purple | `#cc88ff` | Types/secondary |
| Accent Orange | `#ff8844` | Warnings |

## draw.io XML Template (Dark Theme)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<mxGraphModel background="#141414" gridColor="#2a2a2a">
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <!-- Add cells here -->
    <!-- Rectangle node example: -->
    <mxCell id="2" value="Service A" style="rounded=1;fillColor=#1e1e1e;strokeColor=#44ddff;fontColor=#c7c7c7;fontSize=13;" vertex="1" parent="1">
      <mxGeometry x="100" y="100" width="160" height="50" as="geometry"/>
    </mxCell>
    <!-- Arrow example: -->
    <mxCell id="3" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#ff44ff;fontColor=#c7c7c7;" edge="1" source="2" target="..." parent="1">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
  </root>
</mxGraphModel>
```

## Diagram Types

| Type | When | Shapes to use |
|------|------|---------------|
| System Context | Service boundaries, external actors | Rounded rects, cylinders for DBs |
| Flow / Pipeline | Data flow, CI/CD, request lifecycle | Diamonds for decisions, arrows |
| Architecture | Service mesh, infrastructure | Nested containers, icons |
| Decision Tree | Options and outcomes | Diamonds → labeled branches |
| ERD | Data model | Tables with field rows |

## SVG Direct Template (simple diagrams)

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" style="background:#141414">
  <rect x="50" y="50" width="160" height="50" rx="8" fill="#1e1e1e" stroke="#44ddff" stroke-width="1.5"/>
  <text x="130" y="80" text-anchor="middle" fill="#c7c7c7" font-family="monospace" font-size="13">Service A</text>
  <line x1="210" y1="75" x2="290" y2="75" stroke="#ff44ff" stroke-width="1.5" marker-end="url(#arrow)"/>
  <defs>
    <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#ff44ff"/>
    </marker>
  </defs>
</svg>
```

## Rules

- Always use dark theme palette — never white background
- Export both .drawio (editable) and .svg (display) when creating new diagrams
- Label all nodes and edges
- Keep diagrams focused — one concept per diagram
