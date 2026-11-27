# Diagram style

Diagrams take their look from the `styles/` folder of the d2-diagrams skill: four themes and one vocabulary of classes. A diagram sets no colours. It marks what differs from "exists today".

## Themes

| Theme | Look |
| --- | --- |
| `slate` | Steel blue on warm grey. The default. |
| `indigo` | Navy strokes on lavender. |
| `teal` | Deep teal on mint grey. |
| `graphite` | Charcoal on warm grey. |

The same name sets the page accent, so links, the active sidebar entry and the diagram strokes match.

## Vocabulary

| Class | On | Means |
| --- | --- | --- |
| none | shape, edge | Exists today |
| `target` | shape | Planned, not built |
| `external` | shape | Outside the platform |
| `focus` | shape | The subject of this diagram |
| `risk` | shape | A problem the reader must notice |
| `muted` | shape | Background, out of scope |
| `blue` `green` `amber` `rose` `violet` `teal` `grey` | shape | A tint for a lane or a group; the legend says what it is |
| `group` | shape | A plain frame around related shapes |
| `planned` | edge | A call that does not happen yet |
| `async` | edge | An asynchronous call |
| `exception` | edge | A shortcut or a deviation the reader must notice |

## Lanes with tints

```d2
direction: down
channels: Channels {
  class: violet
  grid-rows: 1
  web: Web portal
  mobile: Mobile app
  partner: Partner API { class: external }
}
services: Services {
  class: blue
  grid-rows: 1
  orders: Order service
  billing: Billing service
  notify: Notification service { class: target }
}
data: Data {
  class: green
  grid-rows: 1
  db: Orders { shape: cylinder }
  bus: Events { shape: queue }
  reports: Reporting store { shape: cylinder; class: target }
}
platform: "Platform: identity, logging, deployment" { class: grey }
channels -> services: HTTPS
services -> data
services -> platform: audit events { class: async }
```

## Architecture with a legend

```d2
direction: down
vars: {
  d2-legend: {
    a: Built in phase 1
    b: Target, not built { class: target }
    c: Outside the platform { class: external }
    a -> b: Phase 1 shortcut { class: exception }
  }
}
user: Customer { shape: person; class: target }
portal: Web portal (BFF) { class: target }
sched: "Scheduler\nevery 15 min"
worker: "Notification worker\nPhase 1: batch Lambda\nTypeScript"
idp: "Identity provider\ntoken exchange" { class: target }
tmpl: "Template service\nHandlebars renderer"
gw: "Message gateway\nrate limits\n+ consent check\n+ audit log" { class: target }
prefs: Preferences { shape: cylinder; class: target }
sender: "Channel sender\nPhase 1: email only"
api: Provider API gateway { class: target }
store: "Delivery log\nPhase 1: one DynamoDB table" { shape: cylinder }
obs: Tracing backend { class: external }

user -> portal: token U { class: planned }
portal -> worker: token U { class: planned }
sched -> worker: trigger
worker -> tmpl: render
worker -> sender: "Phase 1 shortcut:\ndirect invoke\n(skips gateway)" { class: exception }
worker -> gw: token A { class: planned }
idp -> gw: "U > A > B" { class: planned }
gw -> prefs { class: planned }
gw -> sender: token B { class: planned }
sender -> api: token C { class: planned }
api -> store { class: planned }
sender -> store: write result
worker -> obs: traces
sender -> obs: traces
gw -> obs { class: planned }
```

## Sequence with numbered steps

```d2
shape: sequence_diagram
dev: Developer
skill: "Docs skill\nagent instructions"
build: "Build CLI\ndeterministic: parse, render, check" { class: focus }
repo: "Docs folder\nMarkdown, d2 blocks, images"
viewer: "SharePoint\nHTML viewer"

dev -> skill: 1  Publish the design doc
skill -> build: 2  check
build -> repo: read files, links, diagrams
build -> skill: broken links and diagram errors
skill -> dev: 3  Two links are broken. Fix them?
dev -> skill: yes
skill -> build: 4  build
build -> repo: render d2, embed images
build -> dev: one HTML file
dev -> viewer: 5  upload
viewer -> dev: link to share
```
