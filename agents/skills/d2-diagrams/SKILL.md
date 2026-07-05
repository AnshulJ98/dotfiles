---
name: d2-diagrams
description: D2 declarative diagramming syntax reference for backend, service, and AWS-CDK architecture diagrams. Load when generating nested-container or infra diagrams where Mermaid is too weak.
---

# D2 Diagrams

Declarative diagramming language. Text to SVG/PNG/PDF. Beats Mermaid for nested containers and styling.

## Install

```bash
brew install d2   # or: curl -fsSL https://d2lang.com/install.sh | sh
```

## CLI

```bash
d2 in.d2 out.svg                 # render
d2 --watch in.d2 out.svg         # live reload
d2 in.d2 out.png                 # PNG (also .pdf)
d2 --layout elk in.d2 out.svg    # ELK layout (use this for complex graphs)
d2 --theme 200 in.d2 out.svg     # theme 0-100+
d2 --sketch in.d2 out.svg        # hand-drawn look
d2 --pad 50 in.d2 out.svg        # padding
```

Layout engines: `dagre` (default, fast), `elk` (complex graphs, preferred), `tala` (proprietary).
Themes: `0` default, `1` grey, `3` terminal, `5` terrastruct, `100` origami, `101` dark mauve, `200` cool classics.

## Palette (light-corporate)

Every example below inherits from the `classes` block. Reuse this block verbatim.

```d2
classes: {
    container: { style.fill: "#eef2f8"; style.stroke: "#d4dce8"; style.font-color: "#33415c" }
    primary:   { style.fill: "#4a72b0"; style.stroke: "#33415c"; style.font-color: white; style.border-radius: 8 }
    accent:    { style.fill: "#6a9bcc"; style.stroke: "#33415c"; style.font-color: white; style.border-radius: 8 }
    pastel:    { style.fill: "#a8c5e0"; style.stroke: "#d4dce8"; style.font-color: "#33415c" }
    database:  { shape: cylinder; style.fill: "#4a72b0"; style.font-color: white }
    store:     { shape: stored_data; style.fill: "#a8c5e0"; style.font-color: "#33415c" }
    queue:     { shape: queue; style.fill: "#6a9bcc"; style.font-color: white }
    ok:        { style.fill: "#7fa87f"; style.font-color: white; style.border-radius: 8 }
    muted:     { style.fill: "#eef2f8"; style.stroke: "#8a97ab"; style.font-color: "#8a97ab" }
}
```

Tokens: bg `#f7f9fc`, containers `#eef2f8`, border `#d4dce8`, primary `#4a72b0`, accent `#6a9bcc`, pastel `#a8c5e0`, text `#33415c`, muted `#8a97ab`, ok `#7fa87f`.

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
# Define in the classes block, assign with .class
api.class: primary
worker.class: accent
rds.class: database
s3.class: store
sqs.class: queue
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
direction: right

classes: {
    primary:  { style.fill: "#4a72b0"; style.font-color: white; style.border-radius: 8 }
    database: { shape: cylinder; style.fill: "#4a72b0"; style.font-color: white }
}

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
direction: down

classes: {
    primary: { style.fill: "#4a72b0"; style.font-color: white; style.border-radius: 8 }
    accent:  { style.fill: "#6a9bcc"; style.font-color: white; style.border-radius: 8 }
}

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

1. Write `docs/architecture.d2`.
2. Render: `d2 --layout elk docs/architecture.d2 docs/architecture.svg`.
3. Iterate: `d2 --watch --layout elk docs/architecture.d2 docs/architecture.svg`.
4. Reference: `![Architecture](docs/architecture.svg)`.
5. Commit both `.d2` source and rendered SVG.

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
