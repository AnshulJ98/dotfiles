---
name: d2-diagrams
description: D2 declarative diagramming syntax reference for backend, service, and AWS-CDK architecture diagrams. Load when generating nested-container or infra diagrams where Mermaid is too weak.
---

# D2 Diagrams

Declarative diagramming language. Text to SVG/PNG/PDF. Beats Mermaid for nested containers and styling.

Default to PNG for rendered diagrams and Markdown embeds: PNG works in the user's Neovim Markdown preview and opens quickly in Yazi. Keep the `.d2` source editable; export SVG only when explicitly requested.

## Install

```bash
brew install d2   # or: curl -fsSL https://d2lang.com/install.sh | sh
```

## CLI

```bash
d2 in.d2 out.png                 # render (always specify PNG; D2 defaults to SVG)
d2 --watch in.d2 out.png         # live reload
d2 in.d2 out.svg                 # SVG only when explicitly requested (also .pdf)
d2 --layout elk in.d2 out.png    # ELK layout (use this for complex graphs)
d2 --theme 200 in.d2 out.png     # theme 0-100+
d2 --sketch in.d2 out.png        # hand-drawn look
d2 --pad 50 in.d2 out.png        # padding
```

Layout engines: `dagre` (default, fast), `elk` (complex graphs, preferred), `tala` (proprietary).
Themes: `0` default, `1` grey, `3` terminal, `5` terrastruct, `100` origami, `101` dark mauve, `200` cool classics. The styles below need theme `0`.

## Styles

Diagrams should set no colours of their own. The look comes from `styles/` in this skill: four light themes and corresponding `-dark` variants, with light and dark semantic vocabularies.

Copy `styles/<theme>.d2` and `styles/vocabulary.d2` next to the diagram, import the theme on the first line, and render with the default `--theme 0`:

```d2
...@slate
```

For a dark render, copy `<theme>-dark.d2` and `vocabulary-dark.d2` instead and import `<theme>-dark`. The HTML microsite builder renders both variants automatically.

To render without copying, import by the absolute path of this skill's folder: `...@"/abs/path/to/d2-diagrams/styles/slate"`.

| Theme | Look |
| --- | --- |
| `slate` | Steel blue on warm grey. The default. |
| `indigo` | Navy strokes on lavender. |
| `teal` | Deep teal on mint grey. |
| `graphite` | Charcoal on warm grey, for the most formal documents. |

An unclassed shape or edge means "exists today". A class marks what differs:

| Class | On | Means |
| --- | --- | --- |
| `target` | shape | Planned, not built |
| `external` | shape | Outside the platform |
| `focus` | shape | The subject of this diagram |
| `risk` | shape | A problem the reader must notice |
| `muted` | shape | Background, out of scope |
| `blue` `green` `amber` `rose` `violet` `teal` `grey` | shape | A tint for a lane or a group. It has no fixed meaning; name it in the legend. |
| `group` | shape | A plain frame around related shapes |
| `planned` | edge | A call that does not happen yet |
| `async` | edge | An asynchronous call |
| `exception` | edge | A shortcut or a deviation the reader must notice |

Rules:

- Add a legend when a diagram uses a state class or a tint.
- Number the messages of a sequence diagram when the text refers to steps (`a -> b: 1  Submit order`).
- Don't set `style.fill` or `style.stroke` inline. If no class fits, add it to both `styles/vocabulary.d2` and `styles/vocabulary-dark.d2`.
- Don't set `style.border-radius` or `style.stroke-width` either: the vocabulary gives every shape rounded corners and a 1px stroke, and every edge a 1px line.
- Don't name a shape `style`, `class` or `shape`: d2 reserves those words.
- The old names `container`, `primary`, `accent`, `pastel`, `database`, `store`, `queue` and `ok` still work and follow the theme. Use the vocabulary above in new diagrams.

```d2
...@slate
vars: {
  d2-legend: {
    a: Exists today
    b: Planned { class: target }
    a -> b: Planned call { class: planned }
  }
}
api: Order API
notify: Notification service { class: target }
api -> notify: order placed { class: planned }
```

## Syntax

### Shapes and connections

```d2
server: API Server
db: Database {shape: cylinder}
queue: Message Queue {shape: queue}
user: Client {shape: person}
cloud: AWS {shape: cloud}
code: Handler {shape: hexagon}
pkg: Module {shape: package}

server -> db: queries
server -> queue: enqueues
user -> server: HTTPS
queue -> server: consumes
```

### Shape types

`rectangle` (default), `square`, `circle`, `oval`, `diamond`, `hexagon`, `cylinder` (DBs), `queue` (message queues), `person` (actors), `cloud` (services), `page` (docs), `package` (modules), `parallelogram`, `stored_data` (data stores).

### Containers (nesting)

```d2
aws: AWS Cloud {
    vpc: VPC {
        public: Public Subnet {
            alb: Load Balancer {shape: hexagon}
        }
        private: Private Subnet {
            ecs: ECS Cluster {
                service: Fargate Service {
                    container: API Service
                }
            }
            rds: PostgreSQL {shape: cylinder}
        }
    }
    s3: S3 Bucket {shape: stored_data}
}

aws.vpc.public.alb -> aws.vpc.private.ecs.service
aws.vpc.private.ecs.service.container -> aws.vpc.private.rds: SQL
aws.vpc.private.ecs.service.container -> aws.s3: uploads
```

### Connection styles

```d2
a -> b: solid arrow
a -- b: line
a <-> b: bidirectional
a -> b -> c: chained

a -> b: { style.stroke-dash: 5 }              # dashed
a -> b: { style.stroke: "#4a72b0"; style.stroke-width: 3 }
a -> b: "REST" { style.font-size: 12 }
```

### Inline styling

```d2
server: API Server {
    style: {
        fill: "#4a72b0"
        stroke: "#33415c"
        font-color: white
        border-radius: 8
        shadow: true
        bold: true
    }
}
```

Prefer `.class` assignment over inline styles so diagrams stay on-palette.

### Icons

```d2
lambda: Lambda {
    icon: https://icons.terrastruct.com/aws%2FCompute%2FAWS-Lambda.svg
}
server: {
    icon: https://icons.terrastruct.com/tech%2Fservers.svg
    shape: rectangle
}
```

### Sequence diagrams

```d2
shape: sequence_diagram

client: Client
api: API Gateway
lambda: Lambda
db: DynamoDB

client -> api: POST /users
api -> lambda: Invoke
lambda -> db: PutItem
db -> lambda: OK
lambda -> api: 201 Created
api -> client: Response

lambda."Validate input": {shape: text}
```

### Classes (reusable styles)

```d2
# Classes come from the imported theme. Assign with .class or inside the shape.
gateway.class: target
vendor: Payment provider { class: external }
api -> gateway { class: planned }
```

### Layers (multiple diagrams, one file)

```d2
title: System Architecture

layers: {
    detailed:   { title: Detailed View }
    deployment: { title: Deployment View }
}
```

### Markdown labels

```d2
notes: |md
    # API Design
    - RESTful endpoints
    - JWT auth
    - Rate limit: 100 req/min
| { shape: page }
```

### Code blocks in diagrams

```d2
handler: |ts
    export async function handler(event: APIGatewayEvent) {
        const body = JSON.parse(event.body ?? "{}");
        const result = await db.put(body);
        return { statusCode: 201, body: JSON.stringify(result) };
    }
| {shape: code}
```

## Architecture patterns

### Microservices

```d2
...@slate
direction: right

client: Client {shape: person}
gateway: API Gateway {shape: hexagon}

services: Services {
    auth: Auth Service
    users: User Service
    orders: Order Service
}

data: Data Layer {
    users_db: Users DB {shape: cylinder}
    orders_db: Orders DB {shape: cylinder}
    cache: Redis {shape: cylinder}
}

client -> gateway
gateway -> services.auth
gateway -> services.users
gateway -> services.orders
services.users -> data.users_db
services.orders -> data.orders_db
services.auth -> data.cache
```

### AWS CDK stack

```d2
...@slate
direction: down

vpc: VPC {
    public: Public Subnets {
        alb: ALB {shape: hexagon}
        nat: NAT Gateway
    }
    private: Private Subnets {
        ecs: ECS Fargate {
            task: Task Definition {
                app: API Service { class: primary }
            }
        }
        lambda: Lambda Functions {
            api: API Handler
            worker: Queue Worker
        }
        db: DynamoDB {shape: cylinder}
    }
}
s3: S3 {shape: stored_data}
sqs: SQS {shape: queue}
cloudfront: CloudFront {shape: cloud}

cloudfront -> vpc.public.alb
vpc.public.alb -> vpc.private.ecs
vpc.private.lambda.api -> vpc.private.db
vpc.private.lambda.worker -> vpc.private.db
sqs -> vpc.private.lambda.worker
vpc.private.ecs.task.app -> s3
```

## Workflow

1. Write `docs/architecture.d2`, with `styles/<theme>.d2` and `styles/vocabulary.d2` copied beside it.
2. Render: `d2 --layout elk docs/architecture.d2 docs/architecture.png`.
3. Iterate: `d2 --watch --layout elk docs/architecture.d2 docs/architecture.png`.
4. Reference: `![Architecture](docs/architecture.png)`.
5. Commit both `.d2` source and rendered PNG.

## D2 vs Mermaid

| Feature            | D2                     | Mermaid             |
| ------------------ | ---------------------- | ------------------- |
| Complex layouts    | Excellent (ELK)        | Basic               |
| Containers/nesting | Native                 | Limited (subgraphs) |
| Styling            | Rich, CSS-like         | Basic classDef      |
| Icons              | URL-based              | None                |
| Code blocks        | Native                 | None                |
| Sketch mode        | Built-in               | None                |
| Sequence diagrams  | Yes                    | Yes                 |
| Output formats     | SVG, PNG, PDF          | SVG, PNG            |

Use D2 for complex/nested architecture, AWS/CDK diagrams, system design docs. Use Mermaid for quick flowcharts and ERDs that GitHub renders inline.
