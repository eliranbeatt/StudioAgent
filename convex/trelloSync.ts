import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

export const saveConfig = mutation({
    args: {
        projectId: v.id("projects"),
        config: v.object({
            apiKey: v.optional(v.string()),
            token: v.optional(v.string()),
            boardId: v.optional(v.string()),
            listMappings: v.any(), // { todo: listId, ... }
        }),
    },
    handler: async (ctx, args) => {
        const project = await ctx.db.get(args.projectId);
        if (!project) throw new Error("Project not found");

        // 1. Try to save global creds to User profile
        const identity = await ctx.auth.getUserIdentity();
        if (identity && identity.email && args.config.apiKey && args.config.token) {
            const user = await ctx.db.query("users")
                .withIndex("by_email", q => q.eq("email", identity.email!))
                .unique();

            if (user) {
                await ctx.db.patch(user._id, {
                    trelloCredentials: {
                        apiKey: args.config.apiKey,
                        token: args.config.token
                    }
                });
            }
        }

        // 2. Save Project Config (we can strip creds if we want, but keeping them is also fine as a fallback)
        const currentConfig = project.tasksConfiguration ?? {};
        await ctx.db.patch(args.projectId, {
            tasksConfiguration: {
                ...currentConfig,
                trelloConfig: args.config
            }
        });
    },
});

export const getConfig = query({
    args: { projectId: v.id("projects") },
    handler: async (ctx, args) => {
        const project = await ctx.db.get(args.projectId);
        const projectConfig = project?.tasksConfiguration?.trelloConfig ?? {};

        // Merge with User Global Creds
        const identity = await ctx.auth.getUserIdentity();
        if (identity && identity.email) {
            const user = await ctx.db.query("users")
                .withIndex("by_email", q => q.eq("email", identity.email!))
                .unique();

            if (user?.trelloCredentials) {
                return {
                    ...projectConfig,
                    apiKey: user.trelloCredentials.apiKey,
                    token: user.trelloCredentials.token,
                };
            }
        }

        return projectConfig || null;
    }
});

export const listBoards = action({
    args: {
        creds: v.optional(v.object({ apiKey: v.string(), token: v.string() }))
    },
    handler: async (ctx, args) => {
        const key = args.creds?.apiKey || process.env.TRELLO_API_KEY;
        const token = args.creds?.token || process.env.TRELLO_TOKEN;

        if (!key || !token) {
            throw new Error("Missing Trello Credentials");
        }

        const res = await fetch(`https://api.trello.com/1/members/me/boards?key=${key}&token=${token}&fields=name,url,shortUrl`);
        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Trello Error: ${err}`);
        }
        return await res.json();
    }
});

export const listLists = action({
    args: {
        boardId: v.string(),
        creds: v.optional(v.object({ apiKey: v.string(), token: v.string() }))
    },
    handler: async (ctx, args) => {
        const key = args.creds?.apiKey || process.env.TRELLO_API_KEY;
        const token = args.creds?.token || process.env.TRELLO_TOKEN;

        if (!key || !token) throw new Error("Missing Credentials");

        const res = await fetch(`https://api.trello.com/1/boards/${args.boardId}/lists?key=${key}&token=${token}&fields=name`);
        if (!res.ok) throw new Error("Failed to fetch lists");
        return await res.json();
    }
});

export const createBoard = action({
    args: {
        name: v.string(),
        creds: v.optional(v.object({ apiKey: v.string(), token: v.string() }))
    },
    handler: async (ctx, args) => {
        const key = args.creds?.apiKey || process.env.TRELLO_API_KEY;
        const token = args.creds?.token || process.env.TRELLO_TOKEN;

        if (!key || !token) throw new Error("Missing Credentials");

        const res = await fetch(`https://api.trello.com/1/boards/?name=${encodeURIComponent(args.name)}&defaultLists=true&key=${key}&token=${token}`, { method: "POST" });
        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Failed to create board: ${err}`);
        }
        return await res.json();
    }
});

export const sync = action({
    args: {
        projectId: v.id("projects"),
        dryRun: v.optional(v.boolean())
    },
    handler: async (ctx, args) => {
        console.log("Syncing Trello for project", args.projectId);

        const runId = await ctx.runMutation(api.trelloSync.logRunStart, { projectId: args.projectId });

        try {
            // 1. Get Config
            const config = await ctx.runQuery(api.trelloSync.getConfig, { projectId: args.projectId });
            if (!config || !config.boardId) {
                throw new Error("Trello not configured for this project.");
            }

            const key = config.apiKey || process.env.TRELLO_API_KEY;
            const token = config.token || process.env.TRELLO_TOKEN;

            if (!key || !token) throw new Error("Trello credentials missing from config and env.");

            // 2. Fetch Project Tasks
            const projectTasks = await ctx.runQuery(api.tasks.listForProject, { projectId: args.projectId });
            const tasks = projectTasks.tasks;

            // 3. Real Sync Implementation
            let created = 0;
            let updated = 0;
            let errors = 0;

            const labelsRes = await fetch(`https://api.trello.com/1/boards/${config.boardId}/labels?key=${key}&token=${token}&fields=name,color`);
            const boardLabels = labelsRes.ok ? await labelsRes.json() : [];
            const labelByName = new Map<string, any>(
                boardLabels
                    .filter((l: any) => typeof l.name === "string" && l.name.length > 0)
                    .map((l: any) => [l.name.toLowerCase(), l])
            );
            const workTypeColorMap: Record<string, string> = {
                carpentry: "orange",
                metal_fab: "red",
                paint_finish: "purple",
                printing_graphics: "blue",
                props_sculpt: "green",
                rigging_install: "black",
                transport_logistics: "yellow",
                purchasing: "sky",
                management: "lime",
            };

            const ensureLabel = async (name: string, color: string) => {
                const keyName = name.toLowerCase();
                const existing = labelByName.get(keyName);
                if (existing) return existing;
                const res = await fetch(
                    `https://api.trello.com/1/labels?name=${encodeURIComponent(name)}&color=${encodeURIComponent(color)}&idBoard=${config.boardId}&key=${key}&token=${token}`,
                    { method: "POST" }
                );
                if (!res.ok) return null;
                const createdLabel = await res.json();
                labelByName.set(keyName, createdLabel);
                return createdLabel;
            };

            // Optimization: Fetch all cards on board once
            const cardsRes = await fetch(
                `https://api.trello.com/1/boards/${config.boardId}/cards` +
                `?key=${key}&token=${token}` +
                `&fields=name,desc,idList,labels,idLabels,due,dueComplete,dueReminder,start` +
                `&checklists=all` +
                `&customFieldItems=true`
            );
            const cards = await cardsRes.json();
            const cardsByName = new Map<string, any>(cards.map((c: any) => [c.name, c]));

            for (const task of tasks) {
                const targetListId = config.listMappings[task.status ?? "todo"];
                if (!targetListId) continue; // Skip if status not mapped

                const existingCard = cardsByName.get(task.title);

                const desiredDue = typeof task.dueDate === "number" ? new Date(task.dueDate).toISOString() : null;
                const rawStart = task.plannedStartDate ?? task.startDate;
                const desiredStart = typeof rawStart === "string" && rawStart.length > 0 ? new Date(rawStart).toISOString() : null;

                let desiredLabelIds: string[] = [];
                if (task.workType) {
                    const labelName = task.workTypeLabelHe ?? task.workType;
                    const color = workTypeColorMap[task.workType] ?? "blue";
                    const label = await ensureLabel(labelName, color);
                    if (label?.id) desiredLabelIds = [label.id];
                }

                const desiredChecklistItems = Array.isArray(task.checklist) ? task.checklist : [];

                if (existingCard) {
                    // Update if moved
                    if (existingCard.idList !== targetListId) {
                        await fetch(`https://api.trello.com/1/cards/${existingCard.id}?idList=${targetListId}&key=${key}&token=${token}`, { method: "PUT" });
                        updated++;
                    }
                    const updateParams: string[] = [];
                    if (desiredDue && desiredDue !== existingCard.due) updateParams.push(`due=${encodeURIComponent(desiredDue)}`);
                    if (!desiredDue && existingCard.due) updateParams.push(`due=null`);
                    if (desiredStart && desiredStart !== existingCard.start) updateParams.push(`start=${encodeURIComponent(desiredStart)}`);
                    if (!desiredStart && existingCard.start) updateParams.push(`start=null`);
                    if (desiredLabelIds.length > 0) {
                        const currentIds = Array.isArray(existingCard.idLabels) ? existingCard.idLabels : [];
                        if (currentIds.join(",") !== desiredLabelIds.join(",")) {
                            updateParams.push(`idLabels=${encodeURIComponent(desiredLabelIds.join(","))}`);
                        }
                    }
                    if (updateParams.length > 0) {
                        await fetch(`https://api.trello.com/1/cards/${existingCard.id}?${updateParams.join("&")}&key=${key}&token=${token}`, { method: "PUT" });
                        updated++;
                    }

                    if (desiredChecklistItems.length > 0 && (!existingCard.checklists || existingCard.checklists.length === 0)) {
                        const checklistRes = await fetch(
                            `https://api.trello.com/1/cards/${existingCard.id}/checklists?name=${encodeURIComponent("Checklist")}&key=${key}&token=${token}`,
                            { method: "POST" }
                        );
                        if (checklistRes.ok) {
                            const checklist = await checklistRes.json();
                            for (const item of desiredChecklistItems) {
                                await fetch(
                                    `https://api.trello.com/1/checklists/${checklist.id}/checkItems?name=${encodeURIComponent(item.title ?? "")}&checked=${item.done ? "true" : "false"}&key=${key}&token=${token}`,
                                    { method: "POST" }
                                );
                            }
                            updated++;
                        }
                    }
                } else {
                    // Create
                    const createParams: string[] = [
                        `idList=${targetListId}`,
                        `name=${encodeURIComponent(task.title)}`,
                        `desc=${encodeURIComponent(task.description || "")}`,
                    ];
                    if (desiredDue) createParams.push(`due=${encodeURIComponent(desiredDue)}`);
                    if (desiredStart) createParams.push(`start=${encodeURIComponent(desiredStart)}`);
                    if (desiredLabelIds.length > 0) createParams.push(`idLabels=${encodeURIComponent(desiredLabelIds.join(","))}`);

                    const res = await fetch(`https://api.trello.com/1/cards?${createParams.join("&")}&key=${key}&token=${token}`, { method: "POST" });
                    if (res.ok) {
                        created++;
                        const createdCard = await res.json();
                        if (desiredChecklistItems.length > 0) {
                            const checklistRes = await fetch(
                                `https://api.trello.com/1/cards/${createdCard.id}/checklists?name=${encodeURIComponent("Checklist")}&key=${key}&token=${token}`,
                                { method: "POST" }
                            );
                            if (checklistRes.ok) {
                                const checklist = await checklistRes.json();
                                for (const item of desiredChecklistItems) {
                                    await fetch(
                                        `https://api.trello.com/1/checklists/${checklist.id}/checkItems?name=${encodeURIComponent(item.title ?? "")}&checked=${item.done ? "true" : "false"}&key=${key}&token=${token}`,
                                        { method: "POST" }
                                    );
                                }
                            }
                        }
                    } else {
                        errors++;
                    }
                }
            }

            await ctx.runMutation(api.trelloSync.logRunEnd, {
                runId,
                status: errors > 0 ? "failed" : "success",
                summary: { created, updated, errors }
            });

            return { success: true, created, updated, errors };
        } catch (e: any) {
            await ctx.runMutation(api.trelloSync.logRunEnd, {
                runId,
                status: "failed",
                summary: { error: e.message }
            });
            throw e;
        }
    }
});

// Internal logging mutations
export const logRunStart = mutation({
    args: { projectId: v.id("projects") },
    handler: async (ctx, args) => {
        return await ctx.db.insert("trelloSyncRuns", {
            projectId: args.projectId,
            startedAt: Date.now(),
            status: "running"
        });
    }
});

export const logRunEnd = mutation({
    args: {
        runId: v.id("trelloSyncRuns"),
        status: v.union(v.literal("success"), v.literal("failed")),
        summary: v.optional(v.any())
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.runId, {
            status: args.status,
            finishedAt: Date.now(),
            summary: args.summary
        });
    }
});
