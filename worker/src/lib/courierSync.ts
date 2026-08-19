/**
 * Applying what the courier says to an order.
 *
 * Three callers reach this: the dashboard's refresh buttons, the webhook
 * Steadfast posts to, and the public tracking page when its stored status has
 * gone stale. They must all agree, because each of them can move an order into
 * a state that returns stock — and doing that twice would credit the same units
 * to the shelf twice.
 */

import { audit } from './http';
import { NEXT_STATUSES, label } from './checkpoints';
import { checkpointFor, courierLabel, statusByConsignment, statusByInvoice } from './steadfast';
import type { Env } from '../types';

/** The order fields every courier operation needs. */
export interface CourierOrderRow {
  id: number;
  order_no: string;
  status: string;
  consignment_id: string;
}

/**
 * Moves an order to the checkpoint a courier status justifies, if that move is
 * legal from where the order currently stands.
 *
 * Deliberately routed through the same NEXT_STATUSES table as the manual
 * dashboard control rather than writing the status directly. A courier saying
 * "cancelled" for an order already marked Returned must not restock the same
 * units again, and an external system is exactly the kind of caller that will
 * eventually say something twice.
 *
 * @returns the checkpoint moved to, or null if nothing changed.
 */
export async function applyCourierCheckpoint(
  env: Env,
  order: CourierOrderRow,
  courierStatus: string,
  actor: string,
): Promise<string | null> {
  const target = checkpointFor(courierStatus);
  if (!target || target === order.status) return null;

  const allowed = NEXT_STATUSES[order.status] ?? [];
  if (!allowed.includes(target)) return null;

  await env.DB.prepare('UPDATE orders SET status = ? WHERE id = ?').bind(target, order.id).run();
  await audit(
    env,
    actor,
    'order.courier',
    'order',
    order.id,
    `${order.order_no}: ${label(order.status)} → ${label(target)} (Steadfast said "${courierStatus}")`,
  );
  return target;
}

export interface SyncResult {
  order_no: string;
  courier_status?: string;
  courier_status_label?: string;
  moved_to?: string;
  error?: string;
}

/**
 * Asks the courier where one parcel is and records the answer.
 *
 * The raw courier status is always stored, whether or not it moves the order —
 * "on hold" and "awaiting approval" are precisely the states people need to
 * see, and they justify no checkpoint change at all.
 */
export async function syncOrderFromCourier(env: Env, order: CourierOrderRow, actor: string): Promise<SyncResult> {
  const lookup = order.consignment_id
    ? await statusByConsignment(env, order.consignment_id)
    : await statusByInvoice(env, order.order_no);

  if (!lookup.ok) return { order_no: order.order_no, error: lookup.error };
  return { ...(await recordCourierStatus(env, order, lookup.data, actor)) };
}

/**
 * Writes a courier status onto an order and moves the checkpoint if warranted.
 *
 * Split out from the lookup so the webhook can use it directly: Steadfast hands
 * the status over in the request body, and asking them to repeat it back would
 * be a pointless round trip.
 */
export async function recordCourierStatus(
  env: Env,
  order: CourierOrderRow,
  courierStatus: string,
  actor: string,
): Promise<SyncResult> {
  await env.DB.prepare(
    "UPDATE orders SET courier_status = ?, courier_synced_at = strftime('%s','now') WHERE id = ?",
  )
    .bind(courierStatus, order.id)
    .run();

  const moved = await applyCourierCheckpoint(env, order, courierStatus, actor);
  return {
    order_no: order.order_no,
    courier_status: courierStatus,
    courier_status_label: courierLabel(courierStatus),
    ...(moved ? { moved_to: moved } : {}),
  };
}
