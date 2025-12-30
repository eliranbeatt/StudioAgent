type ReservationStatus = "active" | "overbooked" | "cancelled" | "fulfilled";

type ReserveStockArgs = {
  projectId: any;
  inventoryItemId: any;
  elementId?: any;
  materialLineId?: string;
  qty: number;
};

export async function computeAvailability(ctx: any, inventoryItemId: any) {
  const item = await ctx.db.get(inventoryItemId);
  if (!item) {
    throw new Error("Inventory item not found");
  }

  const existingReservations = await ctx.db
    .query("inventoryReservations")
    .withIndex("by_item", (q: any) => q.eq("inventoryItemId", inventoryItemId))
    .filter((q: any) =>
      q.and(
        q.neq(q.field("status"), "cancelled"),
        q.neq(q.field("status"), "fulfilled")
      )
    )
    .collect();

  const totalReserved = existingReservations.reduce(
    (sum: number, res: any) => sum + (res.qty ?? 0),
    0
  );

  return {
    item,
    totalReserved,
    available: item.onHandQty - totalReserved,
  };
}

export async function findExistingReservation(
  ctx: any,
  args: { projectId: any; inventoryItemId: any; materialLineId?: string }
) {
  const reservations = await ctx.db
    .query("inventoryReservations")
    .withIndex("by_project", (q: any) => q.eq("projectId", args.projectId))
    .filter((q: any) => q.eq(q.field("inventoryItemId"), args.inventoryItemId))
    .collect();

  return reservations.find((res: any) => {
    const sameLine =
      args.materialLineId !== undefined
        ? res.materialLineId === args.materialLineId
        : res.materialLineId === undefined || res.materialLineId === null;
    return sameLine && res.status !== "cancelled" && res.status !== "fulfilled";
  });
}

export async function reserveStockInternal(
  ctx: any,
  args: ReserveStockArgs,
  options?: { allowOverbook?: boolean }
) {
  const { available } = await computeAvailability(ctx, args.inventoryItemId);
  const availableAfter = available - args.qty;
  const allowOverbook = options?.allowOverbook ?? false;

  if (!allowOverbook && args.qty > available) {
    return {
      reserved: false,
      status: "overbooked" as ReservationStatus,
      availableAfter,
    };
  }

  const status: ReservationStatus = args.qty > available ? "overbooked" : "active";
  const resId = await ctx.db.insert("inventoryReservations", {
    projectId: args.projectId,
    inventoryItemId: args.inventoryItemId,
    elementId: args.elementId,
    materialLineId: args.materialLineId,
    qty: args.qty,
    status,
    computedAvailableAfter: availableAfter,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  return { reserved: true, resId, status, availableAfter };
}
