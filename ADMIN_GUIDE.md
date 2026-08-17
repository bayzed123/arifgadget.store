# Arif Gadgets — Admin Dashboard Guide

Everything you can do from the dashboard, start to finish. No technical
knowledge needed.

> **বাংলায় পড়তে চাইলে** — ড্যাশবোর্ডে সাইন ইন করে বাঁ পাশের মেনুর
> **📖 বাংলা গাইড** বোতামে চাপুন, অথবা সরাসরি `/admin/guide` ঠিকানায় যান।
> পুরো প্যানেলটি সেখানে বাংলায় ব্যাখ্যা করা আছে।

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
11. [Pages, blog and press coverage](#11-pages-blog-and-press-coverage)
12. [Offer banners and the popup](#12-offer-banners-and-the-popup)
13. [Customer accounts](#13-customer-accounts)
14. [Your daily routine](#14-your-daily-routine)
15. [Common questions](#15-common-questions)

---

## 1. Signing in

Type your site address with `/admin` on the end —
`https://arifgadget.store/admin`. There is deliberately **no link to the
dashboard anywhere on the public site**, so customers never see it; bookmark
the address instead.

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
| **Minimum order qty (MOQ)** | The smallest quantity a customer may buy. **Every product is set to `1`** so anyone can buy a single piece; volume tiers still reward larger orders. Raise it only for a line you genuinely will not break a carton on. |

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

### The five delivery checkpoints

Orders move through the checkpoints a courier uses, and the customer sees
exactly these on the tracking page.

| Checkpoint | Meaning |
|---|---|
| **Pending** | Just placed. Stock is already reserved. **Not yet counted as revenue.** |
| **Order confirmed** | You called the customer and they confirmed. **Revenue and profit start counting here.** |
| **On the way** | Handed to the courier, in transit. |
| **Delivered** | Customer received it. The sale is complete. |
| **Returned** | The parcel came back. **All units return to stock and the money leaves revenue.** |
| **Cancelled** | Called off before dispatch. **Units return to stock; nothing is counted as income.** |

The orange button on each row moves the order to its next checkpoint. Work left
to right: Order confirmed → On the way → Delivered.

**Cancel** only appears while an order is *Pending* or *Order confirmed* —
before the goods leave the shop. **Returned** only appears once it is *On the
way* or *Delivered* — after the goods have gone. Checkpoints cannot be skipped
or rewound, and *Returned* and *Cancelled* are final: both have already put
stock back, so moving the order again would count those units twice.

### Returns and cancellations

Click **Cancel** (or **Returned** on a dispatched order) and confirm. Three
things happen by themselves:

1. Every unit returns to stock.
2. The stock ledger records the return with the order number.
3. The order drops out of revenue and profit.

You never have to adjust stock by hand after a return or cancellation — and if
you do, you will double-count.

### Payment proof

When a customer picks bKash, Nagad or Rocket, the checkout shows your number
for that provider, the exact amount to send, and a box for the **TrxID** from
their confirmation SMS. Whatever they type appears next to the payment method
on the **Orders** page, so you can match a payment to an order without asking.

### Every order arrives on WhatsApp

The moment an order is placed, the confirmation screen shows a green **Send
order details on WhatsApp** button. It opens WhatsApp with the whole order
already written out — items, quantities, delivery zone and charge, total,
name, phone, address, payment method and TrxID — addressed to your **Order
WhatsApp number**. The customer just presses send.

That is the fastest reliable way for you to hear about an order without
watching the dashboard. Orders are of course also in **Orders** either way;
the WhatsApp message is a notification, not the record.

### Invoices

Every order has a printable invoice at **🧾 Invoice**, reachable from the order
confirmation screen, the tracking page and the customer's account history. It
carries your shop details, the line items, the delivery zone and charge, the
payment method and TrxID, and the grand total.

**Print / Save as PDF** uses the phone or computer's own print dialog, so the
customer can keep a PDF as proof of purchase. Only someone with both the order
number and the phone number on the order can open it.

### Google Analytics

Every shopper action is reported to **Google Analytics 4** (measurement ID
`G-54HYSJY06E`, stream `15447820887`) using Google's standard e-commerce
events, so the built-in *Monetisation* and *Purchase journey* reports work with
no setup in the GA console:

| What the shopper does | Event GA4 receives |
|---|---|
| Opens any screen | `page_view` |
| Searches | `search` |
| Sees a product list | `view_item_list` |
| Opens a product | `view_item` |
| Taps *Shop now* | `select_item` |
| Taps *Add to cart* | `add_to_cart` |
| Opens the cart | `view_cart` |
| Removes a line | `remove_from_cart` |
| Reaches checkout | `begin_checkout` |
| Picks a delivery area | `add_shipping_info` (Inside / Outside Dhaka) |
| Picks a payment method | `add_payment_info` |
| **Completes an order** | **`purchase`** |
| Registers / signs in | `sign_up` / `login` |
| Taps WhatsApp | `contact` |
| Taps an offer popup | `select_promotion` |

`purchase` carries the order number as `transaction_id`, so GA4 will not
double-count a refreshed confirmation page, and you can reconcile GA against
the dashboard order by order. Amounts are sent in **taka**, with delivery
reported separately from goods.

Two things are deliberately **not** measured: anything on `/admin`, so your own
clicking never looks like customer behaviour, and anything on a developer's
machine, so test traffic never reaches the shop's property.

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
| **Delivery inside Dhaka** | Charged when the shopper picks *Inside Dhaka* at checkout. Currently ৳90. |
| **Delivery outside Dhaka** | Charged everywhere else in Bangladesh. Currently ৳130. |
| **Free delivery over** | Order value that makes delivery free. A progress bar in the cart nudges customers toward it. Set it to `0` to switch free delivery off completely, so every order pays the ৳90 / ৳130 charge. |
| **bKash / Nagad / Rocket number** | Shown to the customer, with step-by-step instructions, when they pick that method at checkout. |
| **Bank transfer details** | Shown when a customer picks bank transfer. |
| **Order WhatsApp number** | Where the *Send order details on WhatsApp* button sends orders. Full international form, e.g. `8801400290828`. |
| **Tax percentage** | Applied to the order value. Leave at `0` if you do not charge tax. |

Enter money in taka — the system stores it precisely behind the scenes.

The **Footer build credits** shown at the bottom of that panel are fixed. They
are displayed for reference but cannot be edited from the dashboard by any role,
and the API rejects any attempt to change them.

The **Activity log** beside the settings shows every change any staff member has
made: products created, prices edited, stock adjusted, orders moved.

---

## 11. Pages, blog and press coverage

**Content** is where everything that is not a product lives. It has four tabs.

**Pages** — the About Us and Policy links in the footer. Thirteen are already
written for you: About Us, Corporate, Careers, Complain / Advice, Contact Us,
FAQs, and the seven policies (Privacy, EMI and Payment, Warranty, Delivery,
Pre-Order, Refund, Return). Click **Edit** on any of them to rewrite the text in
your own words. The **Group** field decides which footer column the link sits
in — *company* for About Us, *policy* for Policy. Turn **Published** off to hide
a page without deleting it; the footer link disappears with it.

**Blog** — write posts for the `/blog` section. Give each post a title, a short
excerpt and the body. Posts appear newest first the moment you publish them.

**Press** — every time a newspaper, YouTube channel or Facebook page covers the
shop, add it here: the outlet name, the headline, the link and a thumbnail
image. It shows up automatically on `/press`, in the footer and on the customer
account page. Links must start with `http://` or `https://` — anything else is
refused.

Writing in these boxes: a line starting with `## ` becomes a heading, `- `
becomes a bullet, and `**text**` becomes bold. Nothing else is needed.

---

## 12. Offer banners and the popup

**Offers & popup** in the left menu controls the promotion that greets
shoppers. (It is the same screen as the *Offers* tab under Content — it has its
own menu entry because it was too easy to miss as a tab.)

Click **+ New offer** and fill in:

| Field | What it does |
|---|---|
| **Title** | The big line in the popup, e.g. *Eid mega carton sale*. |
| **Subtitle** | One sentence of detail underneath. |
| **Image** | Optional picture across the top of the popup. |
| **Link** | Where the button goes — a path like `/catalog?sort=discount`, or a full `https://` address. |
| **Button label** | The words on the button. Defaults to *Shop the offer*. |
| **Show as** | *Popup only*, *Homepage strip only*, or both. |
| **Starts / Ends** | Optional dates. Outside the window the offer hides itself. |
| **Sort order** | Lower numbers show first when several offers are live. |
| **Active** | The on/off switch. |

How customers see it:

- The popup appears about a second after the page loads, so it never blocks the
  first look at the shop.
- Each shopper sees a given offer **once**. After they close it, it stays closed
  on that phone or computer — a popup that returns on every page is an
  annoyance, not a promotion.
- It never appears on the cart, checkout, account, tracking or admin pages. A
  customer in the middle of paying is not interrupted.
- The homepage strip and the customer's account page show live offers as small
  cards, so people who closed the popup can still find the deal.

To stop an offer immediately, set **Active** to off — no need to delete it. To
run it again later, switch it back on.

---

## 13. Customer accounts

Customers can now register with their mobile number and a password. They are
never forced to: guest checkout still works exactly as before, and guests track
their orders with an order number plus their phone number.

What an account gives them:

- **Their own order history** at `/account` — every order, its total and its
  current status, with a link straight into tracking.
- **Saved details** — name, email, delivery address and city. These fill the
  checkout form in automatically next time.
- **Offer updates** — live offers appear on their account page, and recent press
  coverage alongside them.

What it gives you: orders placed by a signed-in customer are linked to that
account. When somebody registers with a number they have ordered with before,
their earlier guest orders are attached to the new account automatically, so
their history is complete from day one.

**Customers** in the left menu lists every registered account: name, mobile
number, email if they gave one, saved delivery address and city, how many orders
they have placed, how much they have spent on confirmed orders, when they joined
and when they last signed in. Click any name to expand that account's full order
history underneath. The search box matches name, number, email or city — the
last few digits of a mobile number are enough.

Guests who ordered without an account are not on that page; their orders are in
**Orders** like any other.

You never see a password — passwords are stored scrambled and cannot be read
back by anyone, including you. If a customer forgets theirs, take the order over
the phone as a guest order.

Every product card carries two buttons, so both kinds of shopper are served:

- **Shop now** takes that one product straight to checkout, on its own. Anything
  already in the cart is left untouched and a notice on the checkout page offers
  a link back to it.
- **Add to cart** keeps the customer browsing so they can pile up several
  products and check out once.

---

## 14. Your daily routine

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

## 15. Common questions

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
