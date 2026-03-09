# Data System

## Source of truth

Convex is the single source of truth for:

- projects
- SDK runs and messages
- qaPairs
- ChangeSets
- durable project context documents

## Access path

The package never calls the app UI.

All reads and writes go through:

- `projects:*`
- `changeSets:*`
- `sdk/api:*`
- `sdk/projectPlanning:*`
- `sdk/dispatch:*`
- `sdk/changeset:*`
- `sdk/knowledge:*`

## Sticky session model

Local session state only stores routing and continuity helpers:

- active project
- current mode
- planning run/conversation ids
- pending approval state

It is not authoritative business data.
