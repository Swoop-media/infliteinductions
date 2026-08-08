---
name: Wedged prod VM diagnosis
description: How to tell a Supabase incident from a wedged production VM, and why timeouts alone can't save a broken VM
---
# Wedged prod VM diagnosis

Rule: when prod shows continuous healthcheck failures + outbound TimeoutErrors, probe Supabase from the workspace first. If Supabase responds fast from the workspace but prod can't reach it AND prod's `/` healthcheck times out (a path that skips all Supabase calls), the VM itself is wedged (sockets/fd/network state) — the only fix is a republish to get a fresh instance.

**Why:** On 8 Aug 2026 the prod VM was down ~9h with nonstop healthcheck deadline errors while Supabase was healthy; in-app fetch timeouts were firing correctly but couldn't restore service. Replit VM deployments do NOT auto-restart on failed healthchecks — a wedged process stays wedged until republished.

**How to apply:** Distinguish the two failure modes before touching code: (1) Supabase incident → app-level timeouts contain it, brief degradation only; (2) VM wedge → republish immediately, no code change fixes it. If wedges recur on fresh VMs, suspect a socket/agent leak in the app (e.g. undici keep-alive under repeated aborts) and investigate then.
