# Arif Gadgets — Admin Dashboard Guide

Everything you can do from the dashboard, start to finish. No technical
knowledge needed.

**Contents**

1. [Signing in](#1-signing-in)
2. [The dashboard at a glance](#2-the-dashboard-at-a-glance)
3. [Adding a product](#3-adding-a-product)
4. [Volume price tiers](#4-volume-price-tiers)
5. [Product photos](#5-product-photos)
6. [Editing and removing products](#6-editing-and-removing-products)
7. [Changing stock](#7-changing-stock)
8. [Handling orders](#8-handling-orders)
9. [Inventory and restocking](#9-inventory-and-restocking)
10. [Store settings](#10-store-settings)
11. [Your daily routine](#11-your-daily-routine)
12. [Common questions](#12-common-questions)

---

## 1. Signing in

Go to your site and click **Admin** in the top-right corner, or add `/admin` to
the web address.

| | |
|---|---|
| **Username** | `arifgadget` |
| **Password** | set when the site was deployed |

The username is not case-sensitive — `ArifGadget` works too.

**Change the password after your first sign-in.** The password was shared in a
chat message while the site was being built, so treat it as known to others.
To change it, update the `ADMIN_PASSWORD` secret in GitHub
(*Settings → Secrets and variables → Actions*) and re-run the **Deploy**
workflow. The next deploy resets the password to the new value.

A session lasts **12 hours**, then you are asked to sign in again. Use **Sign
out** at the bottom of the left menu when you finish on a shared computer.

---

## 2. The dashboard at a glance

The first screen after signing in. The **7d / 30d / 90d** buttons at the
top-right change the period every number on the page refers to.

### Top row — how the business is doing

| Tile | What it means |
|---|---|
| **Revenue** | Money from orders that reached *confirmed* or beyond. Pending and cancelled orders are not counted. |
| **Gross profit** | Revenue minus what the goods cost you. The "margin" underneath is profit as a percentage. |
| **Orders** | How many orders, and how many individual units. |
| **Avg order value** | Revenue ÷ orders. Tells you whether customers are buying bigger baskets. |

Under each number is a green ▲ or red ▼ comparing it with the *previous* period
of the same length. "no prior data" means the shop wasn't running that far back
yet — it is not the same as zero.

### Second row — what is sitting in the warehouse

| Tile | What it means |
|---|---|
| **Stock on hand** | Total units across all active products, and what they cost you. |
| **Unrealised profit** | Profit you would make if every unit in stock sold at list price. |
| **Needs restocking** | Products that are out of stock or below their low-stock level. |
| **Catalogue** | Active products, how many you updated this period, and how many drafts. |

### Charts

- **Revenue and profit** — daily lines. Switch to **Orders** or **Units** with the
  buttons above the chart. Hover anywhere for exact figures on that day.
- **Order pipeline** — how many orders sit at each stage, and their value.
- **Top products by revenue** — your best sellers, with units and profit.
- **Revenue by category** — which departments earn the most.
- **Restock queue** — what to reorder, most urgent first.
- **Recent stock movements** — the last few stock changes and why they happened.

---

## 3. Adding a product

**Products → + New product.** Fill in the form; a panel on the right updates
your profit live as you type.

### The essential fields

| Field | Notes |
|---|---|
| **Product name** | What customers see. Be specific: "T900 Ultra 2 BIG 2.19″" beats "Smart Watch". |
| **SKU** | Your internal code. Leave blank and one is generated. **It cannot be changed later**, because past orders refer to it. |
| **Brand** | Shown above the product name on the storefront. |
| **Category** | Determines which department page it appears on. |
| **Status** | *Active* = live in the shop. *Draft* = saved but hidden. *Archived* = retired. |
| **Short summary** | One line under the title. Lead with the strongest specs. |
| **Description** | The full paragraph on the product page. |

### Pricing — all in taka (৳)

| Field | Notes |
|---|---|
| **Cost price** | What you pay your supplier. **Customers never see this.** It is what makes all the profit reporting work — always fill it in. |
| **Selling price** | The normal price customers pay. |
| **Compare-at price** | Optional. If it is higher than the selling price, the storefront shows it struck through with a discount badge. |

Watch the **Live margin** panel on the right as you type:

- **Profit per unit** — selling price minus cost.
- **Margin** — profit as a share of the selling price. Green above 25%, amber
  10–25%, red below 10%.
- **Markup** — profit as a share of what you paid.
- **Stock at cost / retail** and **Potential profit** for the quantity you hold.

If you accidentally price below cost, a red warning appears.

### Inventory

| Field | Notes |
|---|---|
| **Opening stock** | How many you have right now. Only settable when creating; afterwards use the stock dialog (see §7). |
| **Low-stock threshold** | When stock falls to this number the product joins the restock queue. Set it to roughly a week of sales. |
| **Minimum order qty (MOQ)** | The smallest quantity a customer may buy. Use `1` for retail items, higher for carton-only lines. |

### Finishing

Add **Specifications** (label/value pairs shown as a table) and **Tags**
(comma-separated words that help search find the product). Tick **Feature on the
homepage** to include it in *Best sellers*. Then click **Create product**.

---

## 4. Volume price tiers

This is what makes the shop work like Alibaba: the more a customer buys, the
lower the price per unit — automatically, with no coupon codes.

In the editor, under **Volume price tiers**, click **+ Add tier** and enter a
minimum quantity and the unit price at that quantity.

**Example — T900 Ultra 2:**

| You enter | Customer buying | Pays each |
|---|---|---|
| *(base selling price ৳1,150)* | 5–19 | ৳1,150 |
| Min qty `20`, price `1060` | 20–59 | ৳1,060 |
| Min qty `60`, price `980` | 60–149 | ৳980 |
| Min qty `150`, price `930` | 150+ | ৳930 |

The storefront shows this as a table on the product page and highlights the row
the customer currently qualifies for. The cart re-prices itself the moment they
change the quantity, and the correct tier price is locked into the order.

Two rules to keep in mind:

- Tiers must go **down** as quantity goes up, or customers will be confused.
- Keep the deepest tier above your cost price. The Live margin panel only checks
  the base price, not the tiers.

---

## 5. Product photos

In the editor, use the **Image** panel on the right:

- **Upload image** — pick a file from your computer or phone. JPEG, PNG, WebP,
  AVIF or SVG, up to 5 MB. It uploads to Cloudflare storage and is served fast
  worldwide.
- **Or paste a URL** — if the photo already lives somewhere online.

Products without a photo show a clean generated illustration based on their
category, so the shop never looks broken. Replace these with real photos as you
take them — product photos sell.

**Tips:** shoot square, on a plain background, in daylight. Around
1000×1000 pixels is plenty.

**If "Upload image" reports that storage is off:** R2 storage has not been
enabled on the Cloudflare account yet. Everything else in the shop still works.
Either paste an image URL instead, or ask whoever manages the Cloudflare
account to enable **R2** in the dashboard and re-run the Deploy workflow.

---

## 6. Editing and removing products

**Products** lists everything with cost, price, margin, stock and stock value.
Filter with the search box, the status dropdown or the stock-level dropdown.

- **Edit** — opens the same form. Change anything except the SKU.
- **🗑 (archive)** — hides the product from the storefront.

**There is no delete, and that is deliberate.** Archiving keeps the product
attached to every past order, so your sales history and profit reports stay
correct. To bring an archived product back, filter by *Archived*, click **Edit**
and set Status to *Active*.

---

## 7. Changing stock

Click the **stock number** on any row in the Products table (or **Restock** in
the inventory queue). A dialog opens showing the current count, what it will
become, and the full history for that product.

Choose how to change it:

- **Add / remove** — enter how many arrived or left. Enter a negative number to
  remove.
- **Set exact count** — enter the true number after a physical stock count.

Then pick a **reason**, which is the important part:

| Reason | Use it when |
|---|---|
| **Restock** | A delivery arrived from your supplier. |
| **Return** | A customer sent goods back in sellable condition. |
| **Damage** | Units are broken or lost. Always removes stock. |
| **Adjustment** | Correcting a miscount. |

Add a **note** — the supplier invoice number, or where the goods are shelved.
Months later this is what tells you why the number moved.

Every change is written to a permanent ledger with your username and the time.
You cannot edit stock any other way, which is what keeps the ledger honest.

---

## 8. Handling orders

**Orders** lists every order, newest first. Click the order number to expand it
and see the line items, what each cost you, and the profit on each line.

### The stages

| Stage | Meaning |
|---|---|
| **Pending** | Just placed. Stock is already reserved. **Not yet counted as revenue.** |
| **Confirmed** | You called the customer and they confirmed. **Revenue starts counting here.** |
| **Packed** | Boxed and labelled. |
| **Shipped** | Handed to the courier. |
| **Delivered** | Customer received it. Order complete. |
| **Cancelled** | Order dropped. **All units go back into stock automatically.** |
| **Refunded** | Money returned after delivery. **Units go back into stock automatically.** |

The blue button on each row moves the order to its next stage. Work left to
right: Confirm → Packed → Shipped → Delivered.

### Cancelling and refunding

Click **Cancel** (or **Refund** on a delivered order) and confirm. Three things
happen by themselves:

1. Every unit returns to stock.
2. The stock ledger records the return with the order number.
3. The order drops out of revenue and profit.

You never have to adjust stock by hand after a cancellation — and if you do,
you will double-count.

### Finding an order

Use the search box for an order number, customer name or phone number. The
status buttons filter the list.

---

## 9. Inventory and restocking

**Inventory** is the warehouse view.

- **Units on hand / Capital tied up / Retail value / Unrealised profit** — how
  much money is sitting on your shelves.
- **Restock queue** — out of stock first, then low stock. The *Reorder cost*
  column estimates what it costs to bring each item up to twice its threshold.
  Click **Restock** to record a delivery straight from here.
- **Dead stock** — products in stock that sold nothing in 30 days. Money stuck
  on a shelf. Consider discounting these or bundling them.
- **Stock ledger** — every stock change ever made, with reason, note and who did
  it. This is your audit trail.

---

## 10. Store settings

**Settings** controls how the shop behaves. Changes apply to the next order.

| Setting | Effect |
|---|---|
| **Store name / Tagline** | Shown around the site. |
| **Support phone / email** | Displayed in the header and footer, clickable on phones. |
| **Currency code / symbol** | `BDT` and `৳` by default. |
| **Flat delivery charge** | What customers pay for delivery below the free threshold. |
| **Free delivery over** | Order value that makes delivery free. A progress bar in the cart nudges customers toward it. |
| **Tax percentage** | Applied to the order value. Leave at `0` if you do not charge tax. |

Enter money in taka — the system stores it precisely behind the scenes.

The **Activity log** beside the settings shows every change any staff member has
made: products created, prices edited, stock adjusted, orders moved.

---

## 11. Your daily routine

**Every morning**

1. Open the **Dashboard**. Check yesterday's revenue and the order pipeline.
2. Go to **Orders**, filter by **Pending**. Call each customer and mark them
   **Confirmed**.

**Through the day**

3. Move confirmed orders to **Packed**, then **Shipped** as they go out.
4. Mark orders **Delivered** once the courier reports delivery.

**Every evening**

5. Check the **Restock queue** on the dashboard. Order anything that is out or
   low.
6. When a delivery arrives, record it with **Restock** and the invoice number.

**Every week**

7. Switch the dashboard to **7d** and look at *Top products* — push what sells.
8. Check **Dead stock** in Inventory and decide what to discount.
9. Review margins in **Products**. Anything red is losing you money.

---

## 12. Common questions

**A customer says the price changed when they added more.**
That is the volume tier working. Larger quantities get a lower unit price. The
product page shows the full tier table.

**Why is my revenue lower than my sales?**
Revenue only counts orders at *confirmed* or beyond. Pending orders are not
income yet. Cancelled and refunded orders are removed.

**I cancelled an order — do I add the stock back?**
No. It is already back. Adding it again would double your stock.

**A product shows "Out of stock" but I have units.**
The system only knows what it was told. Open the stock dialog, choose **Set
exact count**, enter the real number and pick *Adjustment*.

**Can I change a SKU?**
No. Past orders point at it. Create a new product and archive the old one.

**Why can't I edit stock in the product form?**
So every change carries a reason and lands in the ledger. Use the stock dialog.

**Two staff members changed the same thing.**
Check the **Activity log** in Settings — it records who did what and when.

**Someone ordered the last item twice.**
They cannot. The database refuses any order that would take stock below zero;
the second customer sees "someone just bought the last of one of these items".

**A customer wants to track their order.**
They need the order number and the phone number they ordered with, at the
**Track order** link in the site header.

**I forgot my password.**
Update the `ADMIN_PASSWORD` secret in GitHub and re-run the **Deploy** workflow.
