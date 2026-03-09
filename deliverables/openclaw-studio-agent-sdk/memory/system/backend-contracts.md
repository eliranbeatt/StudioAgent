# Backend Contracts

## Project lookup

- `projects:listProjects`

## Context packs

- `sdk/api:contextGet`
- `sdk/api:contextGetCounts`

## Free chat

- `sdk/api:createConversation`
- `sdk/api:startRun`
- `sdk/dispatch:runNext`
- `sdk/api:listRuns`
- `sdk/api:listMessages`

## Planning flow

- `sdk/projectPlanning:submitBrainDump`
- `sdk/projectPlanning:initiatePlanning`
- `sdk/projectPlanning:getQuestionSets`
- `sdk/projectPlanning:submitAnswers`
- `sdk/projectPlanning:finalizeProject`
- `sdk/projectPlanning:getFinalizationProgress`

## ChangeSets

- `changeSets:get`
- `changeSets:listForProject`
- `changeSets:applyChangeSet`
- `changeSets:discardChangeSet`
- `sdk/changeset:compile`
- `sdk/changeset:review`
- `sdk/api:approveChangeSet`

## Knowledge

- `sdk/knowledge:summarizeOrUpdate`
