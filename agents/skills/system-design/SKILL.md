---
name: system-design
description: Principles for building reusable coding systems. Use when designing modules, APIs, CLIs, or any code meant to be used by others. Based on "A Philosophy of Software Design" by John Ousterhout.
tags:
  - design
  - architecture
  - modules
  - apis
---

# System Design Principles

Based on *A Philosophy of Software Design* (Ousterhout).

## Deep Modules

**Good modules are deep**: small interface, large implementation.

```
Interface: narrow (few public methods, simple params)
Implementation: large (handles complexity internally)
```

**Shallow modules** (anti-pattern): interface as complex as implementation. No net benefit.

```typescript
// Shallow (bad) — caller must know too much
class FileReader {
  openFile(path: string): FileDescriptor;
  readChunk(fd: FileDescriptor, offset: number, length: number): Buffer;
  closeFile(fd: FileDescriptor): void;
}

// Deep (good) — complexity hidden
class FileReader {
  readFile(path: string): string;  // handles open/read/close internally
}
```

## Information Hiding

Each module should hide its design decisions from callers. If callers need to know about an implementation detail, that detail has leaked.

Signs of leakage:
- Callers must pass config that reflects internal implementation
- Error types reveal internals (`DatabaseConnectionError` from a service layer)
- Ordering requirements between method calls

## Design Twice

Before implementing, sketch two different approaches. Compare them. The second idea often exposes flaws in the first. Takes 30 minutes. Saves hours.

## Error Handling Philosophy

Fewer error cases → simpler systems. Ask: can this error be handled internally instead of propagated?

Options:
1. Handle it internally (absorb the error)
2. Detect early (validate at boundary, not deep in stack)
3. Crash hard (for truly unrecoverable states — beats silent corruption)

## Complexity Red Flags

- **Change amplification**: changing one thing requires changes in many places
- **Cognitive load**: reader must hold too much in working memory to understand code
- **Unknown unknowns**: things that can break in non-obvious ways

## Module Interface Checklist

Before finalizing a public API:
- [ ] Can a caller use this without reading the implementation?
- [ ] Are all parameters necessary? Can any be removed or defaulted?
- [ ] Do the error types reveal internals?
- [ ] Does the interface impose ordering requirements on callers?
- [ ] Would a new engineer understand this without docs?
