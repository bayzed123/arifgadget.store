-- Starter content for every company and policy page. Written to be usable as
-- published text on day one, and edited from the dashboard afterwards.
-- Body format is the light markdown the storefront renders: ## headings,
-- - bullets, **bold**, [links](url), blank line between paragraphs.

INSERT OR IGNORE INTO pages (slug, title, section, sort_order, summary, body) VALUES
('about-us', 'About Us', 'company', 10,
 'Who we are and how Arif Gadgets started.',
'Arif Gadgets is a wholesale and retail gadget supplier based at Zirani, BKSP, Ashulia, Savar, Dhaka. We supply phones, audio, wearables, chargers and accessories to shopkeepers, resellers and walk-in customers across Bangladesh.

## Our owner

The business is owned and run by **Ariful Islam Arif**. What began as a single counter selling smartwatches and earphones now serves retailers nationwide, shipping by the carton at prices that let our partners make a real margin.

## What we do differently

- **Factory-direct pricing.** We buy in volume and pass the saving on, so there is no middleman markup between the importer and your shelf.
- **Tiered pricing that is automatic.** The more units on an order line, the lower the unit price. No haggling, no coupon codes; the price on the product page is the price you pay.
- **Live stock.** The number you see is the number in the warehouse, updated on every sale and every delivery.
- **We stand behind what we sell.** Seven-day returns on sealed units and a straightforward warranty process.

## Visit us

Come and see the stock in person. We are open six days a week and happy to talk through what sells best for your kind of shop.');

INSERT OR IGNORE INTO pages (slug, title, section, sort_order, summary, body) VALUES
('corporate', 'Corporate', 'company', 20,
 'Bulk supply, institutional orders and reseller partnerships.',
'We supply gadgets in volume to businesses, institutions and resellers across Bangladesh.

## Bulk and corporate orders

If you are buying for a company, a school, an NGO or an event, we can quote for quantity and arrange delivery on a schedule that suits you. Typical corporate work includes staff handsets, gift items, conference giveaways and IT accessories.

- Written quotations for tender and procurement
- Invoices with full company details
- Delivery scheduled in batches where required
- Dedicated contact for the duration of the order

## Reseller partnerships

Shop owners buying regularly can be set up as reseller partners. Partners get first call on new stock, priority allocation when supply is tight, and pricing at our deepest published tier regardless of order size.

## How to start

Call us on the numbers listed under Contact Us, or message us on WhatsApp with what you need and the quantity. We usually respond within the same working day.');

INSERT OR IGNORE INTO pages (slug, title, section, sort_order, summary, body) VALUES
('careers', 'Careers', 'company', 30,
 'Work with us at Arif Gadgets.',
'We are a small team and we hire when the work demands it, not on a schedule.

## The kind of people who do well here

- Comfortable with customers, on the phone and at the counter
- Careful with stock and honest with numbers
- Willing to learn the products properly, so advice given is advice worth taking

## Roles that come up

- **Sales assistant** — counter sales, customer calls, order confirmation
- **Warehouse and packing** — receiving deliveries, stock counts, order packing
- **Delivery coordination** — courier bookings, tracking, returns
- **Online support** — WhatsApp and Facebook enquiries, order follow-up

## How to apply

Send your CV and a short note about yourself to the email address on the Contact Us page, or bring it to the shop in person. Tell us which role interests you and when you can start. We read everything that arrives, and we reply to candidates we want to meet.');

INSERT OR IGNORE INTO pages (slug, title, section, sort_order, summary, body) VALUES
('complain-advice', 'Complain / Advice', 'company', 40,
 'Tell us when something goes wrong, and how we can do better.',
'If something went wrong with an order, we want to hear it directly rather than read it later in a review.

## Making a complaint

Contact us with:

- Your order number
- The phone number you ordered with
- What happened, in your own words
- Photographs, if the problem is with the product or the packaging

We aim to acknowledge every complaint within one working day and to resolve it within three. If a resolution will take longer, we will tell you why and give you a date.

## What we will do

- **Wrong item sent** — we collect it and send the correct one at our cost
- **Damaged in transit** — replaced or refunded once we see the photographs
- **Faulty unit** — handled under the Warranty Policy
- **Late delivery** — we chase the courier and keep you informed

## Advice and suggestions

If you have an idea for stock we should carry, a service we should offer, or something on this site that is hard to use, tell us. Suggestions from shopkeepers who sell our products every day are the most useful feedback we get.');

INSERT OR IGNORE INTO pages (slug, title, section, sort_order, summary, body) VALUES
('contact-us', 'Contact Us', 'company', 50,
 'Phone, WhatsApp, email and our shop address.',
'We are reachable by phone, WhatsApp and email, and you are welcome at the shop.

## Talk to us

The fastest route is WhatsApp — use the green button in the corner of any page. For orders in progress, have your order number ready.

Phone lines are open during shop hours. If we do not pick up we are with a customer; leave a message and we will call back.

## Visit the shop

Our address and phone numbers are in the footer of every page on this site. Come and see the stock before you commit to a carton; most of our regular partners started with a visit.

## Business enquiries

For bulk quotations, tenders and reseller partnerships, see the Corporate page.

## Following an order

Use Order Tracking with your order number and the phone number you ordered with. If the status looks wrong, contact us rather than reordering.');

INSERT OR IGNORE INTO pages (slug, title, section, sort_order, summary, body) VALUES
('faqs', 'FAQs', 'company', 60,
 'Common questions about ordering, pricing, delivery and returns.',
'## Ordering

**Is there a minimum order?**
It depends on the product. Each item shows its minimum order quantity (MOQ) on its page. Many items are MOQ 1; carton lines are higher.

**Why did the price change when I increased the quantity?**
That is volume pricing working as intended. Every product with tiers shows the full table on its page, and the cart re-prices automatically.

**Do I need an account?**
No. Checkout asks only for the details needed to deliver your order.

## Payment

**How can I pay?**
Cash on delivery, bKash, Nagad, Rocket, or bank transfer for wholesale accounts.

**Do you offer EMI?**
See the EMI and Payment Policy page.

## Delivery

**How long does delivery take?**
We dispatch within 48 hours of confirming an order. Courier transit is usually one to three days depending on district.

**How much is delivery?**
৳90 inside Dhaka and ৳130 anywhere else in Bangladesh. You choose your zone at checkout and the total updates straight away.

## After the sale

**Something arrived faulty.**
See the Warranty Policy, or contact us with photographs.

**Can I return something I simply did not want?**
Sealed, unopened units can be returned within seven days. See the Return Policy.');

-- ---------------------------------------------------------------- policies

INSERT OR IGNORE INTO pages (slug, title, section, sort_order, summary, body) VALUES
('privacy-policy', 'Privacy Policy', 'policy', 10,
 'What we collect, why, and what we never do with it.',
'We collect the minimum needed to sell you something and deliver it.

## What we collect

- **Order details** — name, phone number, delivery address, and email if you give one
- **Order history** — what you bought, when, and its status
- **Nothing else.** We do not require an account, and we do not build advertising profiles.

## Why we collect it

To confirm your order by phone, deliver it, handle warranty and returns, and answer questions about past purchases. Your phone number also acts as the key that lets you track your own order.

## Who we share it with

- **Courier companies**, limited to the name, address and phone number needed to deliver
- **Mobile payment providers**, when you choose bKash, Nagad or Rocket
- Nobody else. We do not sell customer data.

## How long we keep it

Order records are kept as long as we are trading, because warranty claims and accounts depend on them.

## Your choices

Ask us to correct anything wrong in your records at any time. If you want your contact details removed after a sale is closed, tell us and we will do it, keeping only what the sales record requires.

## Payment details

We never see or store your bKash, Nagad, Rocket or card credentials. Those transactions happen with the provider, and we only record that payment was made.');

INSERT OR IGNORE INTO pages (slug, title, section, sort_order, summary, body) VALUES
('emi-and-payment-policy', 'EMI and Payment Policy', 'policy', 20,
 'Accepted payment methods and how instalments work.',
'## Accepted payment methods

- **Cash on delivery** — pay the courier when your order arrives
- **bKash** — send money, then share the transaction ID
- **Nagad** — send money, then share the transaction ID
- **Rocket** — Dutch-Bangla mobile banking
- **Bank transfer** — for wholesale and corporate accounts

## Confirming mobile payments

After sending money, share the transaction ID with us on WhatsApp along with your order number. We confirm the order once the payment shows in our account, usually within the hour during shop hours.

## Cash on delivery

Available nationwide. Check the item in front of the courier before paying where the courier allows it. For high-value orders we may ask for partial advance payment.

## EMI

Instalment plans are offered through partner banks on selected higher-value items and are subject to that bank''s approval, not ours. Where EMI is available on a product we will say so.

- The bank sets the tenure, interest and eligibility
- Approval is between you and the bank
- The item ships once the bank confirms the transaction

Ask us before ordering if EMI matters to your decision, so we can tell you what is currently available.

## Pricing and invoices

All prices are in Bangladeshi Taka and include any applicable tax shown at checkout. Invoices with full business details are available for corporate orders on request.');

INSERT OR IGNORE INTO pages (slug, title, section, sort_order, summary, body) VALUES
('warranty-policy', 'Warranty Policy', 'policy', 30,
 'What is covered, for how long, and how to claim.',
'## What is covered

Manufacturing defects — a unit that fails in normal use through no fault of yours. Warranty length varies by product and brand and is stated on the product page or the box.

## What is not covered

- Physical damage, cracks, bends and impact marks
- Water or liquid damage, unless the product is rated against it
- Burn damage from a non-standard charger or unstable mains supply
- Units opened, modified or repaired by anyone other than us or the brand service centre
- Normal wear: battery capacity loss over time, strap and cable wear, scratches
- Missing serial number or removed warranty sticker

## How to claim

1. Contact us with your order number and a description of the fault.
2. Send photographs or a short video showing the problem.
3. We tell you whether to bring the unit in or send it by courier.
4. We inspect it, and repair, replace or refuse the claim with a reason.

Keep the box and accessories. Claims are much simpler with the original packaging.

## Turnaround

Most claims are settled within seven to fourteen working days. Where the brand service centre is involved it can take longer, and we will tell you when we know.

## Bulk and reseller claims

Resellers should batch warranty units rather than sending them one at a time. Include a list of order numbers and faults so we can process the batch together.');

INSERT OR IGNORE INTO pages (slug, title, section, sort_order, summary, body) VALUES
('delivery-policy', 'Delivery Policy', 'policy', 40,
 'Dispatch times, charges and coverage across Bangladesh.',
'## Dispatch

Orders are dispatched within 48 hours of confirmation. Confirmation happens when we reach you by phone, or when a mobile payment clears.

## Delivery time

- **Dhaka city** — usually one to two days after dispatch
- **Outside Dhaka** — usually two to four days after dispatch
- Remote areas and public holidays can add time

These are courier estimates, not guarantees. We chase late deliveries on your behalf.

## Charges

Delivery is charged by zone, which you choose at checkout:

- **Inside Dhaka** — ৳90
- **Anywhere else in Bangladesh** — ৳130

The charge appears in your cart before you order. Bulk and carton orders may be quoted separately where weight or volume demands it.

## Coverage

We deliver nationwide through courier partners. Where a courier cannot reach an address, we will contact you to arrange the nearest pickup point.

## Receiving your order

- Check the packaging before accepting it
- Where the courier allows, open and check the item before paying
- Report transit damage the same day, with photographs

## Failed deliveries

If the courier cannot reach you after repeated attempts, the parcel returns to us and we will contact you. Repeated failed cash-on-delivery attempts may mean we ask for advance payment on future orders.');

INSERT OR IGNORE INTO pages (slug, title, section, sort_order, summary, body) VALUES
('pre-order-policy', 'Pre-Order Policy', 'policy', 50,
 'How pre-orders work and when you are charged.',
'A pre-order reserves stock that has not yet arrived in our warehouse.

## How it works

1. You place a pre-order on an item marked as such.
2. We confirm the expected arrival window.
3. When the stock lands, we contact you before shipping.
4. The order ships in the normal way.

## Advance payment

Pre-orders usually require partial advance payment to reserve the unit, particularly on high-value or limited-allocation items. The balance is due on delivery.

## Expected dates are estimates

Arrival windows depend on shipment and customs, both outside our control. If the date moves we will tell you as soon as we know, and you can wait or cancel.

## Cancelling a pre-order

- Cancel any time before dispatch for a **full refund of your advance**
- Refunds are returned by the same method you paid within seven working days

## If we cannot supply

Occasionally an allocation is cut or a model is withdrawn. If we cannot fulfil your pre-order we will refund your advance in full and, where we can, offer the nearest alternative at a fair price.

## Price at the time of delivery

The price agreed when you pre-ordered is the price you pay, even if the market price rises before the stock arrives. If the price falls, you pay the lower price.');

INSERT OR IGNORE INTO pages (slug, title, section, sort_order, summary, body) VALUES
('refund-policy', 'Refund Policy', 'policy', 60,
 'When you get money back, and how long it takes.',
'## When a refund applies

- We cannot supply an item you have paid for
- A pre-order is cancelled before dispatch
- An approved return under the Return Policy
- A warranty claim we cannot repair or replace
- You were charged twice for one order

## How refunds are paid

Refunds go back the way the money came:

- **bKash, Nagad, Rocket** — returned to the number you paid from
- **Bank transfer** — returned to the originating account
- **Cash on delivery** — refunded by mobile money or in cash at the shop, your choice

## Timing

Approved refunds are issued within **seven working days**. Mobile money usually lands the same day it is sent; bank transfers can take a further two to three working days.

## Deductions

- Delivery charges are refunded only where the fault was ours
- Returns under the change-of-mind window are refunded less the original delivery charge
- Items returned incomplete or damaged may be refunded in part, and we will explain the figure before processing

## What we need from you

Your order number, the phone number you ordered with, and the account or number the refund should go to. We confirm every refund by message when it is sent.');

INSERT OR IGNORE INTO pages (slug, title, section, sort_order, summary, body) VALUES
('return-policy', 'Return Policy', 'policy', 70,
 'Seven-day returns on sealed units, and what cannot be returned.',
'## The seven-day window

Sealed, unopened units can be returned within **seven days** of delivery for a refund or exchange. The unit must be in the condition it arrived in, with all packaging, accessories and documentation.

## What cannot be returned

- Opened or used items, unless faulty
- Items with damaged, torn or missing packaging
- Products with a removed serial number or warranty sticker
- Items damaged after delivery
- Clearance stock sold as-is, where stated on the product page

## Faulty items

A faulty item can be returned whether or not it is sealed. See the Warranty Policy for how that works — the seven-day rule does not limit your warranty.

## How to return

1. Contact us within seven days with your order number and the reason.
2. We confirm whether the return is accepted and how to send it.
3. Pack the item as it arrived, with everything that came in the box.
4. Once we receive and check it, we process the refund or exchange.

## Return shipping

- **Our mistake** — wrong item, faulty unit, transit damage: we pay
- **Change of mind** — you pay the return shipping, and the original delivery charge is not refunded

## Bulk orders

Carton returns must be complete and unopened. Part-used cartons cannot be returned. Contact us before sending anything back so we can log it against your account.');
