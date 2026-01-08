import { internalMutation } from "./_generated/server";

export const backfillElementRevs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const elements = await ctx.db.query("elements").collect();
    let count = 0;
    for (const el of elements) {
      if (el.rev === undefined) {
        await ctx.db.patch(el._id, { rev: 1 });
        count++;
      }
    }
    return `Backfilled ${count} elements with rev=1`;
  },
});