---
title: "Sigstore Creator Launches nolabs to Stop AI Agents Running Wild"
source: "Software Testing News"
url: "https://softwaretestingnews.co.uk/sigstore-creator-launches-nolabs-to-stop-ai-agents-running-wild/"
published: 2026-08-11
added: 2026-08-11
category: "General"
tags: []
type: article
---

# Sigstore Creator Launches nolabs to Stop AI Agents Running Wild

Nolabs’ open source tool nono creates a new foundational security layer for AI agents, allowing them to get work done without giving them dangerous levels of access London, UK – 21 st July 2026 – nolabs today launches with a practical answer to a problem security teams are already grappling with today: how do you let agents reason and explore without letting them run wild?

AI agents are increasingly writing code, reading files, calling APIs, using credentials and touching production systems. That access makes them useful, but also risky.

Most security tools respond by putting the whole agent in a box. nolabs takes a different approach. nolabs’ open-source runtime, nono , provides lightweight, kernel-enforced sandboxing for AI agents, MCP and LLM workloads .

This sets hard boundaries around what agents can read, write, delete or contact, while creating an independent audit trail of agent actions.

nono lets teams give agents room to move, without relying on fragile prompts, constant approval pop-ups or blind trust .

When an agent tries to use a tool, access a file or connect to a network, nono checks that action against policies set in code.

The decision to allow or deny a request is enforced by the operating system kernel, not by the agent itself or by a guardrail the agent could potentially work around.

This way, if the agent is not allowed to do something, it cannot do it.

Already gaining traction with developers building and running AI agents, nono has attracted over 3,000 GitHub stars and over 70 contributors , with adoption among large enterprises and regulated-industry teams.

nono already has several endorsements from the security community, including the following nono users and contributors: James Carnegie, Staff Security Engineer, Datadog : “Datadog engineers want their agents to move fast, and we want our credentials and production systems kept safe while they do.

” Andrew Martin, CEO, Control Plane : “ Trust enforcement for agents is non-negotiable, and regulated industries have a provability problem.

We backed Sigstore because Luke understood digital trust over paper policy, and nono applies the same thinking to agent authority: lightweight, kernel-enforced boundaries, independent audit trails, and high cross-platform performance.

” Keep your agents close, but your credentials closer with Agent Tool Sandboxing Containers and microVMs can reduce risk, but they do not solve the core problem of agent authority.

If an agent has broad access to credentials, files or networks for an entire session, one bad instruction, prompt injection or mistake can still cause serious damage.

For this reason, nolabs has introduced Agent Tool Sandboxing into nono, which extends the zero trust approach to the individual tools an agent uses.

Rather than handing agents broad permissions upfront, each tool call gets its own precisely scoped authority.

That includes phantom credentials instead of real secrets, file access limited to what the tool needs, and network access confined to the endpoints it must reach. When the tool completes, that authority disappears.

Nothing inside the sandbox ever holds a real credential, and any temporary access is revoked the moment the tool call finishes.

“AI agents need authority to be useful, but giving broad access to files, credentials and production systems creates a new security problem,” said Stephen Parkinson, co-founder of nolabs. “OpenClaw was the lightbulb moment for us.

It showed how quickly an over-permissioned agent could turn a simple mistake into real operational damage.

Agents are not traditional software; they are goal-driven systems that reason, try different routes and act on behalf of people and services.

” Building on Sigstore’s open-source legacy The launch comes as enterprises face a new kind of security trade-off – developers want agents because they make work faster, while security teams worry those same agents inherit broad human permissions.

That creates a dangerous gap between what an agent needs to do and what it is able to access. nolabs launches with strong open-source and developer credibility .

Co-founders Luke Hinds and Stephen Parkinson have deep roots in these communities, with Hinds having created Sigstore while at Red Hat – which became a global standard for verifying software package provenance and is now used across major software ecosystems.

The nolabs team believes nono can provide a similar foundational security layer for AI agents.

“Sigstore worked because it made a complex security problem simple enough for developers to adopt,” says Luke Hinds, nono’s co-founder and CEO. “We want to do the same for agent security.

Developers should not have to choose between moving fast with AI and keeping systems safe. com/nolabs-ai/nono. sh. ai/contact. About nolabs nolabs is building trust infrastructure for AI.

Its open-source runtime, nono, teaches AI agents when to say no. Drawing enforceable boundaries around what agents can read, write, delete and contact, at the moment an action is attempted.

Founded in 2025 by Luke Hinds, creator of Sigstore, and Stephen Parkinson. sh.
